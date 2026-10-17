// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { startGateway } from "../../src/agent-gateway/service.js";
import { ACPClient } from "../../src/agent-gateway/acp.js";
import { connect } from "../../src/storage/postgres/connection.js";
import { migrate } from "../../src/storage/postgres/migrations.js";
import { PostgresRepository } from "../../src/storage/postgres/repository.js";
import { CloudRepository } from "../../src/storage/cloudflare/repository.js";
import type { CloudBindings } from "../../src/storage/cloudflare/bindings.js";
import { createApp } from "../../src/http/app.js";
import { configSchema } from "../../src/config/schema.js";
import { hash, random } from "../../src/shared/crypto.js";
import type { Source } from "../../src/modules/sources/types.js";

for (const target of ["Node/PostgreSQL", "workerd/SQLite DO + Queues"]) {
  test(`${target}: ACP gateway collection uses durable execution IDs, revisions, partial failures and account/generation fences`, async () => {
    const db = process.env.MELTED_TEST_DATABASE_URL;
    assert(db && db !== process.env.DATABASE_URL);
    const { database, pool } = connect(db);
    await migrate(database);
    const directory = await mkdtemp(join(tmpdir(), "melted-acp-runtime-"));
    const profile = {
      id: "public",
      label: "Public",
      allowed_origins: ["https://news.example.org"],
      model_origin: "https://api.deepseek.com",
    };
    const token = "private-integration-key-".repeat(2);
    let revision = 1,
      partial = false,
      held = false,
      started = false,
      release: (() => void) | undefined;
    const gateway = await startGateway(
      {
        data_directory: directory,
        dsh_package_directory: "/test-runtime",
        port: 0,
        profiles: [profile],
      },
      { MELTED_AGENT_GATEWAY_TOKEN: token },
      {
        transport: (async () =>
          new Response(
            JSON.stringify({
              version: "https://jsonfeed.org/version/1.1",
              title: "Culture",
              items: [
                {
                  id: "event",
                  title: "Original",
                  content_text: `Revision ${revision}`,
                },
                ...(partial ? [{}] : []),
              ],
            }),
            { headers: { "Content-Type": "application/feed+json" } },
          )) as typeof fetch,
        runner: async (i) => {
          if (held) {
            started = true;
            await new Promise<void>((resolve) => {
              release = resolve;
            });
          }
          const client = new ACPClient(
            process.execPath,
            [resolve("tests/fixtures/acp-agent.mjs")],
            i.cwd,
            {},
            i.signal,
          );
          try {
            await client.run(i.cwd, i.mcp, i.prompt);
          } finally {
            await client.close();
          }
        },
      },
    );
    const plugins = {
      "deepseek-harness": {
        gateway_origin: gateway.origin,
        allow_private: true,
        access_token: token,
        profiles: [profile],
      },
    };
    const config = configSchema.parse({
      serverID: "acp-test",
      operator: "test",
      publicOrigin: "http://localhost",
      plugins,
    });
    const mf = target.startsWith("workerd")
      ? new Miniflare(
          convertV4MiniflareOptions({
            name: "acp-runtime",
            modules: true,
            scriptPath: ".wrangler/test-build/worker.js",
            compatibilityDate: "2026-10-14",
            compatibilityFlags: ["nodejs_compat"],
            durableObjects: {
              ACCOUNTS: { className: "AccountStore", useSQLite: true },
              CONTROL: { className: "ControlStore", useSQLite: true },
            },
            queueProducers: { COLLECTION_QUEUE: "acp-queue" },
            queueConsumers: {
              "acp-queue": { maxBatchSize: 1, maxBatchTimeout: 0 },
            },
            bindings: {
              MELTED_SERVER_ID: "acp-test",
              PUBLIC_ORIGIN: "http://localhost",
              PLUGIN_CONFIG: JSON.stringify(plugins),
            },
          }),
        )
      : undefined;
    const worker = !mf
      ? spawn(
          process.execPath,
          ["--import", "tsx", "src/entrypoints/collector-worker.ts"],
          {
            env: {
              ...process.env,
              DATABASE_URL: db,
              PLUGIN_CONFIG: JSON.stringify(plugins),
            },
            stdio: "pipe",
          },
        )
      : undefined;
    let diagnostics = "";
    worker?.stderr?.on("data", (b) => {
      diagnostics += b.toString();
    });
    const repo = mf
      ? new CloudRepository(await mf.getBindings<CloudBindings>())
      : new PostgresRepository(database);
    const owner = "acc_" + (await hash(random())),
      other = "acc_" + (await hash(random()));
    try {
      const session = await repo.managedSession(owner),
        stranger = await repo.managedSession(other),
        app = createApp();
      const send = (
        path: string,
        method = "GET",
        body?: unknown,
        access = session.access_token,
      ) => {
        const init = {
          method,
          headers: {
            Authorization: `Bearer ${access}`,
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
      const terminal = async (id: string) => {
        const until = Date.now() + 20000;
        for (;;) {
          const run = await repo.sources.receipt(owner, id);
          if (!["queued", "running"].includes(run.state)) return run;
          if (Date.now() > until) throw new Error("ACP receipt timeout");
          await delay(30);
        }
      };
      const created = await send("/v1/sources", "POST", {
        plugin: "deepseek-harness",
        config_version: 1,
        name: "Agent culture",
        configuration: {
          profile: "public",
          goal: "Culture",
          start_url: "https://news.example.org/feed.json",
        },
        interval_seconds: 86400,
      });
      assert.equal(created.status, 201);
      const source = (await created.json()) as Source;
      const collect = async () => {
        const response = await send(`/v1/sources/${source.id}/sync`, "POST");
        assert.equal(response.status, 202);
        return terminal(
          ((await response.json()) as { receipt_id: string }).receipt_id,
        );
      };
      const first = await collect();
      assert.equal(first.state, "complete", JSON.stringify(first));
      assert.equal(first.counts.inserted, 1);
      assert.equal((await collect()).counts.duplicates, 1);
      revision++;
      assert.equal((await collect()).counts.updated, 1);
      partial = true;
      const incomplete = await collect();
      assert.equal(incomplete.state, "partial");
      assert.equal(incomplete.counts.invalid, 1);
      partial = false;
      const items = await repo.sources.items(owner, source.id, null, 10);
      assert.equal(items.items[0]!.revision, 2);
      for (const path of [
        `/v1/sources/${source.id}`,
        `/v1/receipts/${first.id}`,
        `/v1/raw-items/${items.items[0]!.id}`,
      ])
        assert.equal(
          (await send(path, "GET", undefined, stranger.access_token)).status,
          404,
        );
      const catalog = await (await send("/v1/plugins")).text();
      assert(!catalog.includes(token));
      assert(catalog.includes("deepseek-harness"));
      held = true;
      const pending = await send(`/v1/sources/${source.id}/sync`, "POST");
      const receipt = ((await pending.json()) as { receipt_id: string })
        .receipt_id;
      const until = Date.now() + 10000;
      while (!started && Date.now() < until) await delay(30);
      assert(started);
      const disabled = await send(`/v1/sources/${source.id}`, "PATCH", {
        expected_version: source.version,
        enabled: false,
      });
      assert.equal(disabled.status, 200);
      revision++;
      release!();
      assert.equal((await terminal(receipt)).state, "cancelled");
      await delay(400);
      assert.equal(
        (await repo.sources.items(owner, source.id, null, 10)).items[0]!
          .revision,
        2,
      );
      assert.equal(diagnostics, "");
    } finally {
      release?.();
      if (worker && worker.exitCode === null) {
        worker.kill("SIGTERM");
        await once(worker, "exit");
      }
      await mf?.dispose();
      await gateway.close();
      await database.query("DELETE FROM accounts WHERE id=ANY($1::text[])", [
        [owner, other],
      ]);
      await pool.end();
      await rm(directory, { recursive: true, force: true });
    }
  });
}
