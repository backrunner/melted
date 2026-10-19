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
import { configSchema } from "../../src/config/schema.js";
import {
  effectiveProcessing,
  guardedProcessing,
  openCredentials,
} from "../../src/modules/processing/credentials.js";
import { processingDisclosure } from "../../src/modules/processing/config.js";
import { executeProcessing } from "../../src/modules/processing/execute.js";
import { HTTPProcessingModels } from "../../src/modules/processing/provider.js";
import { createApp } from "../../src/http/app.js";
import { hash, random } from "../../src/shared/crypto.js";
import { FixtureModelTransport } from "../fixtures/processing-model.js";
import { normalizeFeed } from "../../src/modules/ingest/feeds/json-feed.js";

for (const target of ["Node/PostgreSQL", "workerd/SQLite DO"] as const)
  for (const mode of ["operator", "byok", "shared"] as const) {
    test(`${target}: ${mode} credential visibility, authority, encryption, account binding and revocation`, async () => {
      const url = process.env.MELTED_TEST_DATABASE_URL;
      assert(url && url !== process.env.DATABASE_URL);
      const { database, pool } = connect(url);
      await migrate(database);
      const mf = target.startsWith("workerd")
        ? new Miniflare(
            convertV4MiniflareOptions({
              name: "credentials-test",
              modules: true,
              scriptPath: ".wrangler/test-build/worker.js",
              compatibilityDate: "2026-10-14",
              compatibilityFlags: ["nodejs_compat"],
              durableObjects: {
                ACCOUNTS: { className: "AccountStore", useSQLite: true },
                CONTROL: { className: "ControlStore", useSQLite: true },
              },
              bindings: {
                MELTED_SERVER_ID: "credentials-test",
                PUBLIC_ORIGIN: "http://localhost",
              },
            }),
          )
        : undefined;
      const repo = mf
        ? new CloudRepository(await mf.getBindings<CloudBindings>())
        : new PostgresRepository(database);
      const admin = "acc_" + (await hash(random())),
        owner = "acc_" + (await hash(random()));
      try {
        const privileged = await repo.managedSession(admin),
          ordinary = await repo.managedSession(owner),
          app = createApp();
        let config = configSchema.parse({
          serverID: "credentials-test",
          publicOrigin: "http://localhost",
          operator: "test",
          processingSealKey: "a".repeat(64),
          processing: {
            generator: {
              endpoint: "https://generator.example/v1/chat/completions",
              model: "test",
              ...(mode === "operator" ? { api_key: "operator-generator" } : {}),
            },
            decision: {
              endpoint: "https://decision.example/v1/systemone",
              ...(mode === "operator" ? { api_key: "operator-jev" } : {}),
            },
            credentials: { mode, administrators: [admin] },
          },
        });
        const send = (
          account: "admin" | "owner",
          path: string,
          method = "GET",
          body?: unknown,
          key = random(),
        ) =>
          app.request(
            "http://localhost" + path,
            {
              method,
              headers: {
                Authorization:
                  "Bearer " +
                  (account === "admin" ? privileged : ordinary).access_token,
                "Content-Type": "application/json",
                "Idempotency-Key": key,
              },
              body: body === undefined ? undefined : JSON.stringify(body),
            },
            { repository: repo, config, remoteIP: account },
          );
        const catalog = async (account: "admin" | "owner") =>
          (await (await send(account, "/v1/settings")).json()) as {
            credentials?: { scope: string }[];
            sections: { workflow?: { fingerprint: string } }[];
          };
        if (mode === "operator") {
          assert(!(await catalog("admin")).credentials);
          assert(!(await catalog("owner")).credentials);
          for (const scope of ["server", "account"]) {
            assert.equal(
              (await send("admin", "/v1/settings/credentials/" + scope)).status,
              403,
            );
            assert.equal(
              (
                await send(
                  "owner",
                  "/v1/settings/credentials/" + scope,
                  "POST",
                  { expected_version: 0, changes: { generator_key: "forged" } },
                )
              ).status,
              403,
            );
          }
          assert.equal(
            (await effectiveProcessing(repo, config, owner))!.generator.api_key,
            "operator-generator",
          );
          return;
        }
        const scope = mode === "byok" ? "account" : "server",
          slot = mode === "byok" ? "account:" + admin : "server",
          path = "/v1/settings/credentials/" + scope;
        assert.equal((await catalog("admin")).credentials![0]!.scope, scope);
        assert.equal(
          Boolean((await catalog("owner")).credentials),
          mode === "byok",
        );
        assert(!(await catalog("admin")).sections[0]!.workflow);
        const initial = (await (await send("admin", path)).json()) as {
          version: number;
          configured: Record<string, boolean>;
        };
        assert.equal(initial.version, 0);
        assert(!initial.configured.generator_key);
        const keys = {
            generator_key: "private-generator-A",
            decision_key: "private-jev-A",
          },
          body = { expected_version: 0, changes: keys },
          key = random();
        const response = await send("admin", path, "POST", body, key);
        assert.equal(response.status, 200);
        const saved = await response.json();
        assert(!JSON.stringify(saved).includes("private-"));
        assert.deepEqual(
          await (await send("admin", path, "POST", body, key)).json(),
          saved,
        );
        assert.equal(
          (
            await send(
              "admin",
              path,
              "POST",
              { ...body, changes: { generator_key: "conflicting" } },
              key,
            )
          ).status,
          409,
        );
        const sealed = await repo.credentials.read(slot);
        assert(sealed);
        assert(!JSON.stringify(sealed).includes("private-"));
        assert.deepEqual(await openCredentials(config, slot, sealed), keys);
        await assert.rejects(
          openCredentials(config, slot + "other", sealed),
          /credential_storage_unavailable/,
        );
        await assert.rejects(
          openCredentials(
            { ...config, processingSealKey: "b".repeat(64) },
            slot,
            sealed,
          ),
          /credential_storage_unavailable/,
        );
        assert(!JSON.stringify(await catalog("admin")).includes("private-"));
        if (mode === "byok") {
          assert.equal(
            await effectiveProcessing(repo, config, owner),
            undefined,
          );
          assert.equal(
            (
              await send("owner", path, "POST", {
                expected_version: 0,
                changes: {
                  generator_key: "private-generator-B",
                  decision_key: "private-jev-B",
                },
              })
            ).status,
            200,
          );
          assert.equal(
            (await effectiveProcessing(repo, config, owner))!.generator.api_key,
            "private-generator-B",
          );
          assert.equal(
            (await effectiveProcessing(repo, config, admin))!.generator.api_key,
            "private-generator-A",
          );
          assert.equal(
            (await send("owner", "/v1/settings/credentials/server")).status,
            403,
          );
        } else {
          assert.equal((await send("owner", path)).status, 403);
          assert.equal((await send("owner", path, "POST", body)).status, 403);
          assert.equal(
            (await effectiveProcessing(repo, config, owner))!.generator.api_key,
            "private-generator-A",
          );
          assert(!(await catalog("owner")).credentials);
        }
        // Client-managed keys are actually selected for a normal account's processing calls.
        const who = mode === "byok" ? admin : owner,
          identity = mode === "byok" ? "admin" : "owner";
        assert.equal(
          (
            await send(identity, "/v1/settings/preferences", "PUT", {
              schema_version: 1,
              expected_version: 0,
              values: {
                classification: "文化与出行分类，标注城市",
                content: "本地文化活动或交通变化，排除纯推广",
                output: "简体中文简短输出，保留来源",
              },
            })
          ).status,
          200,
        );
        const current = (await effectiveProcessing(repo, config, who))!,
          fp = (await processingDisclosure(current))!.fingerprint;
        assert.equal(
          (
            await send(identity, "/v1/settings/preferences/compile", "POST", {
              expected_version: 1,
              fingerprint: fp,
              action: "compile",
            })
          ).status,
          200,
        );
        const fixture = new FixtureModelTransport(),
          authorization: string[] = [];
        const models = new HTTPProcessingModels(
          current,
          async (input, init) => {
            authorization.push(
              new Headers(init?.headers).get("Authorization")!,
            );
            return fixture.fetch(input, init);
          },
        );
        const compile = (await repo.processing.jobs(who))[0]!,
          claim = await repo.processing.claim(who, compile.id, fp, 60);
        assert(claim);
        await executeProcessing(
          guardedProcessing(repo, config),
          claim,
          current,
          models,
        );
        assert.deepEqual(authorization, ["Bearer private-generator-A"]);
        assert.equal(
          (
            await send(identity, "/v1/settings/preferences/activate", "POST", {
              expected_version: 1,
              fingerprint: fp,
              action: "activate",
            })
          ).status,
          200,
        );
        const source = await repo.sources.create(
          who,
          {
            plugin: "feed",
            config_version: 1,
            configuration: { url: "https://example.org/test" },
            name: "Synthetic authorized content",
            interval_seconds: 900,
            enabled: true,
          },
          random(),
        );
        const receipt = await repo.sources.sync(who, source.id, random()),
          collection = await repo.sources.claim(who, receipt.id);
        assert(collection);
        await repo.sources.complete(
          collection,
          await normalizeFeed({
            version: "https://jsonfeed.org/version/1.1",
            title: "Synthetic",
            items: [
              {
                id: "culture",
                content_text:
                  "新加坡图书馆将在2026年10月20日举办阅读活动，报名安排尚未确认",
                url: "https://example.org/culture",
              },
            ],
          }),
        );
        await repo.processing.schedule(who);
        const job = (await repo.processing.jobs(who)).find(
            (j) => j.kind === "item",
          )!,
          itemClaim = await repo.processing.claim(who, job.id, fp, 60);
        assert(itemClaim);
        await executeProcessing(
          guardedProcessing(repo, config),
          itemClaim,
          current,
          models,
        );
        assert(authorization.includes("Bearer private-jev-A"));
        const page = (await (await send(identity, "/v1/briefings")).json()) as {
          items: unknown[];
        };
        assert.equal(page.items.length, 1);
        const replace = await send("admin", path, "POST", {
          expected_version: 1,
          changes: { generator_key: "rotated-generator" },
        });
        assert.equal(replace.status, 200);
        const fresh = await effectiveProcessing(repo, config, who);
        assert.equal(fresh!.decision.api_key, "private-jev-A");
        assert.notEqual((await processingDisclosure(fresh))!.fingerprint, fp);
        // Shared changes cross DOs; the authenticated content gate withdraws old publications before serving them.
        assert.equal(
          (
            (await (await send(identity, "/v1/briefings")).json()) as {
              items: unknown[];
            }
          ).items.length,
          0,
        );
        assert.equal(
          await guardedProcessing(repo, config).current(itemClaim),
          false,
        );
        assert.equal(
          (
            await send(identity, "/v1/settings/preferences/activate", "POST", {
              expected_version: 1,
              fingerprint: fp,
              action: "activate",
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await send("admin", path, "POST", {
              expected_version: 2,
              changes: { decision_key: null },
            })
          ).status,
          200,
        );
        assert.equal(await effectiveProcessing(repo, config, who), undefined);
        if (mode === "shared") {
          config = configSchema.parse({
            ...config,
            processing: {
              ...config.processing,
              credentials: { mode, administrators: [owner] },
            },
          });
          assert(!(await catalog("admin")).credentials);
          assert.equal((await send("admin", path)).status, 403);
          assert.equal((await send("admin", path, "POST", body)).status, 403);
        }
        if (!mf) {
          const dump = await database.query(
            "SELECT document FROM processing_credentials WHERE scope=$1",
            [slot],
          );
          assert(!JSON.stringify(dump.rows).includes("private-"));
        }
      } finally {
        await mf?.dispose();
        await database.query(
          "DELETE FROM processing_credentials WHERE scope='server'",
        );
        await database.query("DELETE FROM accounts WHERE id=ANY($1::text[])", [
          [admin, owner],
        ]);
        await pool.end();
      }
    });
  }
