// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from "node:test";
import assert from "node:assert/strict";
import { ExampleCollector } from "./plugin.js";
import { newSource } from "../../src/modules/sources/lifecycle.js";

test("collector boilerplate handles typed settings, partial items, secrets and stable identities", async () => {
  const collector = new ExampleCollector(async (url, options) => {
    assert.equal(
      String(url),
      "https://feeds.example.org/articles?topic=culture",
    );
    assert.equal(options?.redirect, "manual");
    assert.equal(
      new Headers(options?.headers).get("Authorization"),
      "Bearer server-secret",
    );
    return Response.json({
      items: [
        { id: "a", title: "Culture", text: "An article" },
        { broken: true },
      ],
    });
  });
  const configured = collector.configure({
    base_url: "https://feeds.example.org",
    allowed_topics: ["culture"],
    token: "server-secret",
  });
  assert(!JSON.stringify(configured.descriptor).includes("server-secret"));
  assert.throws(
    () => configured.validate({ topic: "unapproved" }),
    /topic_not_allowed/,
  );
  assert.throws(() =>
    configured.validate({
      topic: "culture",
      base_url: "https://other.invalid",
    }),
  );
  const source = newSource(
    {
      plugin: collector.descriptor.id,
      config_version: 1,
      name: "Culture",
      enabled: true,
      interval_seconds: 900,
      configuration: { topic: "culture" },
    },
    Date.now(),
  );
  const result = await configured.poll(source);
  assert.equal(result.received, 2);
  assert.deepEqual(result.warnings, [{ index: 1, code: "invalid_item" }]);
  assert.equal(result.items[0]!.content.published_at, null);
  assert.equal(
    result.items[0]!.content_hash,
    (await configured.poll(source)).items[0]!.content_hash,
  );
  await assert.rejects(
    configured.poll(source, AbortSignal.abort()),
    /collector_cancelled/,
  );
});
