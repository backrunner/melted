// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { readFile, readdir } from "node:fs/promises";
import { Database } from "./database.js";

export async function migrate(
  database: Database,
  directory = new URL("../../../migrations/", import.meta.url),
) {
  // Source and compiled layouts both receive a migrations directory at packaging time.
  const names = (await readdir(directory))
    .filter((name) => /^\d+_.*\.sql$/.test(name))
    .sort();
  await database.transaction(async (connection) => {
    await connection.query("SELECT pg_advisory_xact_lock(72635119)");
    await connection.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY)",
    );
    for (const name of names) {
      if (
        (
          await connection.query(
            "SELECT 1 FROM schema_migrations WHERE version=$1",
            [name],
          )
        ).rowCount
      )
        continue;
      await connection.query(await readFile(new URL(name, directory), "utf8"));
      await connection.query(
        "INSERT INTO schema_migrations(version) VALUES($1)",
        [name],
      );
    }
  });
}
