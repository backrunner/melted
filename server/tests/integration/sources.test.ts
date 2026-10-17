// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import fixture from "../../../contracts/fixtures/rsshub-feed.json" with { type: "json" };
import { connect } from "../../src/storage/postgres/connection.js";
import { migrate } from "../../src/storage/postgres/migrations.js";
import { PostgresRepository } from "../../src/storage/postgres/repository.js";
import { CloudRepository } from "../../src/storage/cloudflare/repository.js";
import type { CloudBindings } from "../../src/storage/cloudflare/bindings.js";
import type { Repository } from "../../src/storage/repository.js";
import type {
  Claim,
  PollResult,
  SourceInput,
} from "../../src/modules/sources/types.js";
import { configSchema } from "../../src/config/schema.js";
import { createApp } from "../../src/http/app.js";
import { hash, random } from "../../src/shared/crypto.js";
import { normalizeFeed } from "../../src/plugins/rsshub/json-feed.js";

if (
  !process.env.MELTED_TEST_DATABASE_URL ||
  process.env.MELTED_TEST_DATABASE_URL === process.env.DATABASE_URL
)
  throw new Error("Use a dedicated test database");
const { database, pool } = connect(process.env.MELTED_TEST_DATABASE_URL),
  pg = new PostgresRepository(database);
const rsshub = {
  base_url: "https://rsshub.example.org",
  allowed_routes: ["/bbc", "/douban/book/latest"],
};
const bindings = {
  MELTED_SERVER_ID: "collection-test",
  MELTED_OPERATOR: "test",
  PUBLIC_ORIGIN: "http://localhost",
  RSSHUB_CONFIG: JSON.stringify(rsshub),
};
const mf = new Miniflare(
  convertV4MiniflareOptions({
    name: "collection-parity",
    modules: true,
    scriptPath: ".wrangler/test-build/worker.js",
    compatibilityDate: "2026-10-14",
    compatibilityFlags: ["nodejs_compat"],
    durableObjects: {
      ACCOUNTS: { className: "AccountStore", useSQLite: true },
      CONTROL: { className: "ControlStore", useSQLite: true },
    },
    bindings,
  }),
);
after(() => mf.dispose());
after(() => pool.end());
const config = configSchema.parse({
    serverID: bindings.MELTED_SERVER_ID,
    operator: "test",
    publicOrigin: "http://localhost",
    rsshub,
  }),
  app = createApp();
const input: SourceInput = {
  name: "公开文化与新闻",
  plugin: "rsshub",
  config_version: 1,
  configuration: { route: "/bbc" },
  enabled: true,
  interval_seconds: 900,
};

for (const target of ["PostgreSQL", "SQLite DO"] as const)
  test(`${target}: collection contracts, revisions, recovery and ownership`, async (t) => {
    await migrate(database);
    const repository: Repository =
        target === "PostgreSQL"
          ? pg
          : new CloudRepository(await mf.getBindings<CloudBindings>()),
      sources = repository.sources;
    const owner = "acc_" + (await hash(random())),
      other = "acc_" + (await hash(random()));
    const session = await repository.managedSession(owner),
      stranger = await repository.managedSession(other);
    const send = async (
      path: string,
      method = "GET",
      body?: unknown,
      key?: string,
      token = session.access_token,
      extra: Record<string, string> = {},
    ) => {
      const init = {
        method,
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
          ...(key ? { "Idempotency-Key": key } : {}),
          ...extra,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      };
      return target === "PostgreSQL"
        ? app.request("http://localhost" + path, init, {
            repository,
            config,
            remoteIP: owner,
          })
        : mf.dispatchFetch("http://localhost" + path, init);
    };
    const createResponse = await send("/v1/sources", "POST", input, "create-1");
    assert.equal(createResponse.status, 201);
    const created = (await createResponse.json()) as {
      id: string;
      version: number;
    };
    const sourceID = created.id;
    await t.test(
      "plugin catalog, generic configuration and declared actions preserve ownership and version fences",
      async () => {
        const catalogResponse = await send("/v1/plugins");
        assert.equal(catalogResponse.status, 200);
        const catalog = (await catalogResponse.json()) as {
          dsl_version: number;
          plugins: {
            id: string;
            version: string;
            available: boolean;
            form: { fields: { id: string }[] };
          }[];
        };
        assert.equal(catalog.dsl_version, 1);
        const plugin = catalog.plugins.find((p) => p.id === "rsshub")!;
        assert.equal(plugin.available, true);
        assert.equal(plugin.form.fields[0]!.id, "route");
        assert.equal(
          (await send("/v1/plugins", "GET", undefined, undefined, "invalid"))
            .status,
          401,
        );
        const legacy = await send(
          "/v1/sources",
          "POST",
          {
            name: "Legacy",
            route: "/bbc",
            enabled: false,
            interval_seconds: 3600,
          },
          "legacy-create",
        );
        assert.equal(legacy.status, 201);
        const old = (await legacy.json()) as {
          id: string;
          configuration: unknown;
          version: number;
        };
        assert.deepEqual(old.configuration, { route: "/bbc" });
        assert.equal(
          (
            await send(
              "/v1/sources",
              "POST",
              {
                name: "Legacy",
                route: "/bbc",
                enabled: false,
                interval_seconds: 3600,
              },
              "legacy-create",
            )
          ).status,
          201,
        );
        const patchedResponse = await send(`/v1/sources/${old.id}`, "PATCH", {
          expected_version: 1,
          route: "/bbc/world-asia",
        });
        const patched = (await patchedResponse.json()) as {
          version: number;
          enabled: boolean;
          interval_seconds: number;
        };
        assert.equal(patched.enabled, false);
        assert.equal(patched.interval_seconds, 3600);
        await send(`/v1/sources/${old.id}`, "PATCH", {
          expected_version: 2,
          enabled: true,
        });
        const actionPath = `/v1/sources/${old.id}/actions/`;
        const actionBody = {
          expected_version: 3,
          plugin_version: plugin.version,
          input: {},
        };
        assert.equal(
          (await send(actionPath + "validate", "POST", actionBody, "validate"))
            .status,
          200,
        );
        assert.equal(
          (await send(actionPath + "unknown", "POST", actionBody, "unknown"))
            .status,
          404,
        );
        assert.equal(
          (
            await send(
              actionPath + "sync",
              "POST",
              { ...actionBody, plugin_version: "old" },
              "old-plugin",
            )
          ).status,
          409,
        );
        assert.equal(
          (
            await send(
              actionPath + "sync",
              "POST",
              { ...actionBody, input: { injected: true } },
              "bad-input",
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await send(
              actionPath + "sync",
              "POST",
              actionBody,
              "other-owner",
              stranger.access_token,
            )
          ).status,
          404,
        );
        const accepted = await send(
          actionPath + "sync",
          "POST",
          actionBody,
          "action-once",
        );
        assert.equal(accepted.status, 202);
        const receipt = (await accepted.json()) as { receipt_id: string };
        assert.deepEqual(
          await (
            await send(actionPath + "sync", "POST", actionBody, "action-once")
          ).json(),
          { status: "accepted", receipt_id: receipt.receipt_id },
        );
        await send(`/v1/sources/${old.id}`, "PATCH", {
          expected_version: 3,
          name: "Changed",
        });
        assert.equal(
          (await send(actionPath + "sync", "POST", actionBody, "stale-source"))
            .status,
          409,
        );
        assert.equal(
          (await sources.receipt(owner, receipt.receipt_id)).state,
          "cancelled",
        );
        assert.equal(
          (
            await send(
              `/v1/sources/${old.id}`,
              "DELETE",
              undefined,
              undefined,
              session.access_token,
              { "If-Match": '"4"' },
            )
          ).status,
          204,
        );
      },
    );
    await t.test(
      "source mutations authenticate, enforce route policy and replay idempotently",
      async () => {
        const discovery = (await (
          await send("/.well-known/melted")
        ).json()) as {
          capabilities: { collectors: string[] };
          processing_manifest_version: string;
        };
        const manifest = (await (
          await send("/.well-known/melted/processing")
        ).json()) as { version: string; destinations: { origin: string }[] };
        assert.deepEqual(discovery.capabilities.collectors, ["rsshub"]);
        assert.equal(manifest.version, discovery.processing_manifest_version);
        assert.equal(manifest.destinations[0]!.origin, rsshub.base_url);
        assert.equal(
          (await send("/v1/sources", "POST", input, "create-1")).status,
          201,
        );
        assert.equal((await sources.list(owner)).length, 1);
        assert.equal(
          (
            await send(
              "/v1/sources",
              "POST",
              { ...input, name: "changed" },
              "create-1",
            )
          ).status,
          409,
        );
        assert.equal(
          (
            await send(
              "/v1/sources",
              "POST",
              { ...input, configuration: { route: "/unapproved" } },
              "create-denied",
            )
          ).status,
          403,
        );
        assert.equal((await send("/v1/sources", "POST", input)).status, 400);
        for (const path of [
          "/v1/sources/%00",
          "/v1/raw-items/%00",
          "/v1/receipts/%00",
          `/v1/sources/${sourceID}/items?cursor=%00`,
        ])
          assert.equal((await send(path)).status, 400);
        assert.equal(
          (
            await send(
              `/v1/sources/${sourceID}`,
              "DELETE",
              undefined,
              undefined,
              session.access_token,
              { "If-Match": '"999999999999999999999999999999999"' },
            )
          ).status,
          400,
        );

        for (const name of ["bad\u0000name", "bad\ud800name"]) {
          assert.equal(
            (await send("/v1/sources", "POST", { ...input, name }, random()))
              .status,
            400,
          );
          assert.equal(
            (
              await send(`/v1/sources/${sourceID}`, "PATCH", {
                expected_version: 1,
                name,
              })
            ).status,
            400,
          );
        }
        for (const [path, method, payload] of [
          [
            `/v1/sources/${sourceID}`,
            "PATCH",
            { expected_version: 1, name: "forbidden" },
          ],
          [`/v1/sources/${sourceID}/sync`, "POST", undefined],
          [`/v1/sources/${sourceID}/items`, "GET", undefined],
        ] as const)
          assert.equal(
            (await send(path, method, payload, random(), stranger.access_token))
              .status,
            404,
          );
        assert.equal(
          (
            await send(
              `/v1/sources/${sourceID}`,
              "GET",
              undefined,
              undefined,
              stranger.access_token,
            )
          ).status,
          404,
        );
        assert.equal(
          (
            await send(`/v1/sources/${sourceID}`, "PATCH", {
              expected_version: 99,
              name: "wrong",
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await send(
              `/v1/sources/${sourceID}`,
              "DELETE",
              undefined,
              undefined,
              stranger.access_token,
              { "If-Match": '"1"' },
            )
          ).status,
          404,
        );
      },
    );
    let receiptID: string;
    await t.test(
      "manual enqueue is durable, duplicate deliveries cannot claim twice",
      async () => {
        const response = await send(
          `/v1/sources/${sourceID}/sync`,
          "POST",
          undefined,
          "sync-1",
        );
        assert.equal(response.status, 202);
        const receipt = (await response.json()) as { receipt_id: string };
        receiptID = receipt.receipt_id;
        assert.deepEqual(
          await (
            await send(
              `/v1/sources/${sourceID}/sync`,
              "POST",
              undefined,
              "sync-1",
            )
          ).json(),
          receipt,
        );
        const claims = await Promise.all(
          Array.from({ length: 5 }, () => sources.claim(owner, receiptID)),
        );
        assert.equal(claims.filter(Boolean).length, 1);
        const result = await normalizeFeed(fixture);
        result.checkpoint = { etag: '"first"' };
        assert.equal(
          await sources.complete(claims.find(Boolean)!, result),
          true,
        );
        assert.equal(
          await sources.complete(claims.find(Boolean)!, result),
          false,
        );
        const run = await sources.receipt(owner, receiptID);
        assert.equal(run.state, "complete");
        assert.equal(run.counts.inserted, 3);
        assert.equal(
          (
            await send(
              `/v1/receipts/${receiptID}`,
              "GET",
              undefined,
              undefined,
              stranger.access_token,
            )
          ).status,
          404,
        );
        const apiRun = (await (
          await send(`/v1/receipts/${receiptID}`)
        ).json()) as Record<string, unknown>;
        assert.equal(apiRun.fence, undefined);
      },
    );
    const collect = async (result: PollResult) => {
      const run = await sources.sync(owner, sourceID, random()),
        claim = await sources.claim(owner, run.id);
      assert(claim);
      await sources.complete(claim, result);
      return sources.receipt(owner, run.id);
    };
    await t.test(
      "same item replays deduplicate; changed payload appends an immutable revision",
      async () => {
        const duplicate = await collect(await normalizeFeed(fixture));
        assert.equal(duplicate.counts.duplicates, 3);
        assert.equal(duplicate.counts.inserted, 0);
        const result = await normalizeFeed({
          ...fixture,
          items: fixture.items.map((v, i) =>
            i === 0 ? { ...v, title: "展览信息已更新" } : v,
          ),
        });
        result.checkpoint = { etag: '"revision"' };
        const revision = await collect(result);
        assert.equal(revision.counts.updated, 1);
        assert.equal(revision.counts.duplicates, 2);
        const items = (await sources.items(owner, sourceID, null, 100)).items;
        assert(
          items.every((i) => !("content" in i)),
          "repository/RPC list must not transport raw bodies",
        );
        const item = items.find((i) => i.external_id === "culture-1")!;
        assert.equal(item.revision, 2);
        const apiPage = (await (
          await send(`/v1/sources/${sourceID}/items`)
        ).json()) as { items: Record<string, unknown>[] };
        assert.equal(apiPage.items.length, 3);
        assert(
          apiPage.items.every((v) => !("content" in v) && !("parts" in v)),
        );
        const apiRaw = (await (
          await send(`/v1/raw-items/${item.id}?revision=1`)
        ).json()) as { content: { title: string } };
        assert.equal(apiRaw.content.title, "周末展览");
        assert.equal(
          (await sources.raw(owner, item.id, 1)).content.title,
          "周末展览",
        );
        assert.equal(
          (
            await send(
              `/v1/raw-items/${item.id}`,
              "GET",
              undefined,
              undefined,
              stranger.access_token,
            )
          ).status,
          404,
        );
        const page = await sources.items(owner, sourceID, null, 2);
        assert.equal(page.items.length, 2);
        assert(page.next_cursor);
        assert.equal(
          (await sources.items(owner, sourceID, page.next_cursor, 2)).items
            .length,
          1,
        );
        assert.equal(
          (
            await repository.list(
              owner,
              {
                view: "all",
                q: "",
                category_ids: [],
                tag_ids: [],
                subject_ids: [],
                from: null,
                to: null,
                sort: "updated_desc",
              },
              null,
              30,
            )
          ).items.length,
          0,
        );
      },
    );
    await t.test(
      "partial results do not checkpoint past invalid items; 304 and empty remain successful",
      async () => {
        const partial = await normalizeFeed({
          ...fixture,
          items: [fixture.items[1], {}],
        });
        partial.checkpoint = { etag: '"must-not-commit"' };
        assert.equal((await collect(partial)).state, "partial");
        assert.equal(
          (await sources.get(owner, sourceID)).checkpoint.etag,
          '"revision"',
        );
        const empty = await collect({
          items: [],
          received: 0,
          warnings: [],
          checkpoint: { etag: '"revision"' },
          not_modified: true,
        });
        assert.equal(empty.state, "complete");
        assert.equal(empty.counts.received, 0);
      },
    );
    await t.test(
      "invalid Unicode and conflicting IDs cannot poison valid entries or churn revisions",
      async () => {
        const before = (
          await sources.items(owner, sourceID, null, 100)
        ).items.find((i) => i.external_id === "culture-1")!;
        const batch = await normalizeFeed({
          ...fixture,
          items: [
            fixture.items[1],
            { id: "culture-1", content_text: "conflict A" },
            { id: "culture-1", content_text: "conflict B" },
            { id: "invalid-nul", content_text: "\u0000" },
            { id: "invalid-surrogate", content_text: "\ud800" },
          ],
        });
        for (let i = 0; i < 2; i++) {
          const run = await collect(batch);
          assert.equal(run.state, "partial");
          assert.equal(run.counts.invalid, 4);
          assert.equal(run.counts.duplicates, 1);
          assert.equal(run.counts.updated, 0);
          assert.equal(run.counts.inserted, 0);
        }
        assert.equal(
          (await sources.raw(owner, before.id)).revision,
          before.revision,
        );
        assert.equal(
          (await sources.get(owner, sourceID)).checkpoint.etag,
          '"revision"',
        );
      },
    );
    await t.test(
      "raw writes and checkpoint roll back together on a mid-batch storage failure",
      async () => {
        const run = await sources.sync(owner, sourceID, random()),
          claim = await sources.claim(owner, run.id);
        assert(claim);
        const batch = await normalizeFeed({
          ...fixture,
          items: [
            { id: "atomic-new", content_text: "must roll back" },
            { id: "broken", content_text: "constraint failure" },
          ],
        });
        (batch.items[1] as unknown as { external_key: null }).external_key =
          null;
        await assert.rejects(sources.complete(claim, batch));
        assert.equal(
          (await sources.items(owner, sourceID, null, 100)).items.some(
            (i) => i.external_id === "atomic-new",
          ),
          false,
        );
        assert.equal((await sources.receipt(owner, run.id)).state, "running");
        assert.equal(
          (await sources.get(owner, sourceID)).checkpoint.etag,
          '"revision"',
        );
        assert.equal(
          await sources.complete(claim, await normalizeFeed(fixture)),
          true,
        );
      },
    );
    await t.test(
      "expired leases requeue and fence out late workers",
      async () => {
        const run = await sources.sync(owner, sourceID, random()),
          now = Date.now();
        const first = await sources.claim(owner, run.id, now);
        assert(first);
        const second = await sources.claim(owner, run.id, now + 90_001);
        assert(second);
        assert(second.run.fence > first.run.fence);
        const result = await normalizeFeed(fixture);
        assert.equal(
          await sources.complete(first, result, now + 90_002),
          false,
        );
        assert.equal(
          await sources.complete(second, result, now + 90_002),
          true,
        );
      },
    );
    await t.test(
      "429 keeps retry-after durable; permanent auth failure blocks automatic polling",
      async () => {
        const run = await sources.sync(owner, sourceID, random()),
          now = Date.now(),
          claim = await sources.claim(owner, run.id, now);
        assert(claim);
        await sources.fail(
          claim,
          {
            code: "upstream_http_429",
            retryable: true,
            retry_after_ms: 120000,
          },
          now,
        );
        assert.equal((await sources.receipt(owner, run.id)).state, "queued");
        assert.equal(await sources.claim(owner, run.id, now + 119999), null);
        const retried = await sources.claim(owner, run.id, now + 120001);
        assert(retried);
        await sources.fail(
          retried,
          { code: "upstream_http_403", retryable: false, blocked: true },
          now + 120002,
        );
        assert.equal((await sources.get(owner, sourceID)).blocked, true);
        const manual = await sources.sync(owner, sourceID, random());
        assert.equal((await sources.get(owner, sourceID)).blocked, false);
        const next = await sources.claim(owner, manual.id);
        assert(next);
        await sources.complete(next, await normalizeFeed(fixture));
      },
    );
    await t.test("per-account concurrency never exceeds two", async () => {
      const extra = await Promise.all(
        [1, 2, 3].map((i) =>
          sources.create(owner, { ...input, name: String(i) }, random()),
        ),
      );
      const runs = await Promise.all(
        extra.map((s) => sources.sync(owner, s.id, random())),
      );
      const claims = await Promise.all(
        runs.map((r) => sources.claim(owner, r.id)),
      );
      assert.equal(claims.filter(Boolean).length, 2);
      for (const s of extra) await sources.remove(owner, s.id, s.version);
      for (const c of claims.filter((c): c is Claim => c !== null))
        assert.equal(
          await sources.complete(c, await normalizeFeed(fixture)),
          false,
        );
    });
    await t.test(
      "disable retains raw data; target changes reset checkpoint; deletion cannot resurrect content",
      async () => {
        const run = await sources.sync(owner, sourceID, random()),
          claim = await sources.claim(owner, run.id);
        assert(claim);
        const source = await sources.get(owner, sourceID),
          paused = await sources.patch(owner, sourceID, {
            expected_version: source.version,
            enabled: false,
          });
        assert.equal(
          await sources.complete(claim, await normalizeFeed(fixture)),
          false,
        );
        assert.equal(
          (await sources.items(owner, sourceID, null, 100)).items.length,
          3,
        );
        await assert.rejects(
          sources.sync(owner, sourceID, random()),
          /source_disabled/,
        );
        const resumed = await sources.patch(owner, sourceID, {
          expected_version: paused.version,
          enabled: true,
          configuration: { route: "/douban/book/latest" },
        });
        assert.deepEqual(resumed.checkpoint, {});
        const finalRun = await sources.sync(owner, sourceID, random()),
          late = await sources.claim(owner, finalRun.id);
        assert(late);
        const raw = (await sources.items(owner, sourceID, null, 1)).items[0]!;
        assert.equal(
          (
            await send(
              `/v1/sources/${sourceID}`,
              "DELETE",
              undefined,
              undefined,
              session.access_token,
              { "If-Match": `"${resumed.version}"` },
            )
          ).status,
          204,
        );
        assert.equal(
          await sources.complete(late, await normalizeFeed(fixture)),
          false,
        );
        await assert.rejects(sources.raw(owner, raw.id), /raw_item_not_found/);
        assert.equal(
          (await sources.receipt(owner, finalRun.id)).state,
          "cancelled",
        );
        assert.equal((await sources.list(owner)).length, 0);
      },
    );
  });
