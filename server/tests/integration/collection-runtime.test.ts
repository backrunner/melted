// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import fixture from "../../../contracts/fixtures/rsshub-feed.json" with { type: "json" };
import { CloudRepository } from "../../src/storage/cloudflare/repository.js";
import type { CloudBindings } from "../../src/storage/cloudflare/bindings.js";
import { PostgresRepository } from "../../src/storage/postgres/repository.js";
import { connect } from "../../src/storage/postgres/connection.js";
import { migrate } from "../../src/storage/postgres/migrations.js";
import { hash, random } from "../../src/shared/crypto.js";

async function until<T>(
  read: () => Promise<T>,
  accept: (v: T) => boolean,
  timeout = 20000,
): Promise<T> {
  const end = Date.now() + timeout;
  let last: T;
  do {
    last = await read();
    if (accept(last)) return last;
    await delay(100);
  } while (Date.now() < end);
  throw new Error("Timed out waiting for collection: " + JSON.stringify(last));
}
async function stop(child: ChildProcess, signal: NodeJS.Signals = "SIGTERM") {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill(signal);
  await once(child, "exit");
}
async function feedServer() {
  let calls = 0,
    hold = false;
  const server = createServer((req, res) => {
    if (req.url?.startsWith("/bbc")) {
      calls++;
      if (hold) return;
      res.writeHead(200, {
        "Content-Type": "application/feed+json",
        ETag: '"runtime"',
      });
      res.end(JSON.stringify(fixture));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  return {
    server,
    config: {
      base_url: `http://127.0.0.1:${address.port}`,
      allowed_routes: ["/bbc"],
      allow_private: true,
    },
    calls: () => calls,
    hold: (v: boolean) => {
      hold = v;
    },
    close: () => {
      server.closeAllConnections();
      server.close();
    },
  };
}

test("Cloudflare persisted outbox, real Alarms and Queue consumer survive restart and duplicate delivery", async () => {
  const feed = await feedServer(),
    directory = await mkdtemp(join(tmpdir(), "melted-collection-"));
  const options = (consume: boolean) => {
    const o = convertV4MiniflareOptions({
      name: "collection-runtime",
      modules: true,
      scriptPath: ".wrangler/test-build/worker.js",
      compatibilityDate: "2026-10-14",
      compatibilityFlags: ["nodejs_compat"],
      durableObjects: {
        ACCOUNTS: { className: "AccountStore", useSQLite: true },
        CONTROL: { className: "ControlStore", useSQLite: true },
      },
      durableObjectsPersist: directory,
      bindings: {
        MELTED_SERVER_ID: "runtime",
        PUBLIC_ORIGIN: "http://localhost",
        RSSHUB_CONFIG: JSON.stringify(feed.config),
      },
      ...(consume
        ? {
            queueProducers: { COLLECTION_QUEUE: "collections-test" },
            queueConsumers: {
              "collections-test": { maxBatchSize: 1, maxBatchTimeout: 0 },
            },
          }
        : {}),
    });
    o.resourcePersistencePath = directory;
    o.isolatedResourcePersistencePath = directory;
    o.unsafeInspectDurableObjects = true;
    return o;
  };
  let mf = new Miniflare(options(false));
  const owner = "acc_" + (await hash(random()));
  try {
    let repo = new CloudRepository(await mf.getBindings<CloudBindings>());
    await repo.managedSession(owner);
    const source = await repo.sources.create(
      owner,
      {
        name: "Restart source",
        plugin: "rsshub",
        config_version: 1,
        configuration: { route: "/bbc" },
        enabled: true,
        interval_seconds: 300,
      },
      random(),
    );
    const run = await repo.sources.sync(owner, source.id, random());
    assert.equal((await repo.sources.receipt(owner, run.id)).state, "queued");
    // Simulate the persisted v1 document before the first restart, including a
    // queued job. The new constructor must migrate it without losing its fence.
    const legacyStorage = await mf.unsafeGetDurableObjectStorage(
      "collection-runtime",
      "AccountStore",
      { name: owner },
    );
    await legacyStorage.exec(
      "UPDATE sources SET document=json_remove(json_set(document,'$.route',json_extract(document,'$.configuration.route')),'$.configuration','$.config_version')",
    );
    await legacyStorage.exec(
      "UPDATE source_requests SET response=json_remove(json_set(response,'$.route',json_extract(response,'$.configuration.route')),'$.configuration','$.config_version') WHERE operation='create'",
    );
    await legacyStorage.exec(
      "UPDATE meta SET value='1' WHERE key='source_schema'",
    );
    await mf.dispose();
    mf = new Miniflare(options(true));
    repo = new CloudRepository(await mf.getBindings<CloudBindings>());
    assert.deepEqual((await repo.sources.get(owner, source.id)).configuration, {
      route: "/bbc",
    });
    const completed = await until(
      () => repo.sources.receipt(owner, run.id),
      (r) => r.state === "complete",
    );
    assert.equal(completed.counts.inserted, 3);
    assert.equal(feed.calls(), 1);
    const producer = await mf.getQueueProducer<{
      owner: string;
      run_id: string;
    }>("COLLECTION_QUEUE");
    await producer.send({ owner, run_id: run.id });
    await delay(300);
    assert.equal(feed.calls(), 1);
    assert.equal(
      (await repo.sources.items(owner, source.id, null, 100)).items.length,
      3,
    );
    const storage = await mf.unsafeGetDurableObjectStorage(
      "collection-runtime",
      "AccountStore",
      { name: owner },
    );
    assert.equal(
      (
        await storage.exec<{ count: number }>(
          "SELECT count(*) AS count FROM source_outbox",
        )
      )[0]!.count,
      0,
    );
    // Reconfiguration arms an immediate scheduled slot, without a manual sync.
    await repo.sources.patch(owner, source.id, {
      expected_version: source.version,
      name: "Scheduled after restart",
    });
    await until(
      () => repo.sources.get(owner, source.id),
      (s) => Boolean(s.last_run_id && s.last_run_id !== run.id),
    );
    const scheduled = (await repo.sources.get(owner, source.id)).last_run_id!;
    const duplicate = await until(
      () => repo.sources.receipt(owner, scheduled),
      (r) => r.state === "complete",
    );
    assert.equal(duplicate.trigger, "scheduled");
    assert.equal(duplicate.counts.duplicates, 3);
    await mf.dispose();
    mf = new Miniflare(options(true));
    repo = new CloudRepository(await mf.getBindings<CloudBindings>());
    assert.equal(
      (await repo.sources.items(owner, source.id, null, 100)).items.length,
      3,
    );
    assert.equal((await repo.sources.receipt(owner, run.id)).state, "complete");
  } finally {
    await mf.dispose();
    feed.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("Node collector processes recover a crashed lease and schedule only one committed result", async () => {
  if (
    !process.env.MELTED_TEST_DATABASE_URL ||
    process.env.MELTED_TEST_DATABASE_URL === process.env.DATABASE_URL
  )
    throw new Error("Use a dedicated test database");
  const feed = await feedServer(),
    { database, pool } = connect(process.env.MELTED_TEST_DATABASE_URL),
    repo = new PostgresRepository(database),
    children: ChildProcess[] = [];
  let diagnostics = "";
  const start = () => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "src/entrypoints/collector-worker.ts"],
      {
        env: {
          ...process.env,
          DATABASE_URL: process.env.MELTED_TEST_DATABASE_URL,
          MELTED_SERVER_ID: "runtime",
          PUBLIC_ORIGIN: "http://localhost",
          RSSHUB_CONFIG: JSON.stringify(feed.config),
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    child.stderr!.on("data", (b) => {
      diagnostics += b.toString();
    });
    children.push(child);
    return child;
  };
  const owner = "acc_" + (await hash(random()));
  try {
    await migrate(database);
    await repo.managedSession(owner);
    const source = await repo.sources.create(
      owner,
      {
        name: "Crash recovery",
        plugin: "rsshub",
        config_version: 1,
        configuration: { route: "/bbc" },
        enabled: true,
        interval_seconds: 300,
      },
      random(),
    );
    feed.hold(true);
    const first = start();
    await until(
      async () => feed.calls(),
      (n) => n >= 1,
    );
    await stop(first, "SIGKILL");
    const runID = (await repo.sources.get(owner, source.id)).last_run_id!;
    assert.equal((await repo.sources.receipt(owner, runID)).state, "running");
    // Advance just the persisted lease clock, avoiding a 90-second test sleep.
    await database.query(
      "UPDATE source_runs SET lease_until=0,document=jsonb_set(document,'{lease_until}','0') WHERE owner=$1 AND id=$2",
      [owner, runID],
    );
    feed.server.closeAllConnections();
    feed.hold(false);
    start();
    start();
    const completed = await until(
      () => repo.sources.receipt(owner, runID),
      (r) => r.state === "complete",
    );
    assert.equal(completed.attempts, 2);
    assert.equal(completed.counts.inserted, 3);
    assert.equal(
      (await repo.sources.items(owner, source.id, null, 100)).items.length,
      3,
    );
    assert.equal(feed.calls(), 2);
    assert.equal(diagnostics, "");
    await repo.sources.remove(owner, source.id, source.version);
  } finally {
    await Promise.all(children.map((c) => stop(c)));
    feed.close();
    await pool.end();
  }
});
