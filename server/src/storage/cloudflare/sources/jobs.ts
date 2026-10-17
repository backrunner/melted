// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import type {
  Source,
  Run,
  Claim,
  PollResult,
  PollFailure,
} from "../../../modules/sources/types.js";
import {
  newRun,
  claimed,
  canClaim,
  canCommit,
  failed,
  iso,
} from "../../../modules/sources/lifecycle.js";
import { SourceRecords } from "./records.js";
import { ingest } from "./ingest.js";

export class AccountSourceJobs extends SourceRecords {
  enqueue(
    source: Source,
    trigger: Run["trigger"],
    slot: string,
    now: number,
  ): Run {
    const row = this.db.first<{ document: string }>(
      "SELECT document FROM source_runs WHERE source_id=? AND state IN ('queued','running') ORDER BY available LIMIT 1",
      source.id,
    );
    const run = row
      ? (JSON.parse(row.document) as Run)
      : newRun(source, trigger, slot, now);
    if (!row) this.saveRun(run);
    this.saveSource({
      ...source,
      last_run_id: run.id,
      blocked: false,
      next_poll_at: now + source.interval_seconds * 1000,
    });
    return run;
  }
  schedule(now = Date.now()) {
    this.db.transaction(() => {
      const due = this.db.sql
        .exec<{ document: string }>(
          "SELECT document FROM sources WHERE enabled=1 AND blocked=0 AND deleted=0 AND next_poll<=? ORDER BY next_poll LIMIT 100",
          now,
        )
        .toArray();
      for (const row of due) {
        const s = JSON.parse(row.document) as Source;
        this.enqueue(
          s,
          "scheduled",
          `scheduled:${s.generation}:${s.next_poll_at}`,
          now,
        );
      }
      // A queue message may have been acknowledged before a consumer crash. The
      // persistent lease/watchdog recreates dispatches without resetting fencing.
      for (const row of this.db.sql
        .exec<{ id: string; available: number }>(
          "SELECT id,available FROM source_runs WHERE (state='queued' OR (state='running' AND lease_until<=?)) AND available<=?",
          now,
          now,
        )
        .toArray())
        this.queue(row.id, row.available);
    });
  }
  claim(owner: string, runID: string, now = Date.now()): Claim | null {
    return this.db.transaction(() => {
      const run = this.run(runID),
        source = this.source(run.source_id, true);
      if (!canClaim(source, run, now)) return null;
      const count = this.db.first<{ count: number }>(
        "SELECT count(*) AS count FROM source_runs WHERE state='running' AND lease_until>?",
        now,
      )!.count;
      if (count >= 2) return null;
      const next = claimed(run, now);
      this.saveRun(next);
      return { owner, source, run: next };
    });
  }
  complete(claim: Claim, result: PollResult, now = Date.now()): boolean {
    return this.db.transaction(() => {
      const source = this.source(claim.source.id, true),
        run = this.run(claim.run.id);
      if (!canCommit(source, run, claim.run, now)) return false;
      const counts = ingest(this.db, source.id, result, now),
        partial = result.warnings.length > 0;
      this.saveRun({
        ...run,
        state: partial ? "partial" : "complete",
        counts,
        warnings: result.warnings,
        finished_at: iso(now),
        lease_until: 0,
        error: null,
      });
      this.saveSource({
        ...source,
        checkpoint: partial ? source.checkpoint : result.checkpoint,
        last_success_at: partial ? source.last_success_at : iso(now),
        last_error: partial ? "partial_feed" : null,
        blocked: false,
      });
      return true;
    });
  }
  fail(claim: Claim, failure: PollFailure, now = Date.now()): boolean {
    return this.db.transaction(() => {
      const source = this.source(claim.source.id, true),
        run = this.run(claim.run.id);
      if (!canCommit(source, run, claim.run, now)) return false;
      const next = failed(run, failure, now);
      this.saveRun(next);
      this.saveSource({
        ...source,
        last_error: failure.code,
        blocked: Boolean(failure.blocked),
        next_poll_at: Math.max(source.next_poll_at, next.available_at),
      });
      return true;
    });
  }
  outbox(now = Date.now()) {
    return this.db.sql
      .exec<{ run_id: string; token: string; due: number }>(
        "SELECT run_id,token,due FROM source_outbox WHERE due<=? ORDER BY due LIMIT 50",
        now,
      )
      .toArray();
  }
  dispatched(run: string, token: string) {
    this.db.sql.exec(
      "DELETE FROM source_outbox WHERE run_id=? AND token=?",
      run,
      token,
    );
  }
  nextWake(now = Date.now()): number | null {
    const source = this.db.first<{ due: number | null }>(
      "SELECT min(next_poll) AS due FROM sources WHERE enabled=1 AND blocked=0 AND deleted=0",
    )?.due;
    const job = this.db.first<{ due: number | null }>(
      "SELECT min(CASE WHEN state='running' THEN lease_until ELSE available END) AS due FROM source_runs WHERE state IN ('queued','running')",
    )?.due;
    const outbox = this.db.first<{ due: number | null }>(
      "SELECT min(due) AS due FROM source_outbox",
    )?.due;
    const values = [
      source,
      job == null ? job : Math.max(now + 30_000, job),
      outbox,
    ].filter((v): v is number => v !== null && v !== undefined);
    return values.length ? Math.max(now + 1000, Math.min(...values)) : null;
  }
}
