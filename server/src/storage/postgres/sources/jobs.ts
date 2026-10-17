// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import type { Database, Connection } from "../database.js";
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
import {
  getSource,
  getRun,
  lockOwner,
  saveSource,
  saveRun,
} from "./records.js";
import { ingest } from "./ingest.js";

export async function enqueue(
  c: Connection,
  owner: string,
  source: Source,
  trigger: Run["trigger"],
  slot: string,
  now: number,
): Promise<Run> {
  const pending = (
    await c.query<{ document: Run }>(
      "SELECT document FROM source_runs WHERE owner=$1 AND source_id=$2 AND state IN ('queued','running') ORDER BY available LIMIT 1",
      [owner, source.id],
    )
  ).rows[0]?.document;
  const run = pending ?? newRun(source, trigger, slot, now);
  if (!pending) await saveRun(c, owner, run);
  await saveSource(c, owner, {
    ...source,
    last_run_id: run.id,
    blocked: false,
    next_poll_at: now + source.interval_seconds * 1000,
  });
  return run;
}
export class PostgresSourceJobs {
  constructor(readonly db: Database) {}
  async scheduleDue(now = Date.now()) {
    const rows = await this.db.query<{ owner: string; id: string }>(
      "SELECT owner,id FROM sources WHERE enabled AND NOT deleted AND NOT blocked AND next_poll<=$1 ORDER BY next_poll LIMIT 100",
      [now],
    );
    for (const row of rows.rows)
      await this.db.transaction(async (c) => {
        await lockOwner(c, row.owner);
        const s = await getSource(c, row.owner, row.id, true);
        if (s.deleted || !s.enabled || s.blocked || s.next_poll_at > now)
          return;
        await enqueue(
          c,
          row.owner,
          s,
          "scheduled",
          `scheduled:${s.generation}:${s.next_poll_at}`,
          now,
        );
      });
  }
  claim(owner: string, runID: string, at?: number): Promise<Claim | null> {
    return this.db.transaction(async (c) => {
      await lockOwner(c, owner);
      const now = at ?? Date.now();
      const run = await getRun(c, owner, runID),
        source = await getSource(c, owner, run.source_id, true);
      if (!canClaim(source, run, now)) return null;
      const count = (
        await c.query<{ count: string }>(
          "SELECT count(*) FROM source_runs WHERE owner=$1 AND state='running' AND lease_until>$2",
          [owner, now],
        )
      ).rows[0]!;
      if (Number(count.count) >= 2) return null;
      const next = claimed(run, now);
      await saveRun(c, owner, next);
      return { owner, source, run: next };
    });
  }
  async claimNext(): Promise<Claim | null> {
    const now = Date.now();
    const candidates = await this.db.query<{ owner: string; id: string }>(
      "SELECT r.owner,r.id FROM source_runs r WHERE (r.state='queued' OR (r.state='running' AND r.lease_until<=$1)) AND r.available<=$1 AND (SELECT count(*) FROM source_runs a WHERE a.owner=r.owner AND a.state='running' AND a.lease_until>$1)<2 ORDER BY r.available,r.id LIMIT 20",
      [now],
    );
    for (const row of candidates.rows) {
      const claim = await this.claim(row.owner, row.id);
      if (claim) return claim;
    }
    return null;
  }
  complete(claim: Claim, result: PollResult, at?: number): Promise<boolean> {
    return this.db.transaction(async (c) => {
      await lockOwner(c, claim.owner);
      const now = at ?? Date.now();
      const source = await getSource(c, claim.owner, claim.source.id, true),
        run = await getRun(c, claim.owner, claim.run.id);
      if (!canCommit(source, run, claim.run, now)) return false;
      const counts = await ingest(c, claim.owner, source.id, result, now);
      const partial = result.warnings.length > 0;
      await saveRun(c, claim.owner, {
        ...run,
        state: partial ? "partial" : "complete",
        counts,
        warnings: result.warnings,
        finished_at: iso(now),
        lease_until: 0,
        error: null,
      });
      await saveSource(c, claim.owner, {
        ...source,
        checkpoint: partial ? source.checkpoint : result.checkpoint,
        last_success_at: partial ? source.last_success_at : iso(now),
        last_error: partial ? "partial_feed" : null,
        blocked: false,
      });
      return true;
    });
  }
  fail(claim: Claim, failure: PollFailure, at?: number): Promise<boolean> {
    return this.db.transaction(async (c) => {
      await lockOwner(c, claim.owner);
      const now = at ?? Date.now();
      const source = await getSource(c, claim.owner, claim.source.id, true),
        run = await getRun(c, claim.owner, claim.run.id);
      if (!canCommit(source, run, claim.run, now)) return false;
      const next = failed(run, failure, now);
      await saveRun(c, claim.owner, next);
      await saveSource(c, claim.owner, {
        ...source,
        last_error: failure.code,
        blocked: Boolean(failure.blocked),
        next_poll_at: Math.max(source.next_poll_at, next.available_at),
      });
      return true;
    });
  }
}
