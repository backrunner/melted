// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { once } from "node:events";
import { spawn } from "node:child_process";
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
  Source,
  SourceRepository,
} from "../../src/modules/sources/types.js";
import { bluesky, fediverse, event, pubkey } from "../fixtures/social.js";

async function terminal(
  repository: SourceRepository,
  owner: string,
  id: string,
) {
  const deadline = Date.now() + 20000;
  for (;;) {
    const run = await repository.receipt(owner, id);
    if (!["queued", "running"].includes(run.state)) return run;
    if (Date.now() > deadline)
      throw new Error("Timed out waiting for social collection");
    await delay(50);
  }
}
for (const target of ["Node/PostgreSQL", "workerd/SQLite DO + Queues"]) {
  test(`${target}: social plugins collect, replay, revise, reject invalid entries and isolate owners`, async () => {
    const db = process.env.MELTED_TEST_DATABASE_URL;
    assert(db && db !== process.env.DATABASE_URL);
    const { database, pool } = connect(db);
    await migrate(database);
    let revision = 1,
      partial = false,
      relayMode = "complete",
      closeFrames = 0;
    const server = createServer((req, res) => {
      res.setHeader("Content-Type", "application/json");
      if (req.url?.startsWith("/xrpc/")) {
        const data = bluesky("修订 " + revision);
        res.end(
          JSON.stringify({
            feed: [...data.feed, ...(partial ? [{ post: {} }] : [])],
          }),
        );
      } else if (req.url?.startsWith("/api/v1/accounts/lookup"))
        res.end(JSON.stringify({ id: "123" }));
      else
        res.end(
          JSON.stringify([
            ...fediverse("修订 " + revision),
            ...(partial ? [{ visibility: "public" }] : []),
          ]),
        );
    });
    const sockets = new WebSocketServer({ noServer: true });
    server.on("upgrade", (req, socket, head) => {
      if (req.url === "/redirect") {
        socket.end(
          "HTTP/1.1 302 Found\r\nLocation: ws://169.254.169.254/\r\nConnection: close\r\n\r\n",
        );
        return;
      }
      sockets.handleUpgrade(req, socket, head, (ws) =>
        sockets.emit("connection", ws),
      );
    });
    sockets.on("connection", (ws) =>
      ws.on("message", (raw) => {
        const message = JSON.parse(raw.toString()) as unknown[];
        if (message[0] === "CLOSE") {
          closeFrames++;
          return;
        }
        assert.equal(message[0], "REQ");
        const id = message[1];
        if (relayMode === "closed") {
          ws.send(
            JSON.stringify([
              "CLOSED",
              id,
              "auth-required: private upstream detail",
            ]),
          );
          return;
        }
        const value = event({
          kind: 30023,
          content: "修订 " + revision,
          created_at: 1720000000 + revision,
          tags: [
            ["d", "article"],
            ["title", "文化"],
          ],
        });
        ws.send(JSON.stringify(["AUTH", "optional challenge"]));
        ws.send(JSON.stringify(["EVENT", id, value]));
        if (partial)
          ws.send(
            JSON.stringify(["EVENT", id, { ...value, sig: "00".repeat(64) }]),
          );
        ws.send(JSON.stringify(["EOSE", id]));
      }),
    );
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert(address && typeof address !== "string");
    const origin = `http://127.0.0.1:${address.port}`,
      relay = origin.replace("http:", "ws:") + "/";
    const plugins = {
      bluesky: { service_url: origin, allow_private: true },
      fediverse: {
        instances: [
          { origin, allow_private: true, access_token: "private-test-token" },
        ],
      },
      nostr: {
        relays: [
          { url: relay, allow_private: true },
          { url: relay + "redirect", allow_private: true },
        ],
      },
    };
    const config = configSchema.parse({
      serverID: "social-test",
      operator: "test",
      publicOrigin: "http://localhost",
      plugins,
    });
    const mf = target.startsWith("workerd")
      ? new Miniflare(
          convertV4MiniflareOptions({
            name: "social-runtime",
            modules: true,
            scriptPath: ".wrangler/test-build/worker.js",
            compatibilityDate: "2026-10-14",
            compatibilityFlags: ["nodejs_compat"],
            durableObjects: {
              ACCOUNTS: { className: "AccountStore", useSQLite: true },
              CONTROL: { className: "ControlStore", useSQLite: true },
            },
            queueProducers: { COLLECTION_QUEUE: "social-queue" },
            queueConsumers: {
              "social-queue": { maxBatchSize: 1, maxBatchTimeout: 0 },
            },
            bindings: {
              MELTED_SERVER_ID: "social-test",
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
    worker?.stderr?.on("data", (b) => (diagnostics += b.toString()));
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
      const catalog = await (await send("/v1/plugins")).text();
      assert(!catalog.includes("private-test-token"));
      const run = async (s: Source) => {
        const res = await send(`/v1/sources/${s.id}/sync`, "POST");
        assert.equal(res.status, 202);
        return terminal(
          repo.sources,
          owner,
          ((await res.json()) as { receipt_id: string }).receipt_id,
        );
      };
      const sources: Source[] = [];
      for (const [plugin, configuration] of Object.entries({
        bluesky: { target: "bsky.app" },
        fediverse: { instance: origin, target: "writer" },
        nostr: { relay, target: pubkey, kind: "articles" },
      })) {
        const response = await send("/v1/sources", "POST", {
          plugin,
          config_version: 1,
          name: plugin,
          configuration,
          interval_seconds: 900,
        });
        assert.equal(response.status, 201);
        const s = (await response.json()) as Source;
        sources.push(s);
        const first = await run(s);
        assert.equal(first.state, "complete", JSON.stringify(first));
        assert.equal(first.counts.inserted, 1);
        const second = await run(s);
        assert.equal(second.counts.duplicates, 1);
        assert.equal(second.counts.inserted, 0);
        const rows = await repo.sources.items(owner, s.id, null, 100);
        assert.equal(rows.items.length, 1);
        for (const path of [
          `/v1/sources/${s.id}`,
          `/v1/raw-items/${rows.items[0]!.id}`,
          `/v1/receipts/${first.id}`,
        ])
          assert.equal(
            (await send(path, "GET", undefined, stranger.access_token)).status,
            404,
          );
        assert.equal(
          (
            await send(
              `/v1/sources/${s.id}`,
              "PATCH",
              { expected_version: s.version, name: "cross-owner" },
              stranger.access_token,
            )
          ).status,
          404,
        );
      }
      revision = 2;
      for (const s of sources) {
        const r = await run(s);
        assert.equal(r.counts.updated, 1);
        const rows = await repo.sources.items(owner, s.id, null, 100);
        assert.equal(rows.items[0]!.revision, 2);
      }
      partial = true;
      for (const s of sources) {
        const r = await run(s);
        assert.equal(r.state, "partial");
        assert.equal(r.counts.invalid, 1);
        assert.equal(r.counts.duplicates, 1);
      }
      partial = false;
      relayMode = "closed";
      const denied = await run(sources[2]!);
      assert.equal(denied.state, "failed");
      assert.equal(denied.error?.code, "relay_access_required");
      assert((await repo.sources.get(owner, sources[2]!.id)).blocked);
      // Redirect rejection is observed at the actual runtime WebSocket handshake, not a mock.
      const redir = await send("/v1/sources", "POST", {
        plugin: "nostr",
        config_version: 1,
        name: "redirect",
        configuration: { relay: relay + "redirect", target: pubkey },
      });
      const rs = (await redir.json()) as Source;
      const queued = await repo.sources.sync(owner, rs.id, random());
      let redirectRun = await repo.sources.receipt(owner, queued.id);
      const until = Date.now() + 5000;
      while (!redirectRun.error && Date.now() < until) {
        await delay(50);
        redirectRun = await repo.sources.receipt(owner, queued.id);
      }
      assert.equal(
        redirectRun.error?.code,
        "upstream_http_302",
        JSON.stringify(redirectRun),
      );
      assert(closeFrames >= 4);
      assert.equal(diagnostics, "");
    } finally {
      if (worker && worker.exitCode === null) {
        worker.kill("SIGTERM");
        await once(worker, "exit");
      }
      await mf?.dispose();
      for (const client of sockets.clients) client.terminate();
      sockets.close();
      server.closeAllConnections();
      server.close();
      await database.query("DELETE FROM accounts WHERE id=ANY($1::text[])", [
        [owner, other],
      ]);
      await pool.end();
    }
  });
}
