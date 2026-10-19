// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { connect } from "../../src/storage/postgres/connection.js";
import { migrate } from "../../src/storage/postgres/migrations.js";
import { PostgresRepository } from "../../src/storage/postgres/repository.js";
import { CloudRepository } from "../../src/storage/cloudflare/repository.js";
import type { CloudBindings } from "../../src/storage/cloudflare/bindings.js";
import { createApp } from "../../src/http/app.js";
import { configSchema } from "../../src/config/schema.js";
import {
  processingSettingsSchema,
  processingDisclosure,
} from "../../src/modules/processing/config.js";
import { FixtureModelTransport } from "../fixtures/processing-model.js";
import { hash, random } from "../../src/shared/crypto.js";
import { filters } from "../../src/modules/content/filters.js";
import {
  effectiveProcessing,
  saveCredentials,
} from "../../src/modules/processing/credentials.js";
import type { Source } from "../../src/modules/sources/types.js";

for (const target of [
  "Node worker/PostgreSQL",
  "workerd/DO Alarm + Queues",
] as const) {
  for (const mode of ["operator", "byok", "shared"] as const) {
    test(
      `${target} ${mode}: automatic collector-to-publication runtime (synthetic model transport)`,
      { timeout: 45000 },
      async () => {
        const url = process.env.MELTED_TEST_DATABASE_URL;
        assert(url && url !== process.env.DATABASE_URL);
        const { database, pool } = connect(url);
        await migrate(database);
        const owner = "acc_" + (await hash(random()));
        const processing = processingSettingsSchema.parse({
          generator: {
            endpoint: "https://generator.example/v1/chat/completions",
            model: "synthetic-test",
            ...(mode === "operator" ? { api_key: "synthetic-key" } : {}),
          },
          decision: {
            endpoint: "https://decision.example/v1/systemone",
            ...(mode === "operator" ? { api_key: "synthetic-key" } : {}),
          },
          daily_call_limit: 100,
          credentials: { mode, administrators: [owner] },
        });
        const plugins = { feed: { allowed_origins: ["https://feed.example"] } };
        const config = configSchema.parse({
          serverID: "runtime",
          publicOrigin: "http://localhost",
          operator: "test",
          processing,
          processingSealKey: "c".repeat(64),
          plugins,
        });
        const fixture = new FixtureModelTransport();
        const mf = target.startsWith("workerd")
          ? new Miniflare(
              convertV4MiniflareOptions({
                name: "processing-runtime",
                modules: true,
                scriptPath: ".wrangler/test-build/worker.js",
                compatibilityDate: "2026-10-14",
                compatibilityFlags: ["nodejs_compat"],
                durableObjects: {
                  ACCOUNTS: { className: "AccountStore", useSQLite: true },
                  CONTROL: { className: "ControlStore", useSQLite: true },
                },
                queueProducers: { COLLECTION_QUEUE: "processing-queue" },
                queueConsumers: {
                  "processing-queue": { maxBatchSize: 1, maxBatchTimeout: 0 },
                },
                bindings: {
                  MELTED_SERVER_ID: "runtime",
                  PUBLIC_ORIGIN: "http://localhost",
                  PROCESSING_CONFIG: JSON.stringify(processing),
                  PROCESSING_SEAL_KEY: config.processingSealKey!,
                  PLUGIN_CONFIG: JSON.stringify(plugins),
                },
                outboundService: async (request) => {
                  const host = new URL(request.url).hostname;
                  if (host === "feed.example")
                    return Response.json({
                      version: "https://jsonfeed.org/version/1.1",
                      title: "Synthetic authorized culture fixture",
                      items: [
                        {
                          id: "runtime-culture",
                          url: "https://example.org/culture",
                          content_text:
                            "新加坡图书馆将在2026年10月20日举办阅读活动，报名安排尚未确认",
                        },
                      ],
                    });
                  assert(
                    ["generator.example", "decision.example"].includes(host),
                  );
                  return fixture.fetch(request.url, {
                    method: request.method,
                    headers: Object.fromEntries(request.headers),
                    body: await request.text(),
                  });
                },
              }),
            )
          : undefined;
        const repo = mf
          ? new CloudRepository(await mf.getBindings<CloudBindings>())
          : new PostgresRepository(database);
        let isolatedBadOwner: string | undefined;
        let worker: ReturnType<typeof spawn> | undefined,
          diagnostics = "";
        try {
          const session = await repo.managedSession(owner),
            app = createApp();
          const send = (path: string, method = "GET", body?: unknown) => {
            const init = {
              method,
              headers: {
                Authorization: "Bearer " + session.access_token,
                "Content-Type": "application/json",
                "Idempotency-Key": random(),
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
          if (mode !== "operator")
            assert.equal(
              (
                await send(
                  "/v1/settings/credentials/" +
                    (mode === "byok" ? "account" : "server"),
                  "POST",
                  {
                    expected_version: 0,
                    changes: {
                      generator_key: "synthetic-key",
                      decision_key: "synthetic-key",
                    },
                  },
                )
              ).status,
              200,
            );
          if (!mf && mode === "byok") {
            isolatedBadOwner = "acc_" + (await hash(random()));
            await repo.managedSession(isolatedBadOwner);
            await saveCredentials(
              repo,
              { ...config, serverID: "another-server" },
              isolatedBadOwner,
              "account:" + isolatedBadOwner,
              {
                expected_version: 0,
                changes: {
                  generator_key: "wrong-context",
                  decision_key: "wrong-context",
                },
              },
              random(),
            );
            await repo.saveSettings(
              isolatedBadOwner,
              "preferences",
              { schema_version: 1, expected_version: 0, values: {} },
              random(),
            );
            await repo.processing.action(
              isolatedBadOwner,
              1,
              "compile",
              "0".repeat(64),
              random(),
            );
          }
          assert.equal(
            (
              await send("/v1/settings/preferences", "PUT", {
                schema_version: 1,
                expected_version: 0,
                values: {
                  classification: "文化与出行分类，标注城市",
                  content: "本地文化活动或交通变化，排除纯推广",
                  preferences: "保留日期、不确定性和来源",
                  output: "简体中文，简洁短文",
                },
              })
            ).status,
            200,
          );
          const fingerprint = (await processingDisclosure(
            await effectiveProcessing(repo, config, owner),
          ))!.fingerprint;
          assert.equal(
            (
              await send("/v1/settings/preferences/compile", "POST", {
                expected_version: 1,
                fingerprint,
                action: "compile",
              })
            ).status,
            200,
          );
          if (!mf) {
            worker = spawn(
              process.execPath,
              [
                "--import",
                "tsx",
                "--import",
                "./tests/fixtures/processing-worker-hook.ts",
                "src/entrypoints/collector-worker.ts",
              ],
              {
                env: {
                  ...process.env,
                  DATABASE_URL: url,
                  MELTED_SERVER_ID: config.serverID,
                  PUBLIC_ORIGIN: config.publicOrigin,
                  PROCESSING_CONFIG: JSON.stringify(processing),
                  PROCESSING_SEAL_KEY: config.processingSealKey!,
                  PLUGIN_CONFIG: JSON.stringify(plugins),
                },
                stdio: "pipe",
              },
            );
            worker.stderr?.on("data", (b) => {
              diagnostics += b.toString();
            });
          }
          const until = async (predicate: () => Promise<boolean>) => {
            const deadline = Date.now() + 30000;
            while (!(await predicate())) {
              assert(
                Date.now() < deadline,
                "Automatic pipeline timed out: " +
                  diagnostics +
                  JSON.stringify({
                    status: await repo.processing.status(owner),
                    jobs: await repo.processing.jobs(owner),
                    calls: fixture.calls.map((c) => c.stage),
                  }),
              );
              await delay(100);
            }
          };
          await until(
            async () => (await repo.processing.status(owner)).phase === "ready",
          );
          const created = await send("/v1/sources", "POST", {
            plugin: "feed",
            config_version: 1,
            name: "Culture runtime",
            configuration: { url: "https://feed.example/test" },
            interval_seconds: 900,
          });
          assert.equal(created.status, 201);
          const source = (await created.json()) as Source;
          assert.equal(
            (await send(`/v1/sources/${source.id}/sync`, "POST")).status,
            202,
          );
          await until(
            async () =>
              (await repo.sources.items(owner, source.id, null, 100)).items
                .length === 1,
          );
          // Existing raw material must remain unprocessed until the user activates the draft.
          assert.equal((await repo.processing.status(owner)).jobs.published, 0);
          assert.equal(
            (
              await send("/v1/settings/preferences/activate", "POST", {
                expected_version: 1,
                fingerprint,
                action: "activate",
              })
            ).status,
            200,
          );
          await until(
            async () =>
              (await repo.processing.status(owner)).jobs.published === 1,
          );
          const page = await repo.list(
            owner,
            filters(new URLSearchParams()),
            null,
            100,
          );
          assert.equal(page.items.length, 1);
          const doc = await repo.detail(owner, page.items[0]!.id);
          assert(doc.markdown.includes("尚未确认"));
          assert.equal(doc.evidence_status, "single_source");
          assert(
            (await repo.processing.jobs(owner)).some(
              (j) => j.stages.verify?.usage.model === "synthetic-jev",
            ),
          );
          assert.equal((await repo.processing.status(owner)).reserved_calls, 5);
          assert.equal(diagnostics, "");
          if (isolatedBadOwner) {
            assert.equal(
              (await repo.processing.status(isolatedBadOwner)).phase,
              "failed",
            );
            await database.query("DELETE FROM accounts WHERE id=$1", [
              isolatedBadOwner,
            ]);
          }
          if (mf)
            assert.deepEqual(fixture.calls.map((c) => c.stage).sort(), [
              "candidates",
              "compile",
              "decision",
              "generate",
              "verify",
            ]);
        } finally {
          if (worker && worker.exitCode === null) {
            worker.kill("SIGTERM");
            await once(worker, "exit");
          }
          await mf?.dispose();
          if (isolatedBadOwner)
            await database.query("DELETE FROM accounts WHERE id=$1", [
              isolatedBadOwner,
            ]);
          await database.query(
            "DELETE FROM processing_credentials WHERE scope='server'",
          );
          await database.query("DELETE FROM accounts WHERE id=$1", [owner]);
          await pool.end();
        }
      },
    );
  }
}
