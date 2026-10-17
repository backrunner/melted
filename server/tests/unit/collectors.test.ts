// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import fixture from "../../../contracts/fixtures/rsshub-feed.json" with { type: "json" };
import { normalizeFeed } from "../../src/plugins/rsshub/json-feed.js";
import { validRoute, authorizeRoute } from "../../src/plugins/rsshub/routes.js";
import { newSource } from "../../src/modules/sources/lifecycle.js";
import {} from "../../src/modules/sources/schemas.js";
import { rsshubConfigSchema } from "../../src/plugins/rsshub/config.js";
import {
  pollRSSHub,
  CollectorError,
  retryAfter,
} from "../../src/plugins/rsshub/collector.js";
import {
  collectorEnabled,
  pluginRegistry,
  executableBuiltin,
} from "../../src/plugins/index.js";
import { manifestSchema } from "../../src/modules/plugins/compatibility.js";
import { collectionDisclosure } from "../../src/modules/collectors/disclosure.js";

const config = rsshubConfigSchema.parse({
  base_url: "https://feeds.example.org",
  allowed_routes: ["/bbc", "/douban/book/latest"],
});
const source = newSource(
  {
    name: "News",
    plugin: "rsshub",
    config_version: 1,
    configuration: { route: "/bbc" },
    interval_seconds: 900,
    enabled: true,
  },
  Date.now(),
);
const transport = (
  fn: (url: URL, init: RequestInit) => Response | Promise<Response>,
) =>
  ((url: unknown, init: RequestInit) =>
    fn(new URL(String(url)), init)) as typeof fetch;
test("collection disclosure tracks destinations without exposing instance secrets", async () => {
  assert.deepEqual(
    (await collectionDisclosure({}, pluginRegistry)).destinations,
    [],
  );
  const manifest = await collectionDisclosure(
    { rsshub: { ...config, access_key: "sensitive-key" } },
    pluginRegistry,
  );
  assert.equal(manifest.destinations[0]!.origin, config.base_url);
  assert.equal(JSON.stringify(manifest).includes("sensitive-key"), false);
  assert.equal(
    manifest.version,
    (await collectionDisclosure({ rsshub: config }, pluginRegistry)).version,
  );
  assert.notEqual(
    manifest.version,
    (
      await collectionDisclosure(
        { rsshub: { ...config, base_url: "https://other.example.org" } },
        pluginRegistry,
      )
    ).version,
  );
});
test("JSON Feed preserves provenance and untrusted HTML, never invents dates or downloads media", async () => {
  const first = await normalizeFeed(fixture),
    second = await normalizeFeed(fixture);
  assert.equal(first.items.length, 3);
  assert.deepEqual(first, second);
  assert.equal(
    first.items[0]!.content.published_at,
    "2026-10-17T00:00:00.000Z",
  );
  assert.equal(first.items[1]!.content.published_at, null);
  assert.equal(first.items[1]!.content.media[0]!.mime_type, "audio/mpeg");
  const hostile = await normalizeFeed({
    ...fixture,
    items: [
      {
        id: "script",
        content_html: "<script>alert(1)</script><p>raw evidence</p>",
      },
    ],
  });
  assert.match(hostile.items[0]!.content.parts[0]!.text, /<script>/);
  const changed = await normalizeFeed({
    ...fixture,
    items: [{ ...fixture.items[0], title: "修订" }],
  });
  assert.notEqual(first.items[0]!.content_hash, changed.items[0]!.content_hash);
});
test("invalid items are partial, empty feed is successful and limits are enforced", async () => {
  const result = await normalizeFeed({
    ...fixture,
    items: [
      fixture.items[0],
      {},
      { id: "bad", content_text: "x", url: "javascript:alert(1)" },
      { id: "large", content_text: "x".repeat(256 * 1024) },
    ],
  });
  assert.equal(result.items.length, 1);
  assert.equal(result.warnings.length, 3);
  assert.equal(
    (await normalizeFeed({ ...fixture, items: [] })).items.length,
    0,
  );
  await assert.rejects(normalizeFeed({ items: [] }));
  const inherited = await normalizeFeed({
    ...fixture,
    authors: Array.from({ length: 100 }, () => ({
      name: "x".repeat(1000),
      url: "https://example.org/" + "a".repeat(4000),
    })),
    items: [{ id: "bounded", content_text: "x" }],
  });
  assert.equal(inherited.items.length, 0);
  assert.equal(inherited.warnings[0]!.code, "item_too_large");
  const capped = await normalizeFeed({
    ...fixture,
    items: Array.from({ length: 101 }, (_, i) => ({
      id: String(i),
      content_text: "x",
    })),
  });
  assert.equal(capped.items.length, 100);
  assert.equal(capped.warnings[0]!.code, "item_limit");
});
test("routes cannot escape the configured instance, prefix or credential boundary", () => {
  for (const route of [
    "https://evil.test/",
    "//evil.test/a",
    "/bbc/../secrets",
    "/bbc/%2e%2e/a",
    "/bbc/%252e%252e/a",
    "/bbc\\evil",
    "/bbc?a=1",
    "/bbc/%3fkey=secret",
  ])
    assert.equal(validRoute(route), false, route);
  assert.doesNotThrow(() => authorizeRoute(config, "/bbc/world-asia"));
  assert.throws(() => authorizeRoute(config, "/bbcevil"));
  assert.throws(() =>
    rsshubConfigSchema.parse({
      base_url: "http://127.0.0.1:1200",
      allowed_routes: ["/bbc"],
    }),
  );
  assert.doesNotThrow(() =>
    rsshubConfigSchema.parse({
      base_url: "http://127.0.0.1:1200",
      allowed_routes: ["/bbc"],
      allow_private: true,
    }),
  );
});
test("conditional requests, 304, credentials and redirects use the actual fetch boundary", async () => {
  let calls = 0;
  const authenticated = { ...config, access_key: "secret" };
  const previous = await pollRSSHub(
    source,
    authenticated,
    undefined,
    transport(() => Response.json(fixture, { headers: { ETag: '"old"' } })),
  );
  const result = await pollRSSHub(
    { ...source, checkpoint: previous.checkpoint },
    authenticated,
    undefined,
    transport((url, init) => {
      calls++;
      assert.equal(url.origin, config.base_url);
      assert.equal(url.searchParams.get("format"), "json");
      assert.equal(url.searchParams.get("limit"), "100");
      assert.equal(url.searchParams.get("key"), "secret");
      assert.equal(new Headers(init.headers).get("If-None-Match"), '"old"');
      assert.equal(init.redirect, "manual");
      return Response.json(fixture, { headers: { ETag: '"new"' } });
    }),
  );
  assert.equal(calls, 1);
  assert.equal(result.checkpoint.etag, '"new"');
  assert.equal(
    (
      await pollRSSHub(
        { ...source, checkpoint: result.checkpoint },
        authenticated,
        undefined,
        transport(() => new Response(null, { status: 304 })),
      )
    ).not_modified,
    true,
  );
  await assert.rejects(
    pollRSSHub(
      source,
      config,
      undefined,
      transport(() => new Response(null, { status: 304 })),
    ),
    /unexpected_not_modified/,
  );
  await assert.rejects(
    pollRSSHub(
      source,
      config,
      undefined,
      transport(
        () =>
          new Response(null, {
            status: 302,
            headers: { Location: "https://evil.test" },
          }),
      ),
    ),
    /upstream_http_302/,
  );
});
test("429, auth failures, malformed payload, body bounds, timeout and network errors remain distinguishable", async () => {
  await assert.rejects(
    pollRSSHub(
      source,
      config,
      undefined,
      transport(
        () =>
          new Response(null, {
            status: 429,
            headers: { "Retry-After": "120" },
          }),
      ),
    ),
    (e: unknown) =>
      e instanceof CollectorError &&
      e.failure.retryable &&
      e.failure.retry_after_ms === 120000,
  );
  await assert.rejects(
    pollRSSHub(
      source,
      config,
      undefined,
      transport(() => new Response(null, { status: 403 })),
    ),
    (e: unknown) =>
      e instanceof CollectorError &&
      e.failure.blocked === true &&
      !e.failure.retryable,
  );
  await assert.rejects(
    pollRSSHub(
      source,
      config,
      undefined,
      transport(() => new Response("not json")),
    ),
    /invalid_feed/,
  );
  await assert.rejects(
    pollRSSHub(
      source,
      config,
      undefined,
      transport(() => new Response("x".repeat(4 * 1024 * 1024 + 1))),
    ),
    /response_too_large/,
  );
  await assert.rejects(
    pollRSSHub(
      source,
      config,
      undefined,
      transport(() => {
        throw new Error("https://x?key=secret");
      }),
    ),
    (e: unknown) => e instanceof Error && e.message === "upstream_unavailable",
  );
  await assert.rejects(
    pollRSSHub(
      source,
      config,
      undefined,
      transport(
        (_url, init) =>
          new Promise((_resolve, reject) =>
            init.signal!.addEventListener("abort", () =>
              reject(new Error("aborted")),
            ),
          ),
      ),
      5,
    ),
    /collector_timeout/,
  );
  assert.equal(
    retryAfter(
      "Wed, 21 Oct 2026 07:28:00 GMT",
      Date.parse("2026-10-21T07:27:00Z"),
    ),
    60000,
  );
});
test("only installed builtins with known version are executable", () => {
  assert.equal(collectorEnabled(), true);
  const m = manifestSchema.parse({
    id: "rsshub",
    version: "1.0.0",
    targets: ["node", "cloudflare"],
    runtime: "builtin",
    capabilities: ["https"],
  });
  assert.equal(executableBuiltin(m), true);
  assert.equal(executableBuiltin({ ...m, id: "unknown" }), false);
  assert.equal(executableBuiltin({ ...m, version: "999" }), false);
});
