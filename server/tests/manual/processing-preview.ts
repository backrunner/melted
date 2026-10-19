// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Isolated native UI acceptance server. Synthetic model transport, never a quality test.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { connect } from "../../src/storage/postgres/connection.js";
import { migrate } from "../../src/storage/postgres/migrations.js";
import { PostgresRepository } from "../../src/storage/postgres/repository.js";
assert.equal(process.env.MELTED_SYNTHETIC_PREVIEW, "1");
assert(process.env.MELTED_TEST_DATABASE_URL);
// Keep the interactive acceptance worker away from the integration suite's public schema.
const admin = connect(process.env.MELTED_TEST_DATABASE_URL);
await admin.database.query(
  "CREATE SCHEMA IF NOT EXISTS melted_processing_preview",
);
await admin.pool.end();
const previewURL = new URL(process.env.MELTED_TEST_DATABASE_URL);
previewURL.searchParams.set(
  "options",
  "-csearch_path=melted_processing_preview",
);
process.env.MELTED_TEST_DATABASE_URL = previewURL.href;
process.env.DATABASE_URL = previewURL.href;
assert.equal(
  JSON.parse(process.env.PROCESSING_CONFIG!).credentials.mode,
  "byok",
);
await import("../fixtures/processing-worker-hook.js");
const { database, pool } = connect();
await migrate(database);
const repo = new PostgresRepository(database),
  started = new Date().toISOString();
const worker = spawn(
  process.execPath,
  [
    "--import",
    "tsx",
    "--import",
    "./tests/fixtures/processing-worker-hook.ts",
    "src/entrypoints/collector-worker.ts",
  ],
  { env: process.env, stdio: "inherit" },
);
let busy = false;
const seed = setInterval(() => {
  void (async () => {
    if (busy) return;
    busy = true;
    try {
      const rows = await database.query<{ scope: string }>(
        "SELECT scope FROM processing_credentials WHERE scope LIKE 'account:%' AND document->>'updated_at'>=$1",
        [started],
      );
      for (const row of rows.rows) {
        const owner = row.scope.slice("account:".length);
        await repo.sources.create(
          owner,
          {
            plugin: "feed",
            config_version: 1,
            name: "合成验收：文化活动",
            configuration: { url: "https://feed.example/test" },
            interval_seconds: 900,
            enabled: true,
          },
          "synthetic-preview-source",
        );
      }
    } catch {
      console.error("Synthetic preview seed unavailable");
    } finally {
      busy = false;
    }
  })();
}, 1000);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    clearInterval(seed);
    worker.kill(signal);
    void pool.end();
  });
await import("../../src/entrypoints/node.js");
