// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from "node:test";
import assert from "node:assert/strict";
import { connect } from "../../src/storage/postgres/connection.js";
import { migrate } from "../../src/storage/postgres/migrations.js";
import { random } from "../../src/shared/crypto.js";
import { PostgresRepository } from "../../src/storage/postgres/repository.js";

test("current PostgreSQL schema initializes and replays without retired account fields or source conversions", async () => {
  const url = process.env.MELTED_TEST_DATABASE_URL;
  assert(url && url !== process.env.DATABASE_URL);
  const admin = connect(url),
    schema =
      "schema_" +
      random()
        .replace(/[^a-z0-9]/gi, "")
        .toLowerCase();
  await admin.database.query(`CREATE SCHEMA ${schema}`);
  const isolated = new URL(url);
  isolated.searchParams.set("options", "-csearch_path=" + schema);
  const { database, pool } = connect(isolated.href);
  try {
    await migrate(database);
    await migrate(database);
    const columns = await database.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='accounts'",
      [schema],
    );
    assert(
      !columns.rows.some((row) =>
        ["email", "password_hash"].includes(row.column_name),
      ),
    );
    const repo = new PostgresRepository(database);
    await repo.health();
    await repo.managedSession("owner");
    const source = await repo.sources.create(
      "owner",
      {
        plugin: "rsshub",
        config_version: 1,
        configuration: { route: "/bbc" },
        name: "Current source",
        enabled: false,
        interval_seconds: 900,
      },
      "create",
    );
    assert.deepEqual(
      (await repo.sources.get("owner", source.id)).configuration,
      { route: "/bbc" },
    );
  } finally {
    await pool.end();
    await admin.database.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.pool.end();
  }
});
