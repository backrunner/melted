// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { DatabaseSync } from "node:sqlite";

/** Persist admission before any model call. Unknown interrupted outcomes never re-execute. */
export class RunLedger {
  private readonly db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS agent_runs (id TEXT PRIMARY KEY, hash TEXT NOT NULL, created INTEGER NOT NULL, result TEXT)",
    );
    this.expire();
  }
  expire() {
    // Keep identity tombstones; replace old source bodies on startup and periodic maintenance.
    this.db
      .prepare(
        "UPDATE agent_runs SET result=? WHERE created < ? AND result IS NOT NULL",
      )
      .run(
        JSON.stringify({ error: "agent_result_expired" }),
        Date.now() - 86400000,
      );
  }
  replay(id: string, hash: string): { value: unknown } | undefined {
    const row = this.db
      .prepare("SELECT hash,result FROM agent_runs WHERE id=?")
      .get(id);
    if (!row) return undefined;
    return {
      value:
        row.hash !== hash
          ? { error: "agent_execution_conflict" }
          : row.result
            ? JSON.parse(String(row.result))
            : { error: "agent_run_indeterminate" },
    };
  }
  admit(
    id: string,
    hash: string,
    dailyLimit: number,
  ): { fresh: boolean; value?: unknown } {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const replay = this.replay(id, hash);
      if (replay) return { fresh: false, ...replay };
      const count = this.db
        .prepare("SELECT COUNT(*) AS n FROM agent_runs WHERE created > ?")
        .get(Date.now() - 86400000)!;
      if (Number(count.n) >= dailyLimit)
        return { fresh: false, value: { error: "agent_daily_limit" } };
      this.db
        .prepare("INSERT INTO agent_runs(id,hash,created) VALUES(?,?,?)")
        .run(id, hash, Date.now());
      return { fresh: true };
    } finally {
      this.db.exec("COMMIT");
    }
  }
  complete(id: string, value: unknown) {
    this.db
      .prepare("UPDATE agent_runs SET result=? WHERE id=? AND result IS NULL")
      .run(JSON.stringify(value), id);
  }
  close() {
    this.db.close();
  }
}
