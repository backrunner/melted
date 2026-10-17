// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeSyndication } from "../../src/modules/ingest/feeds/syndication.js";
import { validateResult } from "../../src/modules/ingest/result.js";
import { FeedCollector } from "../../src/plugins/feed/plugin.js";
import {
  feedConfigSchema,
  authorizeFeed,
} from "../../src/plugins/feed/config.js";
import {
  descriptorSchema,
  validateSettings,
} from "../../src/modules/plugins/dsl.js";
import { newSource } from "../../src/modules/sources/lifecycle.js";
import { pluginRegistry } from "../../src/plugins/index.js";
import { collectionDisclosure } from "../../src/modules/collectors/disclosure.js";
const url = "https://feeds.example.org/rss.xml";
const rss = await readFile("../contracts/fixtures/feed-rss.xml");
const atom = await readFile("../contracts/fixtures/feed-atom.xml");
const bytes = (v: string) => new TextEncoder().encode(v);
const operator = { allowed_origins: ["https://feeds.example.org"] };
function source() {
  return newSource(
    {
      plugin: "feed",
      config_version: 1,
      configuration: { url, format: "auto", max_items: 100 },
      name: "Feed",
      enabled: true,
      interval_seconds: 900,
    },
    Date.now(),
  );
}

test("RSS XML maps namespaces, raw HTML, authors, dates and enclosures without extra fetches", async () => {
  const result = await validateResult(await normalizeSyndication(rss, url));
  assert.equal(result.received, 2);
  assert.equal(result.warnings.length, 0);
  const item = result.items[0]!.content;
  assert.equal(item.external_id, "book-1");
  assert.equal(item.canonical_url, "https://feeds.example.org/books/1");
  assert.equal(item.published_at, "2026-10-17T00:00:00.000Z");
  assert.equal(item.language, "zh-CN");
  assert.match(item.parts[0]!.text, /<script>untrusted/);
  assert.equal(item.authors[0]!.name, "作者甲");
  assert.equal(item.media[0]!.url, "https://feeds.example.org/audio/1.mp3");
  assert.equal(item.media[0]!.size_in_bytes, 1200);
  assert.equal(result.items[1]!.content.published_at, null);
  for (const invalid of [
    "Mon, 30 Feb 2026 08:00:00 GMT",
    "2026-02-30T08:00:00Z",
    "2026-10-17",
  ]) {
    const badDate = await normalizeSyndication(
      bytes(rss.toString().replace("Sat, 17 Oct 2026 08:00:00 +0800", invalid)),
      url,
    );
    assert.equal(badDate.warnings[0]!.code, "invalid_item");
  }
  assert.deepEqual(result, await normalizeSyndication(rss, url));
});
test("Atom respects namespace identity, inherited xml:base/lang, XHTML, updated and summaries", async () => {
  const result = await validateResult(
    await normalizeSyndication(atom, url, "atom"),
  );
  const item = result.items[0]!.content;
  assert.equal(
    item.canonical_url,
    "https://feeds.example.org/notes/2026/weekend",
  );
  assert.equal(item.authors[0]!.url, "https://feeds.example.org/people/one");
  assert.equal(item.language, "zh");
  assert.equal(item.published_at, null);
  assert.equal(item.modified_at, "2026-10-17T08:00:00.000Z");
  assert.match(item.parts[0]!.text, /&amp; 阅读 <em>/);
  assert.equal(result.items[1]!.content.parts[0]!.text, "<p>只保留摘要</p>");
});
test("invalid XML, entities, deep trees, unexpected formats and HTML pages fail explicitly", async () => {
  for (const value of [
    "",
    "<html><body>not a feed</body></html>",
    "<rss version='2.0'><channel></rss>",
    "<!DOCTYPE rss SYSTEM 'https://evil.test/file'><rss version='2.0'><channel/></rss>",
    "<!DOCTYPE rss [<!ENTITY x 'abc'>]><rss version='2.0'><channel><title>&x;</title></channel></rss>",
    "<rss version='2.0'><channel><title>&unknown;</title></channel></rss>",
    "<x>".repeat(70) + "</x>".repeat(70),
    "<feed xmlns='https://evil.test/Atom'/>",
  ])
    await assert.rejects(
      normalizeSyndication(bytes(value), url),
      /invalid_feed/,
    );
  await assert.rejects(normalizeSyndication(rss, url, "atom"), /invalid_feed/);
  await assert.rejects(
    normalizeSyndication(bytes(" ".repeat(4 * 1024 * 1024 + 1)), url),
    /invalid_feed/,
  );
});
test("feed window limits are intentional, invalid entries remain partial and revisions are stable", async () => {
  const limited = await normalizeSyndication(rss, url, "rss", 1);
  assert.equal(limited.received, 1);
  assert.deepEqual(limited.warnings, []);
  const changed = await normalizeSyndication(
    bytes(rss.toString().replace("阅读与生活", "更新正文")),
    url,
  );
  assert.equal(changed.items[0]!.external_key, limited.items[0]!.external_key);
  assert.notEqual(
    changed.items[0]!.content_hash,
    limited.items[0]!.content_hash,
  );
  const partial = await validateResult(
    await normalizeSyndication(
      bytes(
        rss
          .toString()
          .replace("</channel>", "<item><guid>invalid</guid></item></channel>"),
      ),
      url,
    ),
  );
  assert.equal(partial.received, 3);
  assert.equal(partial.warnings[0]!.index, 2);
  assert.equal(
    (
      await normalizeSyndication(
        bytes(
          '<rss version="2.0"><channel><title>Empty</title></channel></rss>',
        ),
        url,
      )
    ).received,
    0,
  );
  const withoutID = bytes(
    '<rss version="2.0"><channel><item><title>Title only</title></item></channel></rss>',
  );
  assert.deepEqual(
    await normalizeSyndication(withoutID, url),
    await normalizeSyndication(withoutID, url),
  );
});
test("JSON Feed and XML encoding use the same bounded normalization contract", async () => {
  const json = bytes(
    JSON.stringify({
      version: "https://jsonfeed.org/version/1.1",
      title: "JSON",
      items: [
        { id: "a", content_text: "text" },
        { id: "b", content_html: "<p>html</p>" },
      ],
    }),
  );
  assert.equal(
    (await validateResult(await normalizeSyndication(json, url, "json", 1)))
      .received,
    1,
  );
  await assert.rejects(normalizeSyndication(json, url, "rss"));
  const latin = Buffer.from(
    '<?xml version="1.0" encoding="ISO-8859-1"?><rss version="2.0"><channel><item><guid>a</guid><title>caf\xe9</title></item></channel></rss>',
    "latin1",
  );
  assert.equal(
    (await normalizeSyndication(latin, url)).items[0]!.content.title,
    "café",
  );
});
test("Feed plugin validates URL DSL, operator origins, format, limits and multiple disclosures", async () => {
  const plugin = new FeedCollector();
  const configured = plugin.configure(operator);
  assert.deepEqual(configured.validate({ url }), {
    url,
    format: "auto",
    max_items: 100,
  });
  for (const invalid of [
    "/feed",
    "https://user:secret@feeds.example.org/a",
    "https://feeds.example.org/#frag",
    "https://feeds.example.org/white space",
    "https://feeds.example.org/%GG",
    "file:///etc/passwd",
    "https://feeds.example.org\\@localhost/a",
  ])
    assert.throws(() =>
      validateSettings(configured.descriptor.form, { url: invalid }),
    );
  for (const invalid of [
    "http://feeds.example.org/a",
    "https://feeds.example.org.evil.org/a",
    "https://127.0.0.1/a",
    "https://elsewhere.example.org/a",
  ])
    assert.throws(
      () => configured.validate({ url: invalid }),
      /feed_origin_not_allowed/,
    );
  assert.throws(() => configured.validate({ url, max_items: 101 }));
  assert.throws(() => configured.validate({ url, format: "html" }));
  const privateConfig = feedConfigSchema.parse({
    private_origins: ["http://127.0.0.1:1234"],
  });
  assert.equal(
    authorizeFeed(privateConfig, "http://127.0.0.1:1234/feed").port,
    "1234",
  );
  assert.equal(plugin.deploymentErrors(privateConfig, "cloudflare").length, 1);
  assert.throws(() =>
    feedConfigSchema.parse({ allowed_origins: ["https://127.1"] }),
  );
  for (const invalid of ["not a URL", "https://[", "/feed", "https://127.1"])
    assert.equal(
      feedConfigSchema.safeParse({ allowed_origins: [invalid] }).success,
      false,
    );
  assert.equal(
    feedConfigSchema.safeParse({
      ...operator,
      suggestions: [{ value: "https://[", label: "Invalid" }],
    }).success,
    false,
  );
  const config = {
    feed: {
      allowed_origins: [
        "https://feeds.example.org",
        "https://culture.example.org",
      ],
    },
  };
  const disclosure = await collectionDisclosure(config, pluginRegistry);
  assert.equal(disclosure.destinations.length, 2);
  assert(disclosure.destinations.every((d) => d.id === "feed"));
  assert.notEqual(
    disclosure.version,
    (await collectionDisclosure({ feed: operator }, pluginRegistry)).version,
  );
  const descriptor = descriptorSchema.parse(
    plugin.configure(operator).descriptor,
  );
  assert.equal(descriptor.collection.add_from_suggestions, undefined);
  assert.equal(descriptor.collection.preset_catalog, undefined);
  const urlField = descriptor.form.fields.find((f) => f.id === "url");
  assert(urlField?.type === "text");
  assert.equal(urlField.suggestions, undefined);
});
test("Feed collector revalidates target and binds validators to URL, format and item window", async () => {
  let headers: Headers | undefined,
    calls = 0,
    notModified = false;
  const plugin = new FeedCollector(async (_input, init) => {
    calls++;
    headers = new Headers(init?.headers);
    assert.equal(init?.redirect, "manual");
    return notModified
      ? new Response(null, { status: 304 })
      : new Response(rss, { headers: { ETag: '"v1"' } });
  }).configure(operator);
  const s = source();
  const first = await plugin.poll(s);
  notModified = true;
  const replay = await plugin.poll({ ...s, checkpoint: first.checkpoint });
  assert.equal(headers?.get("If-None-Match"), '"v1"');
  assert(replay.not_modified);
  for (const configuration of [
    { ...s.configuration, url: "https://feeds.example.org/other" },
    { ...s.configuration, max_items: 1 },
    { ...s.configuration, format: "rss" },
  ]) {
    await assert.rejects(
      plugin.poll({ ...s, configuration, checkpoint: first.checkpoint }),
      /unexpected_not_modified/,
    );
    assert.equal(headers?.get("If-None-Match"), null);
  }
  const before = calls;
  await assert.rejects(
    plugin.poll({
      ...s,
      configuration: { ...s.configuration, url: "https://evil.test/feed" },
    }),
  );
  assert.equal(calls, before);
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(plugin.poll(s, aborted.signal), /collector_cancelled/);
  assert.equal(calls, before);
});
