// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from "node:test";
import assert from "node:assert/strict";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { connect } from "../../src/storage/postgres/connection.js";
import { migrate } from "../../src/storage/postgres/migrations.js";
import { PostgresRepository } from "../../src/storage/postgres/repository.js";
import { CloudRepository } from "../../src/storage/cloudflare/repository.js";
import type { CloudBindings } from "../../src/storage/cloudflare/bindings.js";
import { createApp } from "../../src/http/app.js";
import { configSchema } from "../../src/config/schema.js";
import {
  processingConfigSchema,
  processingDisclosure,
} from "../../src/modules/processing/config.js";
import { executeProcessing } from "../../src/modules/processing/execute.js";
import { HTTPProcessingModels } from "../../src/modules/processing/provider.js";
import { FixtureModelTransport } from "../fixtures/processing-model.js";
import { hash, random } from "../../src/shared/crypto.js";
import { normalizeFeed } from "../../src/modules/ingest/feeds/json-feed.js";
import { filters } from "../../src/modules/content/filters.js";
import type { Source } from "../../src/modules/sources/types.js";

const modelConfig = processingConfigSchema.parse({
  generator: {
    endpoint: "https://generator.example/v1/chat/completions",
    model: "synthetic-test",
    api_key: "synthetic-key",
  },
  decision: {
    endpoint: "https://decision.example/v1/systemone",
    api_key: "synthetic-key",
  },
  daily_call_limit: 200,
});
const culture = "新加坡图书馆将在2026年10月20日举办阅读活动，报名安排尚未确认";
const transit = "新加坡公交线路将于2026年10月20日调整，具体时刻尚未确认";
for (const target of ["Node/PostgreSQL", "workerd/SQLite DO"] as const) {
  test(`${target}: synthetic-model full preference pipeline, durable boundaries and source deletion`, async (t) => {
    const url = process.env.MELTED_TEST_DATABASE_URL;
    assert(url && url !== process.env.DATABASE_URL);
    const { database, pool } = connect(url);
    await migrate(database);
    const mf = target.startsWith("workerd")
      ? new Miniflare(
          convertV4MiniflareOptions({
            name: "processing-test",
            modules: true,
            scriptPath: ".wrangler/test-build/worker.js",
            compatibilityDate: "2026-10-14",
            compatibilityFlags: ["nodejs_compat"],
            durableObjects: {
              ACCOUNTS: { className: "AccountStore", useSQLite: true },
              CONTROL: { className: "ControlStore", useSQLite: true },
            },
            bindings: {
              MELTED_SERVER_ID: "processing-test",
              PUBLIC_ORIGIN: "http://localhost",
              PROCESSING_CONFIG: JSON.stringify(modelConfig),
            },
          }),
        )
      : undefined;
    const repo = mf
      ? new CloudRepository(await mf.getBindings<CloudBindings>())
      : new PostgresRepository(database);
    const owner = "acc_" + (await hash(random())),
      other = "acc_" + (await hash(random()));
    try {
      const session = await repo.managedSession(owner),
        stranger = await repo.managedSession(other),
        app = createApp();
      const config = configSchema.parse({
        serverID: "processing-test",
        operator: "test",
        publicOrigin: "http://localhost",
        processing: modelConfig,
      });
      const send = (
        path: string,
        method = "GET",
        body?: unknown,
        key = random(),
        token = session.access_token,
      ) => {
        const init = {
          method,
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/json",
            "Idempotency-Key": key,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        };
        return mf
          ? mf.dispatchFetch("http://localhost" + path, init)
          : app.request("http://localhost" + path, init, {
              repository: repo,
              config,
              remoteIP: owner,
            });
      };
      const fingerprint = (await processingDisclosure(modelConfig))!
        .fingerprint;
      const transport = new FixtureModelTransport(),
        models = new HTTPProcessingModels(modelConfig, transport.fetch);
      const values = {
        classification: "文化与出行分类，标注城市",
        content: "本地文化活动或交通变化，排除纯推广",
        preferences: "保留日期和不确定性，保留来源",
        output: "简体中文，简洁短文，先摘要再列关键事实和来源",
      };
      const action = (
        name: string,
        version = 1,
        key = random(),
        fp = fingerprint,
      ) =>
        send(
          "/v1/settings/preferences/" + name,
          "POST",
          { expected_version: version, fingerprint: fp, action: name },
          key,
        );
      const run = async (id: string) => {
        const claim = await repo.processing.claim(owner, id, fingerprint, 200);
        assert(claim);
        await executeProcessing(repo.processing, claim, modelConfig, models);
        return (await repo.processing.jobs(owner)).find((j) => j.id === id)!;
      };
      const list = () =>
        repo.list(owner, filters(new URLSearchParams()), null, 100);
      const collect = async (
        source: Source,
        items: { id: string; content_text: string }[],
      ) => {
        const receipt = await repo.sources.sync(owner, source.id, random()),
          claim = await repo.sources.claim(owner, receipt.id);
        assert(claim);
        const result = await normalizeFeed({
          version: "https://jsonfeed.org/version/1.1",
          title: "Synthetic authorized test materials",
          items: items.map((i) => ({
            ...i,
            url: "https://example.org/" + i.id,
          })),
        });
        assert.equal(await repo.sources.complete(claim, result), true);
        await repo.processing.schedule(owner);
        return (await repo.sources.items(owner, source.id, null, 100)).items;
      };
      await t.test(
        "save is inert; explicit compilation produces a draft, activation is separate and owner isolated",
        async () => {
          assert.equal(
            (
              await send("/v1/settings/preferences", "PUT", {
                schema_version: 1,
                expected_version: 0,
                values,
              })
            ).status,
            200,
          );
          assert.equal((await repo.processing.jobs(owner)).length, 0);
          assert.equal((await action("activate")).status, 409);
          assert.equal(
            (await action("compile", 1, random(), "0".repeat(64))).status,
            409,
          );
          const key = random();
          assert.equal((await action("compile", 1, key)).status, 200);
          assert.equal((await action("compile", 1, key)).status, 200);
          const job = (await repo.processing.jobs(owner))[0]!;
          const claims = await Promise.all(
            Array.from({ length: 4 }, () =>
              repo.processing.claim(owner, job.id, fingerprint, 200),
            ),
          );
          assert.equal(claims.filter(Boolean).length, 1);
          await executeProcessing(
            repo.processing,
            claims.find(Boolean)!,
            modelConfig,
            models,
          );
          assert.equal((await repo.processing.status(owner)).phase, "ready");
          assert.equal(
            await repo.processing.complete(claims.find(Boolean)!, {}),
            false,
          );
          const status = (await (
            await send("/v1/settings/preferences/processing")
          ).json()) as { preview: { value: string }[] };
          assert(status.preview.some((p) => p.value.includes("文化")));
          assert.equal((await repo.processing.status(other)).phase, "stored");
          assert.equal((await action("activate")).status, 200);
          const state = (await (
            await send("/v1/settings/preferences")
          ).json()) as { application: string };
          assert.equal(state.application, "active");
        },
      );
      const source = await repo.sources.create(
        owner,
        {
          plugin: "feed",
          config_version: 1,
          name: "Test",
          configuration: { url: "https://example.org/feed" },
          interval_seconds: 900,
          enabled: true,
        },
        random(),
      );
      let raw: Awaited<ReturnType<typeof collect>>;
      await t.test(
        "active policy applies to new culture/transport content, filters promotion and holds uncertainty without deleting originals",
        async () => {
          raw = await collect(source, [
            { id: "culture", content_text: culture },
            { id: "transit", content_text: transit },
            { id: "advert", content_text: "纯推广广告" },
            { id: "uncertain", content_text: "待复核边界" },
          ]);
          for (const job of (await repo.processing.jobs(owner)).filter(
            (j) => j.state === "queued",
          ))
            assert.equal((await run(job.id)).state, "complete");
          const status = await repo.processing.status(owner);
          assert.equal(status.jobs.published, 2);
          assert.equal(status.jobs.filtered, 1);
          assert.equal(status.jobs.held, 1);
          assert.equal((await list()).items.length, 2);
          const terms = await repo.taxonomy(owner);
          assert.deepEqual(
            terms
              .filter((c) => c.kind === "category")
              .map((c) => c.name)
              .sort(),
            ["出行", "文化"],
          );
          assert.equal(terms.find((c) => c.kind === "tag")!.name, "新加坡");
          for (const row of (await list()).items) {
            const doc = await repo.detail(owner, row.id);
            assert(doc.markdown.includes("尚未确认"));
            assert(doc.evidence.length);
            assert.equal(doc.evidence_status, "single_source");
            await assert.rejects(repo.detail(other, doc.id));
          }
          assert.equal(
            (await repo.sources.items(owner, source.id, null, 100)).items
              .length,
            4,
          );
          assert.equal(
            (
              await repo.sources.raw(
                owner,
                raw.find((i) => i.external_id === "advert")!.id,
              )
            ).content.parts[0]!.text,
            "纯推广广告",
          );
          const jobs = (await (await send("/v1/processing/jobs")).json()) as {
            jobs: { usage: { model: string }[] }[];
          };
          assert(
            jobs.jobs.some((j) =>
              j.usage.some((u) => u.model === "synthetic-jev"),
            ),
          );
          assert(!JSON.stringify(jobs).includes("synthetic-key"));
          assert(!JSON.stringify(jobs).includes("evidence_ids"));
          assert.equal(
            (
              await send(
                "/v1/processing/jobs",
                "GET",
                undefined,
                random(),
                stranger.access_token,
              )
            ).status,
            200,
          );
        },
      );
      await t.test(
        "broken citations, invented numbers and unsupported statements cannot publish",
        async () => {
          for (const flag of [
            "badCitation",
            "inventedNumber",
            "inventedPartialNumber",
            "unsupported",
          ] as const) {
            const items = await collect(source, [
              { id: flag, content_text: culture },
            ]);
            transport[flag] = true;
            const item = items.find((i) => i.external_id === flag)!,
              job = (await repo.processing.jobs(owner)).find(
                (j) => j.raw_id === item.id,
              )!;
            const result = await run(job.id);
            assert.equal(result.state, "failed");
            assert.match(
              result.error!,
              /invalid_output_citations|unsupported_output_number|output_not_supported/,
            );
            await assert.rejects(repo.detail(owner, "organized_" + item.id));
            transport[flag] = false;
          }
        },
      );
      await t.test(
        "lease fencing, checkpoint reuse, budget and raw revision checks survive retry",
        async () => {
          let items = await collect(source, [
            { id: "retry", content_text: culture },
          ]);
          const item = items.find((i) => i.external_id === "retry")!,
            job = (await repo.processing.jobs(owner)).find(
              (j) => j.raw_id === item.id,
            )!;
          const first = await repo.processing.claim(
            owner,
            job.id,
            fingerprint,
            200,
          );
          assert(first);
          const stage = await models.generate(
            "candidates",
            "test",
            { evidence: [{ text: culture }] },
            (await import("zod")).z.object({
              tags: (await import("zod")).z.array(
                (await import("zod")).z.unknown(),
              ),
            }),
            job.id + ":candidates",
          );
          assert(await repo.processing.checkpoint(first, "candidates", stage));
          const second = await repo.processing.claim(
            owner,
            job.id,
            fingerprint,
            200,
            first.job.lease_until + 1,
          );
          assert(second);
          assert(second.job.fence > first.job.fence);
          assert.equal(await repo.processing.complete(first, {}), false);
          const before = transport.calls.filter(
            (c) => c.stage === "candidates",
          ).length;
          await executeProcessing(repo.processing, second, modelConfig, models);
          assert.equal(
            transport.calls.filter((c) => c.stage === "candidates").length,
            before,
          );
          const docID = "organized_" + item.id;
          await repo.detail(owner, docID);
          items = await collect(source, [
            { id: "retry", content_text: culture + "，地点另行通知" },
          ]);
          assert.equal(items.find((i) => i.id === item.id)!.revision, 2);
          await assert.rejects(repo.detail(owner, docID));
          const updated = (await repo.processing.jobs(owner)).find(
            (j) => j.raw_id === item.id && j.raw_revision === 2,
          )!;
          assert.equal(
            await repo.processing.claim(owner, updated.id, fingerprint, 1),
            null,
          );
          assert.equal(
            (await repo.processing.jobs(owner)).find(
              (j) => j.id === updated.id,
            )!.error,
            "processing_daily_budget",
          );
        },
      );
      await t.test(
        "settings changes cancel late work and withdraw old publication; delete scrubs generated bodies and stage caches",
        async () => {
          const items = await collect(source, [
              { id: "late", content_text: culture },
            ]),
            item = items.find((i) => i.external_id === "late")!;
          const job = (await repo.processing.jobs(owner)).find(
            (j) => j.raw_id === item.id,
          )!;
          const claim = await repo.processing.claim(
            owner,
            job.id,
            fingerprint,
            200,
          );
          assert(claim);
          assert.equal(
            (
              await send("/v1/settings/preferences", "PUT", {
                schema_version: 1,
                expected_version: 1,
                values: { ...values, output: "English concise" },
              })
            ).status,
            200,
          );
          assert.equal(await repo.processing.current(claim), false);
          assert.equal(await repo.processing.complete(claim, {}), false);
          assert.equal((await list()).items.length, 0);
          assert.equal((await action("activate", 1)).status, 409);
          await repo.sources.remove(owner, source.id, source.version);
          assert.equal(
            await repo.processing.checkpoint(claim, "generate", {
              value: "late data",
              usage: { model: "test", input_tokens: 1, output_tokens: 1 },
            }),
            false,
          );
          await assert.rejects(repo.sources.raw(owner, item.id));
          assert(
            (await repo.processing.jobs(owner))
              .filter((j) => j.source_id === source.id)
              .every(
                (j) =>
                  Object.keys(j.stages).length === 0 && j.state === "cancelled",
              ),
          );
          if (!mf)
            assert.equal(
              (
                await database.query(
                  "SELECT id FROM briefings WHERE owner=$1",
                  [owner],
                )
              ).rows.length,
              0,
            );
        },
      );
      await t.test(
        "recompilation preserves fencing and rebuilds withdrawn results when configuration returns",
        async () => {
          await repo.saveSettings(
            other,
            "preferences",
            {
              schema_version: 1,
              expected_version: 0,
              values,
            },
            random(),
          );
          const compile = () =>
            repo.processing.action(other, 1, "compile", fingerprint, random());
          const activate = () =>
            repo.processing.action(other, 1, "activate", fingerprint, random());
          await compile();
          const compileID = (await repo.processing.jobs(other))[0]!.id;
          const first = await repo.processing.claim(
            other,
            compileID,
            fingerprint,
            200,
          );
          assert(first);
          await repo.processing.fail(
            first,
            "synthetic_permanent_failure",
            false,
          );
          await compile();
          const second = await repo.processing.claim(
            other,
            compileID,
            fingerprint,
            200,
          );
          assert(second);
          assert(second.job.fence > first.job.fence);
          assert.equal(
            await repo.processing.checkpoint(first, "compile", {
              value: "stale result",
              usage: { model: "test", input_tokens: 1, output_tokens: 1 },
            }),
            false,
          );
          await executeProcessing(repo.processing, second, modelConfig, models);
          await activate();
          const source = await repo.sources.create(
            other,
            {
              plugin: "feed",
              config_version: 1,
              name: "Configuration rollback",
              configuration: { url: "https://example.org/rollback" },
              interval_seconds: 900,
              enabled: true,
            },
            random(),
          );
          const receipt = await repo.sources.sync(other, source.id, random());
          const collection = await repo.sources.claim(other, receipt.id);
          assert(collection);
          await repo.sources.complete(
            collection,
            await normalizeFeed({
              version: "https://jsonfeed.org/version/1.1",
              title: "Synthetic",
              items: [
                {
                  id: "rollback",
                  content_text: culture,
                  url: "https://example.org/rollback",
                },
              ],
            }),
          );
          await repo.processing.schedule(other);
          const job = (await repo.processing.jobs(other)).find(
            (j) => j.kind === "item",
          )!;
          const oldItem = await repo.processing.claim(
            other,
            job.id,
            fingerprint,
            200,
          );
          assert(oldItem);
          await executeProcessing(
            repo.processing,
            oldItem,
            modelConfig,
            models,
          );
          assert.equal(
            (await repo.list(other, filters(new URLSearchParams()), null, 100))
              .items.length,
            1,
          );
          await repo.processing.invalidate(other, "f".repeat(64));
          assert.equal(
            (await repo.list(other, filters(new URLSearchParams()), null, 100))
              .items.length,
            0,
          );
          await compile();
          const restored = await repo.processing.claim(
            other,
            compileID,
            fingerprint,
            200,
          );
          assert(restored);
          await executeProcessing(
            repo.processing,
            restored,
            modelConfig,
            models,
          );
          await activate();
          const rebuilt = await repo.processing.claim(
            other,
            job.id,
            fingerprint,
            200,
          );
          assert(
            rebuilt,
            "withdrawn output must become runnable after explicit reapproval",
          );
          assert(rebuilt.job.fence > oldItem.job.fence);
          assert.deepEqual(rebuilt.job.stages, {});
          assert.equal(await repo.processing.complete(oldItem, {}), false);
          await executeProcessing(
            repo.processing,
            rebuilt,
            modelConfig,
            models,
          );
          assert.equal(
            (await repo.list(other, filters(new URLSearchParams()), null, 100))
              .items.length,
            1,
          );
        },
      );
    } finally {
      await mf?.dispose();
      await database.query("DELETE FROM accounts WHERE id=ANY($1::text[])", [
        [owner, other],
      ]);
      await pool.end();
    }
  });
}
