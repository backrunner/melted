// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from "node:test";
import assert from "node:assert/strict";
import { bech32 } from "@scure/base";
import { BlueskyCollector } from "../../src/plugins/bluesky/plugin.js";
import { FediverseCollector } from "../../src/plugins/fediverse/plugin.js";
import { NostrCollector } from "../../src/plugins/nostr/plugin.js";
import { publicKey } from "../../src/plugins/nostr/config.js";
import { newSource } from "../../src/modules/sources/lifecycle.js";
import { CollectorError } from "../../src/modules/plugins/sdk/index.js";
import { pluginRegistry } from "../../src/plugins/index.js";
import { collectionDisclosure } from "../../src/modules/collectors/disclosure.js";
import { bluesky, fediverse, event, pubkey } from "../fixtures/social.js";
import operator from "../../../contracts/fixtures/social-operator.json" with { type: "json" };
const source = (
  plugin: string,
  configuration: Record<string, string | number | boolean>,
) =>
  newSource(
    {
      plugin,
      config_version: 1,
      configuration,
      name: plugin,
      enabled: true,
      interval_seconds: 900,
    },
    Date.now(),
  );

test("social plugins publish finite native configurations, server-only credentials and exact destinations", async () => {
  const configured = {
    ...operator,
    fediverse: {
      instances: [
        { origin: "https://mastodon.social", access_token: "server-secret" },
      ],
    },
  };
  const catalog = pluginRegistry.catalog(configured);
  for (const id of ["bluesky", "fediverse", "nostr"]) {
    const p = catalog.plugins.find((p) => p.id === id)!;
    assert(p.available);
    assert.equal(p.collection.layout, "table");
    assert.equal(p.actions.length, 2);
  }
  assert(!JSON.stringify(catalog).includes("server-secret"));
  const disclosure = await collectionDisclosure(configured, pluginRegistry);
  assert(
    disclosure.destinations.some((d) => d.origin === "wss://relay.damus.io"),
  );
  assert(!JSON.stringify(disclosure).includes("server-secret"));
  assert.throws(() =>
    new BlueskyCollector().configure({ service_url: "http://127.0.0.1" }),
  );
  assert.throws(() =>
    new FediverseCollector().configure({
      instances: [{ origin: "https://127.1" }],
    }),
  );
  assert.throws(() =>
    new NostrCollector().configure({
      relays: [{ url: "wss://user:secret@relay.damus.io" }],
    }),
  );
  for (const [plugin, config] of [
    [
      new BlueskyCollector(),
      { service_url: "http://127.0.0.1", allow_private: true },
    ],
    [
      new FediverseCollector(),
      { instances: [{ origin: "http://127.0.0.1", allow_private: true }] },
    ],
    [
      new NostrCollector(),
      { relays: [{ url: "ws://127.0.0.1", allow_private: true }] },
    ],
  ] as const) {
    assert.equal(plugin.deploymentErrors(config, "node").length, 0);
    assert.equal(plugin.deploymentErrors(config, "cloudflare").length, 1);
  }
});
test("Bluesky maps stable post identity, media and dates, filters replies/reposts and records partial failures", async () => {
  let data: unknown = bluesky();
  let target = "";
  const plugin = new BlueskyCollector(async (url, init) => {
    target = String(url);
    assert.equal(init?.redirect, "manual");
    return Response.json(data);
  }).configure({});
  const s = source("bluesky", { target: "bsky.app" });
  const first = await plugin.poll(s);
  assert.equal(first.items.length, 1);
  assert.equal(first.items[0]!.content.language, "zh");
  assert.equal(first.items[0]!.content.media.length, 1);
  assert.match(target, /getAuthorFeed\?actor=bsky.app/);
  data = bluesky("修订");
  const second = await plugin.poll(s);
  assert.equal(first.items[0]!.external_key, second.items[0]!.external_key);
  assert.notEqual(first.items[0]!.content_hash, second.items[0]!.content_hash);
  const original = bluesky().feed[0]!;
  data = {
    feed: [
      original,
      { ...original, reason: {} },
      {
        ...original,
        post: {
          ...original.post,
          record: { ...original.post.record, reply: {} },
        },
      },
      { post: {} },
    ],
  };
  const partial = await plugin.poll(
    source("bluesky", { target: "bsky.app", include_replies: false }),
  );
  assert.equal(partial.items.length, 1);
  assert.equal(partial.warnings.length, 1);
  const noDate = bluesky();
  delete (noDate.feed[0]!.post.record as Record<string, unknown>).createdAt;
  data = noDate;
  assert.equal((await plugin.poll(s)).items[0]!.content.published_at, null);
  data = { feed: [] };
  assert.equal((await plugin.poll(s)).received, 0);
  await plugin.poll(
    source("bluesky", {
      mode: "feed",
      target:
        "at://did:plc:abcdefghijklmnopqrstuvwx/app.bsky.feed.generator/culture",
    }),
  );
  assert.match(target, /getFeed\?feed=/);
  for (const value of ["https://evil.org", "user", "bsky.app/?admin"])
    assert.throws(() => plugin.validate({ target: value }));
  data = { error: "no" };
  await assert.rejects(plugin.poll(s), /invalid_social_response/);
});
test("Fediverse pins lookup and statuses to authorized instance, protects token, skips non-public posts and retains revisions", async () => {
  let data: unknown = fediverse(),
    calls = 0;
  const p = new FediverseCollector(async (input, init) => {
    calls++;
    const u = new URL(String(input));
    assert.equal(u.origin, "https://mastodon.social");
    assert.equal(init?.redirect, "manual");
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer secret",
    );
    return Response.json(
      u.pathname.endsWith("lookup")
        ? { id: "123", url: "https://evil.org/" }
        : data,
    );
  }).configure({
    instances: [{ origin: "https://mastodon.social", access_token: "secret" }],
  });
  const s = source("fediverse", {
    instance: "https://mastodon.social",
    target: "writer@remote.example.org",
  });
  assert.equal((await p.poll(s)).items[0]!.content.parts[0]!.kind, "html");
  assert.equal(calls, 2);
  data = [
    ...fediverse(),
    { ...fediverse()[0], visibility: "private" },
    { ...fediverse()[0], visibility: undefined },
    { ...fediverse()[0], edited_at: "bad" },
    { ...fediverse()[0], content: "x".repeat(256 * 1024 + 1) },
  ];
  const partial = await p.poll(s);
  assert.equal(partial.items.length, 1);
  assert.equal(partial.warnings.length, 3);
  data = [];
  await p.poll(
    source("fediverse", {
      instance: "https://mastodon.social",
      mode: "hashtag",
      target: "文化",
    }),
  );
  assert.throws(() =>
    p.validate({ instance: "https://evil.org", target: "writer" }),
  );
  assert.throws(() => p.validate({ target: "../private" }));
  assert.throws(() => p.validate({ target: "art", max_items: 100 }));
});
test("social HTTP errors preserve retry policy and never disclose upstream bodies or tokens", async () => {
  for (const status of [301, 401, 403, 429, 500]) {
    const p = new BlueskyCollector(
      async () =>
        new Response("private upstream text", {
          status,
          headers: { "Retry-After": "17" },
        }),
    ).configure({});
    await assert.rejects(
      p.poll(source("bluesky", { target: "bsky.app" })),
      (e: unknown) => {
        assert(e instanceof CollectorError);
        assert.equal(e.failure.retryable, status >= 500 || status === 429);
        assert.equal(e.failure.retry_after_ms, 17000);
        assert(!e.message.includes("private"));
        return true;
      },
    );
  }
  const p = new BlueskyCollector(async () => {
    throw new Error("secret in URL");
  }).configure({});
  await assert.rejects(
    p.poll(source("bluesky", { target: "bsky.app" })),
    /upstream_unavailable/,
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    p.poll(source("bluesky", { target: "bsky.app" }), controller.signal),
    /collector_cancelled/,
  );
});
test("Nostr accepts npub, verifies hash/signature/filter, ignores relay hints and rejects forged events as partial", async () => {
  const npub = bech32.encode(
    "npub",
    bech32.toWords(
      Uint8Array.from(pubkey.match(/../g)!, (x) => parseInt(x, 16)),
    ),
  );
  assert.equal(publicKey(npub), pubkey);
  assert.throws(() =>
    publicKey(bech32.encode("nsec", bech32.toWords(new Uint8Array(32)))),
  );
  let values: unknown[] = [event()];
  const p = new NostrCollector(async (url, filter) => {
    assert.equal(url, "wss://relay.damus.io/");
    assert.deepEqual(filter.authors, [pubkey]);
    return values;
  }).configure(operator.nostr);
  const s = source("nostr", { relay: "wss://relay.damus.io/", target: npub });
  const first = await p.poll(s);
  assert.equal(first.items.length, 1);
  values = [
    event(),
    { ...event(), content: "forged" },
    { ...event(), sig: "00".repeat(64) },
    event({ kind: 30023, tags: [["d", "article"]] }),
    event({ pubkey: "00".repeat(32) }),
  ];
  const partial = await p.poll(s);
  assert.equal(partial.items.length, 1);
  assert.equal(partial.warnings.length, 4);
  assert.throws(() =>
    p.validate({ target: "nsec1secret", relay: "wss://relay.damus.io/" }),
  );
  assert.throws(() =>
    p.validate({ target: pubkey, relay: "wss://unauthorized.example.org/" }),
  );
});
test("Nostr long-form uses address identity and newest verified revision with independent publication time", async () => {
  const tags = [
    ["d", "culture"],
    ["title", "文化"],
    ["published_at", "1700000000"],
  ];
  const old = event({ kind: 30023, tags }),
    newer = event({
      kind: 30023,
      tags,
      created_at: 1720000010,
      content: "修订",
    });
  let values: unknown[] = [old];
  const p = new NostrCollector(async () => values).configure(operator.nostr),
    s = source("nostr", {
      target: pubkey,
      relay: "wss://relay.damus.io/",
      kind: "articles",
    });
  const first = await p.poll(s);
  values = [old, newer, { ...newer, created_at: 1720000020 }];
  const next = await p.poll(s);
  assert.equal(next.items.length, 1);
  assert.equal(next.warnings.length, 1);
  assert.equal(next.items[0]!.external_key, first.items[0]!.external_key);
  assert.notEqual(next.items[0]!.content_hash, first.items[0]!.content_hash);
  assert.equal(next.items[0]!.content.parts[0]!.text, "修订");
  assert.notEqual(
    next.items[0]!.content.published_at,
    next.items[0]!.content.modified_at,
  );
  values = [event({ kind: 30023, tags: [["d", "no-date"]] })];
  assert.equal((await p.poll(s)).items[0]!.content.published_at, null);
});
