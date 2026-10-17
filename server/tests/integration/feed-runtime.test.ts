// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { connect } from "../../src/storage/postgres/connection.js";
import { migrate } from "../../src/storage/postgres/migrations.js";
import { PostgresRepository } from "../../src/storage/postgres/repository.js";
import { CloudRepository } from "../../src/storage/cloudflare/repository.js";
import type { CloudBindings } from "../../src/storage/cloudflare/bindings.js";
import { createApp } from "../../src/http/app.js";
import { configSchema } from "../../src/config/schema.js";
import { hash, random } from "../../src/shared/crypto.js";
import type {
  Run,
  Source,
  SourceRepository,
} from "../../src/modules/sources/types.js";

const rss = await readFile("../contracts/fixtures/feed-rss.xml", "utf8");
const atom = await readFile("../contracts/fixtures/feed-atom.xml", "utf8");
async function terminal(
  repository: SourceRepository,
  owner: string,
  id: string,
): Promise<Run> {
  const end = Date.now() + 20000;
  for (;;) {
    const run = await repository.receipt(owner, id);
    if (!["queued", "running"].includes(run.state)) return run;
    if (Date.now() > end) throw new Error("Timed out waiting for feed receipt");
    await delay(100);
  }
}
for (const target of [
  "Node/PostgreSQL",
  "workerd/SQLite DO + Queues",
] as const) {
  test(`${target}: independent Feed plugin uses DSL, durable collection, revisions, conditional requests and owner isolation`, async () => {
    const db = process.env.MELTED_TEST_DATABASE_URL;
    assert(db && db !== process.env.DATABASE_URL);
    const { database, pool } = connect(db);
    await migrate(database);
    let revision = 1,
      partial = false,
      calls = 0;
    const server = createServer((req, res) => {
      calls++;
      const etag = `"${revision}${partial ? "partial" : ""}"`;
      if (req.headers["if-none-match"] === etag) {
        res.writeHead(304);
        res.end();
        return;
      }
      if (req.url === "/redirect") {
        res.writeHead(302, { Location: "http://169.254.169.254/metadata" });
        res.end();
        return;
      }
      const content =
        req.url === "/atom"
          ? atom
          : req.url === "/json"
            ? JSON.stringify({
                version: "https://jsonfeed.org/version/1.1",
                title: "JSON",
                items: [{ id: "one", content_text: "One" }],
              })
            : rss
                .replace("书与城市", revision === 1 ? "书与城市" : "修订标题")
                .replace(
                  "</channel>",
                  partial
                    ? "<item><guid>bad</guid></item></channel>"
                    : "</channel>",
                );
      res.writeHead(200, {
        "Content-Type":
          req.url === "/json" ? "application/feed+json" : "application/xml",
        ETag: etag,
      });
      res.end(content);
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert(address && typeof address !== "string");
    const origin = `http://127.0.0.1:${address.port}`;
    const plugins = { feed: { private_origins: [origin] } };
    const config = configSchema.parse({
      serverID: "feed-test",
      operator: "test",
      publicOrigin: "http://localhost",
      plugins,
    });
    const mf = target.startsWith("workerd")
      ? new Miniflare(
          convertV4MiniflareOptions({
            name: "feed-runtime",
            modules: true,
            scriptPath: ".wrangler/test-build/worker.js",
            compatibilityDate: "2026-10-14",
            compatibilityFlags: ["nodejs_compat"],
            durableObjects: {
              ACCOUNTS: { className: "AccountStore", useSQLite: true },
              CONTROL: { className: "ControlStore", useSQLite: true },
            },
            queueProducers: { COLLECTION_QUEUE: "feed-queue" },
            queueConsumers: {
              "feed-queue": { maxBatchSize: 1, maxBatchTimeout: 0 },
            },
            bindings: {
              MELTED_SERVER_ID: "feed-test",
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
        stranger = await repo.managedSession(other);
      const app = createApp();
      const send = (
        path: string,
        method = "GET",
        body?: unknown,
        token = session.access_token,
      ) => {
        const init = {
          method,
          headers: {
            Authorization: "Bearer " + token,
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
      const catalog = (await (await send("/v1/plugins/feed")).json()) as {
        available: boolean;
        form: { fields: { format?: string }[] };
      };
      assert(catalog.available);
      assert.equal(catalog.form.fields[0]!.format, "url");
      const run = async (source: Source) => {
        const accepted = await send(
          `/v1/sources/${source.id}/actions/sync`,
          "POST",
          {
            plugin_version: "1.0.0",
            expected_version: source.version,
            input: {},
          },
        );
        assert.equal(accepted.status, 202);
        const body = (await accepted.json()) as { receipt_id: string };
        return terminal(repo.sources, owner, body.receipt_id);
      };
      const sources: Source[] = [];
      for (const path of ["rss", "atom", "json"]) {
        const response = await send("/v1/sources", "POST", {
          plugin: "feed",
          config_version: 1,
          name: path,
          configuration: { url: origin + "/" + path },
          interval_seconds: 900,
        });
        assert.equal(response.status, 201);
        const source = (await response.json()) as Source;
        sources.push(source);
        const receipt = await run(source);
        assert.equal(receipt.state, "complete");
        assert.equal(receipt.counts.inserted, path === "json" ? 1 : 2);
        const again = await run(source);
        assert.equal(again.state, "complete");
        assert.equal(again.counts.received, 0);
        assert.equal(again.counts.inserted, 0);
      }
      assert.equal(
        ((await (await send("/v1/sources")).json()) as { sources: unknown[] })
          .sources.length,
        3,
      );
      assert.equal(
        (
          await send("/v1/sources", "POST", {
            plugin: "feed",
            config_version: 1,
            name: "Blocked",
            configuration: { url: "http://169.254.169.254/feed" },
          })
        ).status,
        403,
      );
      const s = sources[0]!;
      const firstItems = await repo.sources.items(owner, s.id, null, 100);
      assert.equal(
        (
          await send(
            `/v1/sources/${s.id}`,
            "GET",
            undefined,
            stranger.access_token,
          )
        ).status,
        404,
      );
      assert.equal(
        (
          await send(
            `/v1/sources/${s.id}`,
            "PATCH",
            { expected_version: s.version, name: "Other" },
            stranger.access_token,
          )
        ).status,
        404,
      );
      assert.equal(
        (
          await send(
            `/v1/raw-items/${firstItems.items[0]!.id}`,
            "GET",
            undefined,
            stranger.access_token,
          )
        ).status,
        404,
      );
      revision = 2;
      const updated = await run(s);
      assert.equal(updated.counts.updated, 1);
      assert.equal(updated.counts.duplicates, 1);
      const rows = await repo.sources.items(owner, s.id, null, 100);
      const revised = rows.items.find((i) => i.title === "修订标题")!;
      assert(revised);
      assert.equal(
        (await repo.sources.raw(owner, revised.id, 1)).content.title,
        "书与城市",
      );
      partial = true;
      const checkpoint = (await repo.sources.get(owner, s.id)).checkpoint;
      const failedItem = await run(s);
      assert.equal(failedItem.state, "partial");
      assert.equal(failedItem.counts.invalid, 1);
      assert.deepEqual(
        (await repo.sources.get(owner, s.id)).checkpoint,
        checkpoint,
      );
      partial = false;
      assert.equal((await run(s)).state, "complete");
      const redirect = await send("/v1/sources", "POST", {
        plugin: "feed",
        config_version: 1,
        name: "Redirect",
        configuration: { url: origin + "/redirect" },
      });
      const blocked = await run((await redirect.json()) as Source);
      assert.equal(blocked.state, "failed");
      assert.equal(blocked.error?.code, "upstream_http_302");
      assert(calls >= 10);
      assert.equal(diagnostics, "");
    } finally {
      if (worker && worker.exitCode === null) {
        worker.kill("SIGTERM");
        await once(worker, "exit");
      }
      await mf?.dispose();
      server.closeAllConnections();
      server.close();
      await database.query("DELETE FROM accounts WHERE id=ANY($1::text[])", [
        [owner, other],
      ]);
      await pool.end();
    }
  });
}
