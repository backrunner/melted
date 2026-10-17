// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from "node:test";
import assert from "node:assert/strict";
import { validRoute } from "../../src/plugins/rsshub/routes.js";
import fixture from "../../../contracts/fixtures/rsshub-feed.json" with { type: "json" };
import { normalizeFeed } from "../../src/plugins/rsshub/json-feed.js";
import { sourceInputSchema } from "../../src/modules/sources/schemas.js";
import {
  failed,
  newRun,
  newSource,
  publicRun,
} from "../../src/modules/sources/lifecycle.js";
import { pollRSSHub, retryAfter } from "../../src/plugins/rsshub/collector.js";
import { rsshubConfigSchema } from "../../src/plugins/rsshub/config.js";
import {
  collectorEnabled,
  executableBuiltin,
} from "../../src/plugins/index.js";
import { manifestSchema } from "../../src/modules/plugins/compatibility.js";

test("conflicting IDs are partial instead of repeatedly changing revisions", async () => {
  const items = [
    { id: "same", content_text: "first" },
    { id: "same", content_text: "first" },
    { id: "same", content_text: "second" },
    { id: "valid", content_text: "kept" },
  ];
  const result = await normalizeFeed({ ...fixture, items });
  assert.deepEqual(
    result.items.map((i) => i.content.external_id),
    ["valid"],
  );
  assert.deepEqual(
    result.warnings,
    [0, 1, 2].map((index) => ({ index, code: "conflicting_external_id" })),
  );
  assert.equal(
    (await normalizeFeed({ ...fixture, items: items.slice(0, 2) })).warnings
      .length,
    0,
  );
});

test("nonportable Unicode is rejected per item and at source configuration", async () => {
  const result = await normalizeFeed({
    ...fixture,
    items: [
      { id: "null-byte", content_text: "before\u0000after" },
      { id: "surrogate", content_text: "\ud800" },
      { id: "author", content_text: "ok", authors: [{ name: "\udfff" }] },
      { id: "valid", content_text: "中文 📚" },
    ],
  });
  assert.deepEqual(
    result.items.map((i) => i.content.external_id),
    ["valid"],
  );
  assert.equal(result.warnings.length, 3);
  for (const name of ["x\u0000", "\ud800"])
    assert.equal(
      sourceInputSchema.safeParse({
        name,
        plugin: "rsshub",
        config_version: 1,
        configuration: { route: "/bbc" },
      }).success,
      false,
    );
  for (const route of ["/bbc/%00", "/bbc/\u0000", "/bbc/\ud800", "/bbc/%7f"])
    assert.equal(validRoute(route), false);
});

test("impossible calendar dates and lossy numeric identifiers remain invalid", async () => {
  const result = await normalizeFeed({
    ...fixture,
    items: [
      {
        id: "calendar",
        content_text: "x",
        date_published: "2026-02-30T12:00:00Z",
      },
      { id: Number.MAX_SAFE_INTEGER + 1, content_text: "x" },
      {
        id: 42,
        content_text: "x",
        date_published: "2024-02-29T12:00:00+08:00",
      },
    ],
  });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]!.content.external_id, "42");
  assert.equal(
    result.items[0]!.content.published_at,
    "2024-02-29T04:00:00.000Z",
  );
  assert.equal(result.warnings.length, 2);
});

test("switching instance or credentials does not reuse validators from another target", async () => {
  const source = newSource(
    {
      name: "News",
      plugin: "rsshub",
      config_version: 1,
      configuration: { route: "/bbc" },
      enabled: true,
      interval_seconds: 900,
    },
    Date.now(),
  );
  const config = rsshubConfigSchema.parse({
    base_url: "https://first.example.org",
    allowed_routes: ["/bbc"],
  });
  const initial = await pollRSSHub(source, config, undefined, (async () =>
    Response.json(fixture, { headers: { ETag: '"cached"' } })) as typeof fetch);
  for (const next of [
    { ...config, base_url: "https://other.example.org" },
    { ...config, access_key: "different-secret" },
  ]) {
    let conditional: string | null = "unset";
    await pollRSSHub(
      { ...source, checkpoint: initial.checkpoint },
      next,
      undefined,
      (async (_url, init) => {
        conditional = new Headers(init?.headers).get("If-None-Match");
        return Response.json(fixture);
      }) as typeof fetch,
    );
    assert.equal(conditional, null);
  }
});

test("runtime registration fails closed for incomplete, duplicate or unknown enabled plugins", () => {
  const manifest = manifestSchema.parse({
    id: "rsshub",
    version: "1.0.0",
    runtime: "builtin",
    targets: ["node", "cloudflare"],
    capabilities: ["https"],
  });
  assert.equal(executableBuiltin({ ...manifest, capabilities: [] }), false);
  assert.equal(
    collectorEnabled({ plugins: [{ enabled: true, manifest }] }),
    true,
  );
  assert.equal(
    collectorEnabled({
      plugins: [
        { enabled: true, manifest },
        { enabled: true, manifest },
      ],
    }),
    false,
  );
  assert.equal(
    collectorEnabled({
      plugins: [
        { enabled: true, manifest },
        { enabled: true, manifest: { ...manifest, id: "unknown" } },
      ],
    }),
    false,
  );
  assert.equal(
    collectorEnabled({ plugins: [{ enabled: "true", manifest }] }),
    false,
  );
});

test("inherited feed metadata cannot expand the normalized batch without a bound", async () => {
  const result = await normalizeFeed({
    ...fixture,
    authors: Array.from({ length: 60 }, () => ({ name: "a".repeat(1000) })),
    items: Array.from({ length: 100 }, (_, i) => ({
      id: String(i),
      content_text: "x",
    })),
  });
  assert(result.items.length > 0 && result.items.length < 100);
  assert(result.warnings.every((w) => w.code === "batch_too_large"));
  assert(
    result.items.reduce(
      (n, i) => n + Buffer.byteLength(JSON.stringify(i.content)),
      0,
    ) <=
      4 * 1024 * 1024,
  );
});

test("extreme Retry-After stays representable after the response is committed", () => {
  const requestedAt = Date.parse("2026-10-17T12:00:00Z");
  const source = newSource(
    {
      name: "News",
      plugin: "rsshub",
      config_version: 1,
      configuration: { route: "/bbc" },
      enabled: true,
      interval_seconds: 900,
    },
    requestedAt,
  );
  const run = {
    ...newRun(source, "manual", "manual:test", requestedAt),
    attempts: 1,
  };
  const next = failed(
    run,
    {
      code: "upstream_http_429",
      retryable: true,
      retry_after_ms: retryAfter("999999999999999", requestedAt),
    },
    requestedAt + 1000,
  );
  assert.equal(next.state, "queued");
  assert.equal(next.available_at, 8.64e15);
  assert.equal(publicRun(next).next_retry_at, "+275760-09-13T00:00:00.000Z");
});
