// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import type { AccountDatabase } from "../sqlite.js";
import type { Source, Run } from "../../../modules/sources/types.js";
import { Problem } from "../../../shared/problem.js";
import { id } from "../../../shared/crypto.js";
import { cancelled } from "../../../modules/sources/lifecycle.js";

export class SourceRecords {
  constructor(readonly db: AccountDatabase) {}
  source(id: string, includeDeleted = false): Source {
    const row = this.db.first<{ document: string }>(
      "SELECT document FROM sources WHERE id=?",
      id,
    );
    if (!row) throw new Problem(404, "source_not_found");
    const s = JSON.parse(row.document) as Source;
    if (s.deleted && !includeDeleted)
      throw new Problem(404, "source_not_found");
    return s;
  }
  run(id: string): Run {
    const row = this.db.first<{ document: string }>(
      "SELECT document FROM source_runs WHERE id=?",
      id,
    );
    if (!row) throw new Problem(404, "receipt_not_found");
    return JSON.parse(row.document) as Run;
  }
  saveSource(s: Source) {
    this.db.sql.exec(
      "INSERT INTO sources(id,document,enabled,blocked,deleted,next_poll) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document,enabled=excluded.enabled,blocked=excluded.blocked,deleted=excluded.deleted,next_poll=excluded.next_poll",
      s.id,
      JSON.stringify(s),
      Number(s.enabled),
      Number(s.blocked),
      Number(s.deleted),
      s.next_poll_at,
    );
  }
  saveRun(r: Run) {
    this.db.sql.exec(
      "INSERT INTO source_runs(id,source_id,slot,document,state,available,lease_until) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document,state=excluded.state,available=excluded.available,lease_until=excluded.lease_until",
      r.id,
      r.source_id,
      r.slot,
      JSON.stringify(r),
      r.state,
      r.available_at,
      r.lease_until,
    );
    this.db.sql.exec("DELETE FROM source_outbox WHERE run_id=?", r.id);
    if (r.state === "queued") this.queue(r.id, r.available_at);
  }
  queue(run: string, due: number) {
    this.db.sql.exec(
      "INSERT OR IGNORE INTO source_outbox(run_id,token,due) VALUES(?,?,?)",
      run,
      id("dispatch"),
      due,
    );
  }
  cancel(source: string, now: number) {
    const rows = this.db.sql
      .exec<{ document: string }>(
        "SELECT document FROM source_runs WHERE source_id=? AND state IN ('queued','running')",
        source,
      )
      .toArray();
    for (const r of rows)
      this.saveRun(cancelled(JSON.parse(r.document) as Run, now));
  }
  replay<T>(
    operation: string,
    key: string,
    payload: string,
    now: number,
  ): T | undefined {
    this.db.sql.exec(
      "DELETE FROM source_requests WHERE created<?",
      now - 7 * 86400_000,
    );
    const row = this.db.first<{ payload_hash: string; response: string }>(
      "SELECT payload_hash,response FROM source_requests WHERE operation=? AND key=?",
      operation,
      key,
    );
    if (row && row.payload_hash !== payload)
      throw new Problem(409, "idempotency_conflict");
    return row ? (JSON.parse(row.response) as T) : undefined;
  }
  remember(
    operation: string,
    key: string,
    payload: string,
    response: unknown,
    now: number,
  ) {
    this.db.sql.exec(
      "INSERT INTO source_requests(operation,key,payload_hash,response,created) VALUES(?,?,?,?,?)",
      operation,
      key,
      payload,
      JSON.stringify(response),
      now,
    );
  }
}
