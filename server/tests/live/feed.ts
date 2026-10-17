// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Explicit, opt-in public-source verification; never part of deterministic CI.
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, writeFile, mkdtemp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { configFromEnv } from "../../src/config/schema.js";
import { connect } from "../../src/storage/postgres/connection.js";
import { migrate } from "../../src/storage/postgres/migrations.js";
import { PostgresRepository } from "../../src/storage/postgres/repository.js";
import { CloudRepository } from "../../src/storage/cloudflare/repository.js";
import type { CloudBindings } from "../../src/storage/cloudflare/bindings.js";
import type { Repository } from "../../src/storage/repository.js";
import type { SourceRepository, Run } from "../../src/modules/sources/types.js";
import { hash, random } from "../../src/shared/crypto.js";

const config = configFromEnv(process.env);
if (
  !config.plugins?.feed ||
  !process.env.MELTED_TEST_DATABASE_URL ||
  process.env.MELTED_TEST_DATABASE_URL === process.env.DATABASE_URL
)
  throw new Error("Configure Feed and a dedicated test database");
const { database, pool } = connect(process.env.MELTED_TEST_DATABASE_URL),
  pg = new PostgresRepository(database);
await migrate(database);
const directory = await mkdtemp(join(tmpdir(), "melted-live-feed-"));
const mf = new Miniflare(
  convertV4MiniflareOptions({
    name: "feed-live",
    modules: true,
    scriptPath: ".wrangler/test-build/worker.js",
    compatibilityDate: "2026-10-14",
    compatibilityFlags: ["nodejs_compat"],
    durableObjects: {
      ACCOUNTS: { className: "AccountStore", useSQLite: true },
      CONTROL: { className: "ControlStore", useSQLite: true },
    },
    durableObjectsPersist: directory,
    queueProducers: { COLLECTION_QUEUE: "feed-live-queue" },
    queueConsumers: {
      "feed-live-queue": { maxBatchSize: 1, maxBatchTimeout: 0 },
    },
    bindings: {
      MELTED_SERVER_ID: "feed-live",
      PUBLIC_ORIGIN: "http://localhost",
      PLUGIN_CONFIG: JSON.stringify(config.plugins),
    },
  }),
);
const owner = "acc_" + (await hash(random()));
const worker = spawn(
  process.execPath,
  ["dist/server/src/entrypoints/collector-worker.js"],
  {
    env: { ...process.env, DATABASE_URL: process.env.MELTED_TEST_DATABASE_URL },
    stdio: ["ignore", "ignore", "pipe"],
  },
);
let workerErrors = 0;
worker.stderr.on("data", () => workerErrors++);
async function terminal(s: SourceRepository, run: string): Promise<Run> {
  const end = Date.now() + 180000;
  for (;;) {
    const r = await s.receipt(owner, run);
    if (!["queued", "running"].includes(r.state)) return r;
    if (Date.now() > end) return r;
    await delay(250);
  }
}
async function verify(name: string, repo: Repository) {
  await repo.managedSession(owner);
  const results = [];
  for (const [category, url] of [
    ["RSS", "https://feeds.bbci.co.uk/news/world/rss.xml"],
    ["Atom", "https://github.com/DIYgod/RSSHub/releases.atom"],
    ["JSON Feed", "https://www.jsonfeed.org/feed.json"],
  ]) {
    const source = await repo.sources.create(
      owner,
      {
        name: category!,
        plugin: "feed",
        config_version: 1,
        configuration: { url: url!, format: "auto", max_items: 100 },
        interval_seconds: 900,
        enabled: true,
      },
      random(),
    );
    const first = await terminal(
      repo.sources,
      (await repo.sources.sync(owner, source.id, random())).id,
    );
    const items = await repo.sources.items(owner, source.id, null, 100);
    const second = ["complete", "partial"].includes(first.state)
      ? await terminal(
          repo.sources,
          (await repo.sources.sync(owner, source.id, random())).id,
        )
      : null;
    results.push({
      category,
      url,
      first: {
        started_at: first.started_at,
        finished_at: first.finished_at,
        state: first.state,
        counts: first.counts,
        error: first.error,
        warnings: first.warnings,
      },
      stored: items.items.length,
      repeat: second
        ? {
            started_at: second.started_at,
            finished_at: second.finished_at,
            state: second.state,
            counts: second.counts,
            error: second.error,
          }
        : null,
      published_dates: items.items
        .flatMap((i) => (i.published_at ? [i.published_at] : []))
        .sort()
        .slice(-2),
    });
  }
  return { runtime: name, results };
}
try {
  const cloud = new CloudRepository(await mf.getBindings<CloudBindings>());
  const results = await Promise.all([
    verify("compiled Node/PostgreSQL", pg),
    verify("workerd/SQLite DO + Alarms + Queues", cloud),
  ]);
  const report = {
    tested_at: new Date().toISOString(),
    plugin: "feed@1.0.0",
    worker_errors: workerErrors,
    results,
  };
  const output = process.argv[2];
  if (output) {
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  }
  console.log(JSON.stringify(report, null, 2));
  if (
    results.some((t) =>
      t.results.some(
        (r) =>
          r.first.state !== "complete" ||
          r.stored === 0 ||
          r.repeat?.state !== "complete" ||
          r.repeat.counts.inserted !== 0,
      ),
    )
  )
    process.exitCode = 1;
} finally {
  if (worker.exitCode === null) {
    worker.kill("SIGTERM");
    await once(worker, "exit");
  }
  await mf.dispose();
  await database.query("DELETE FROM accounts WHERE id=$1", [owner]);
  await pool.end();
  await rm(directory, { recursive: true, force: true });
}
