// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { connect } from "../../src/storage/postgres/connection.js";
import { migrate } from "../../src/storage/postgres/migrations.js";
import { PostgresSources } from "../../src/storage/postgres/sources/repository.js";
import { hash, random } from "../../src/shared/crypto.js";
import { legacyCreate } from "../../src/plugins/rsshub/legacy.js";

test("PostgreSQL upgrades RSSHub documents and idempotency receipts from migration 003 without replacing source IDs", async () => {
  const url = process.env.MELTED_TEST_DATABASE_URL;
  assert(url && url !== process.env.DATABASE_URL);
  const admin = connect(url),
    schema =
      "plugins_" +
      random()
        .replace(/[^a-z0-9]/gi, "")
        .toLowerCase();
  await admin.database.query(`CREATE SCHEMA ${schema}`);
  const isolated = new URL(url);
  isolated.searchParams.set("options", "-csearch_path=" + schema);
  const { database, pool } = connect(isolated.href);
  try {
    await database.query(
      "CREATE TABLE schema_migrations(version text PRIMARY KEY)",
    );
    for (const file of [
      "001_initial.sql",
      "002_credentials.sql",
      "003_sources.sql",
    ]) {
      await database.query(
        await readFile(
          new URL("../../migrations/" + file, import.meta.url),
          "utf8",
        ),
      );
      await database.query(
        "INSERT INTO schema_migrations(version) VALUES($1)",
        [file],
      );
    }
    await database.query("INSERT INTO accounts(id) VALUES('owner')");
    const input = {
      name: "Preserved",
      route: "/bbc",
      interval_seconds: 3600,
      enabled: false,
    };
    const old = {
      ...input,
      id: "src_preserved",
      plugin: "rsshub",
      version: 4,
      generation: 4,
      checkpoint: { etag: "old-validator" },
      deleted: false,
      blocked: false,
      next_poll_at: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_success_at: null,
      last_run_id: null,
      last_error: null,
    };
    const fingerprint = await hash(JSON.stringify(input));
    await database.query(
      "INSERT INTO sources(owner,id,document,enabled,blocked,deleted,next_poll) VALUES('owner',$1,$2,false,false,false,0)",
      [old.id, old],
    );
    await database.query(
      "INSERT INTO source_requests(owner,operation,key,payload_hash,response,created) VALUES('owner','create','original',$1,$2,$3)",
      [fingerprint, old, Date.now()],
    );
    await migrate(database);
    await migrate(database);
    const sources = new PostgresSources(database),
      source = await sources.get("owner", old.id);
    assert.deepEqual(source.configuration, { route: "/bbc" });
    assert.equal(source.config_version, 1);
    assert.equal(source.version, 4);
    assert.equal(source.enabled, false);
    assert.equal(source.checkpoint.etag, "old-validator");
    assert.equal("route" in source, false);
    const replay = await sources.create(
      "owner",
      legacyCreate(input)!.input,
      "original",
      fingerprint,
    );
    assert.equal(replay.id, old.id);
    assert.deepEqual(replay.configuration, source.configuration);
    assert.equal((await sources.list("owner")).length, 1);
  } finally {
    await pool.end();
    await admin.database.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.pool.end();
  }
});
