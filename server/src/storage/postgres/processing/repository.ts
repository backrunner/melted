// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import type { Connection, Database } from "../database.js";
import { lockAccount, appendChange } from "../account.js";
import {
  emptySettings,
  type SettingsState,
} from "../../../modules/settings/dsl.js";
import {
  newJob,
  canRun,
  policySchema,
  type Job,
  type ProcessingState,
  type ProcessingStatus,
  type ProcessingClaim,
  type ProcessingResult,
  type Stage,
  type ProcessingRepository,
} from "../../../modules/processing/types.js";
import type { RawItem, Source } from "../../../modules/sources/types.js";
import { publicationTerms } from "../../../modules/processing/publication.js";
import { hash } from "../../../shared/crypto.js";
import { Problem } from "../../../shared/problem.js";
import {
  briefingSchema,
  type Briefing,
} from "../../../modules/content/schemas.js";

const day = () => new Date().toISOString().slice(0, 10);
async function context(c: Connection, owner: string) {
  const settings =
    (
      await c.query<{ document: SettingsState }>(
        "SELECT document FROM account_settings WHERE owner=$1 AND section='preferences'",
        [owner],
      )
    ).rows[0]?.document ?? emptySettings("preferences");
  const state = (
    await c.query<{ document: ProcessingState }>(
      "SELECT document FROM processing_state WHERE owner=$1",
      [owner],
    )
  ).rows[0]?.document;
  return { settings, state };
}
async function saveState(c: Connection, owner: string, state: ProcessingState) {
  await c.query(
    "INSERT INTO processing_state(owner,document) VALUES($1,$2) ON CONFLICT(owner) DO UPDATE SET document=excluded.document",
    [owner, state],
  );
}
async function saveJob(c: Connection, owner: string, job: Job) {
  await c.query(
    "INSERT INTO processing_jobs(owner,id,document,state,available,lease_until) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(owner,id) DO UPDATE SET document=excluded.document,state=excluded.state,available=excluded.available,lease_until=excluded.lease_until",
    [owner, job.id, job, job.state, job.available, job.lease_until],
  );
}
export async function hideProcessing(
  c: Connection,
  owner: string,
  source?: string,
) {
  const rows = await c.query<{ id: string }>(
    "UPDATE briefings SET processing_visible=false WHERE owner=$1 AND processing_visible AND id IN (SELECT briefing_id FROM processing_results WHERE owner=$1 AND ($2::text IS NULL OR source_id=$2)) RETURNING id",
    [owner, source ?? null],
  );
  for (const row of rows.rows) await appendChange(c, owner, row.id, "delete");
  await c.query("DELETE FROM query_snapshots WHERE owner=$1", [owner]);
  if (source) {
    await c.query(
      "DELETE FROM briefings WHERE owner=$1 AND id IN (SELECT briefing_id FROM processing_results WHERE owner=$1 AND source_id=$2)",
      [owner, source],
    );
    await c.query(
      "DELETE FROM processing_results WHERE owner=$1 AND source_id=$2",
      [owner, source],
    );
  }
  const jobs = await c.query<{ document: Job }>(
    "SELECT document FROM processing_jobs WHERE owner=$1 AND ($2::text IS NULL OR document->>'source_id'=$2)",
    [owner, source ?? null],
  );
  for (const { document } of jobs.rows)
    await saveJob(c, owner, {
      ...document,
      state: "cancelled",
      lease_until: 0,
      error: source ? "source_deleted" : "processing_superseded",
      ...(source ? { stages: {}, outcome: undefined } : {}),
    });
}
export class PostgresProcessing implements ProcessingRepository {
  constructor(readonly db: Database) {}
  async invalidate(owner: string, fingerprint: string) {
    const initial = await context(this.db, owner);
    if (
      !initial.state ||
      initial.state.fingerprint === fingerprint ||
      initial.state.consent === ""
    )
      return;
    await this.db.transaction(async (c) => {
      await lockAccount(c, owner);
      const { state } = await context(c, owner);
      if (!state || state.fingerprint === fingerprint || state.consent === "")
        return;
      await hideProcessing(c, owner);
      await saveState(c, owner, {
        ...state,
        consent: "",
        phase: "failed",
        error: "processing_configuration_changed",
      });
      await appendChange(c, owner, "preferences", "settings");
    });
  }
  async status(owner: string): Promise<ProcessingStatus> {
    const { settings, state } = await context(this.db, owner);
    const jobs = (
      await this.db.query<{ state: string; outcome: string; count: string }>(
        "SELECT state,document->>'outcome' AS outcome,count(*) AS count FROM processing_jobs WHERE owner=$1 AND (document->>'version')::bigint=$2 GROUP BY state,document->>'outcome'",
        [owner, settings.version],
      )
    ).rows;
    const counts = {
      queued: 0,
      running: 0,
      failed: 0,
      published: 0,
      filtered: 0,
      held: 0,
    };
    for (const job of jobs) {
      if (
        job.state === "queued" ||
        job.state === "running" ||
        job.state === "failed"
      )
        counts[job.state] += Number(job.count);
      if (
        job.state === "complete" &&
        (job.outcome === "published" ||
          job.outcome === "filtered" ||
          job.outcome === "held")
      )
        counts[job.outcome] += Number(job.count);
    }
    const current = state?.version === settings.version ? state : undefined;
    const budget =
      (
        await this.db.query<{ reserved: number }>(
          "SELECT reserved FROM processing_budget WHERE owner=$1 AND day=$2",
          [owner, day()],
        )
      ).rows[0]?.reserved ?? 0;
    return {
      configured: Boolean(state),
      version: settings.version,
      phase: current?.phase ?? "stored",
      ...(current ? { fingerprint: current.fingerprint } : {}),
      ...(current?.policy ? { policy: current.policy } : {}),
      ...(current?.error ? { error: current.error } : {}),
      jobs: counts,
      reserved_calls: budget,
    };
  }
  async jobs(owner: string): Promise<Job[]> {
    return (
      await this.db.query<{ document: Job }>(
        "SELECT document FROM processing_jobs WHERE owner=$1 ORDER BY available DESC,id DESC LIMIT 50",
        [owner],
      )
    ).rows.map((r) => r.document);
  }
  async action(
    owner: string,
    version: number,
    action: "compile" | "activate" | "reprocess",
    fingerprint: string,
    key: string,
  ) {
    const payloadHash = await hash(
      JSON.stringify([version, action, fingerprint]),
    );
    await this.db.transaction(async (c) => {
      await lockAccount(c, owner);
      const old = (
        await c.query<{ payload_hash: string }>(
          "SELECT payload_hash FROM processing_actions WHERE owner=$1 AND id=$2",
          [owner, key],
        )
      ).rows[0];
      if (old) {
        if (old.payload_hash !== payloadHash)
          throw new Problem(409, "idempotency_conflict");
        return;
      }
      const { settings, state } = await context(c, owner);
      if (settings.version !== version || version < 1)
        throw new Problem(409, "settings_conflict");
      if (action === "compile") {
        if (
          state?.version !== version ||
          state.fingerprint !== fingerprint ||
          state.phase === "failed"
        ) {
          await hideProcessing(c, owner);
          await saveState(c, owner, {
            version,
            fingerprint,
            consent: fingerprint,
            phase: "pending",
          });
          const job = newJob(version, fingerprint);
          const previous = (
            await c.query<{ document: Job }>(
              "SELECT document FROM processing_jobs WHERE owner=$1 AND id=$2",
              [owner, job.id],
            )
          ).rows[0]?.document;
          // Reusing a logical job ID must never reuse an old lease's fencing token.
          await saveJob(c, owner, { ...job, fence: previous?.fence ?? 0 });
        }
      } else {
        if (
          state?.version !== version ||
          state.fingerprint !== fingerprint ||
          state.consent !== fingerprint ||
          !state.policy ||
          (action === "activate" &&
            !["ready", "active"].includes(state.phase)) ||
          (action === "reprocess" && state.phase !== "active")
        )
          throw new Problem(409, "compiled_policy_required");
        await saveState(c, owner, { ...state, phase: "active" });
        if (action === "reprocess") {
          for (const { document: job } of (
            await c.query<{ document: Job }>(
              "SELECT document FROM processing_jobs WHERE owner=$1 AND state='failed'",
              [owner],
            )
          ).rows)
            if (
              job.version === version &&
              job.fingerprint === fingerprint &&
              job.kind === "item"
            )
              await saveJob(c, owner, {
                ...job,
                state: "queued",
                attempts: 0,
                error: null,
                stages: {},
                available: Date.now(),
              });
        }
      }
      await appendChange(c, owner, "preferences", "settings");
      await c.query(
        "INSERT INTO processing_actions(owner,id,payload_hash,response) VALUES($1,$2,$3,$4)",
        [owner, key, payloadHash, {}],
      );
    });
    await this.schedule(owner);
    return this.status(owner);
  }
  async schedule(owner: string) {
    await this.db.transaction(async (c) => {
      await lockAccount(c, owner);
      const { settings, state } = await context(c, owner);
      if (
        !state ||
        state.phase !== "active" ||
        state.version !== settings.version ||
        state.consent !== state.fingerprint
      )
        return;
      const rows = await c.query<{ raw: RawItem; source: Source }>(
        "SELECT r.document AS raw,s.document AS source FROM raw_items r JOIN sources s ON s.owner=r.owner AND s.id=r.source_id WHERE r.owner=$1 AND s.enabled AND NOT s.deleted AND NOT EXISTS(SELECT 1 FROM processing_jobs j WHERE j.owner=r.owner AND j.document->>'raw_id'=r.id AND (j.document->>'version')::bigint=$2 AND j.document->>'fingerprint'=$3 AND j.document->>'raw_revision'=r.document->>'revision' AND j.document->>'source_generation'=s.document->>'generation' AND j.state<>'cancelled') ORDER BY r.id LIMIT 20",
        [owner, settings.version, state.fingerprint],
      );
      let added = 0;
      for (const row of rows.rows) {
        const job = newJob(
          settings.version,
          state.fingerprint,
          row.raw,
          row.source,
        );
        const previous = (
          await c.query<{ document: Job }>(
            "SELECT document FROM processing_jobs WHERE owner=$1 AND id=$2",
            [owner, job.id],
          )
        ).rows[0]?.document;
        if (previous && previous.state !== "cancelled") continue;
        await saveJob(c, owner, { ...job, fence: previous?.fence ?? 0 });
        if (++added >= 20) break;
      }
    });
  }
  async scheduleAll() {
    for (const row of (
      await this.db.query<{ owner: string }>(
        "SELECT owner FROM processing_state WHERE document->>'phase'='active' LIMIT 1000",
      )
    ).rows)
      await this.schedule(row.owner);
  }
  private async readClaim(
    c: Connection,
    owner: string,
    job: Job,
  ): Promise<ProcessingClaim> {
    const { settings, state } = await context(c, owner);
    const raw = job.raw_id
      ? (
          await c.query<{ document: RawItem }>(
            "SELECT document FROM raw_items WHERE owner=$1 AND id=$2",
            [owner, job.raw_id],
          )
        ).rows[0]?.document
      : undefined;
    const source = job.source_id
      ? (
          await c.query<{ document: Source }>(
            "SELECT document FROM sources WHERE owner=$1 AND id=$2",
            [owner, job.source_id],
          )
        ).rows[0]?.document
      : undefined;
    return { owner, job, settings, policy: state?.policy, raw, source };
  }
  async claim(
    owner: string,
    id: string,
    fingerprint: string,
    dailyLimit: number,
    at?: number,
  ): Promise<ProcessingClaim | null> {
    return this.db.transaction(async (c) => {
      await lockAccount(c, owner);
      const now = at ?? Date.now();
      const job = (
        await c.query<{ document: Job }>(
          "SELECT document FROM processing_jobs WHERE owner=$1 AND id=$2",
          [owner, id],
        )
      ).rows[0]?.document;
      if (
        !job ||
        job.available > now ||
        (job.state !== "queued" &&
          !(job.state === "running" && job.lease_until <= now))
      )
        return null;
      const claim = await this.readClaim(c, owner, job),
        { state } = await context(c, owner);
      if (
        job.fingerprint !== fingerprint ||
        !canRun(job, state, claim.settings, claim.raw, claim.source)
      ) {
        await saveJob(c, owner, {
          ...job,
          state: "cancelled",
          lease_until: 0,
          error: "processing_superseded",
        });
        return null;
      }
      if (job.attempts >= 3) {
        await saveJob(c, owner, {
          ...job,
          state: "failed",
          error: "processing_attempt_limit",
          lease_until: 0,
        });
        if (job.kind === "compile" && state)
          await saveState(c, owner, {
            ...state,
            phase: "failed",
            error: "processing_attempt_limit",
          });
        return null;
      }
      if (
        Number(
          (
            await c.query<{ count: string }>(
              "SELECT count(*) FROM processing_jobs WHERE owner=$1 AND state='running' AND lease_until>$2",
              [owner, now],
            )
          ).rows[0]!.count,
        ) >= 2
      )
        return null;
      const reserved = job.kind === "compile" ? 1 : 4;
      await c.query(
        "INSERT INTO processing_budget(owner,day,reserved) VALUES($1,$2,0) ON CONFLICT DO NOTHING",
        [owner, day()],
      );
      const budget = (
        await c.query<{ reserved: number }>(
          "SELECT reserved FROM processing_budget WHERE owner=$1 AND day=$2",
          [owner, day()],
        )
      ).rows[0]!.reserved;
      if (budget + reserved > dailyLimit) {
        await saveJob(c, owner, {
          ...job,
          state: "failed",
          error: "processing_daily_budget",
          lease_until: 0,
        });
        if (job.kind === "compile" && state)
          await saveState(c, owner, {
            ...state,
            phase: "failed",
            error: "processing_daily_budget",
          });
        return null;
      }
      await c.query(
        "UPDATE processing_budget SET reserved=reserved+$3 WHERE owner=$1 AND day=$2",
        [owner, day(), reserved],
      );
      const next: Job = {
        ...job,
        state: "running",
        attempts: job.attempts + 1,
        fence: job.fence + 1,
        lease_until: now + 240000,
      };
      await saveJob(c, owner, next);
      return { ...claim, job: next };
    });
  }
  async claimNext(
    resolve: (
      owner: string,
    ) => Promise<{ fingerprint: string; dailyLimit: number }>,
  ) {
    const now = Date.now();
    for (const row of (
      await this.db.query<{ owner: string; id: string }>(
        "SELECT owner,id FROM processing_jobs WHERE available<=$1 AND (state='queued' OR (state='running' AND lease_until<=$1)) ORDER BY available,id LIMIT 20",
        [now],
      )
    ).rows) {
      let resolved: { fingerprint: string; dailyLimit: number };
      try {
        resolved = await resolve(row.owner);
      } catch (error) {
        if (
          error instanceof Problem &&
          error.code === "credential_storage_unavailable"
        ) {
          // A broken/revoked account secret must not starve other owners in the worker pool.
          await this.invalidate(row.owner, "unavailable");
          continue;
        }
        throw error;
      }
      const { fingerprint, dailyLimit } = resolved;
      const claim = await this.claim(
        row.owner,
        row.id,
        fingerprint,
        dailyLimit,
      );
      if (claim) return claim;
    }
    return null;
  }
  private async valid(c: Connection, claim: ProcessingClaim) {
    const job = (
      await c.query<{ document: Job }>(
        "SELECT document FROM processing_jobs WHERE owner=$1 AND id=$2",
        [claim.owner, claim.job.id],
      )
    ).rows[0]?.document;
    if (
      !job ||
      job.state !== "running" ||
      job.fence !== claim.job.fence ||
      job.lease_until <= Date.now()
    )
      return undefined;
    const latest = await this.readClaim(c, claim.owner, job),
      { state } = await context(c, claim.owner);
    return canRun(job, state, latest.settings, latest.raw, latest.source)
      ? job
      : undefined;
  }
  async current(claim: ProcessingClaim) {
    return Boolean(await this.valid(this.db, claim));
  }
  async checkpoint(claim: ProcessingClaim, stage: string, value: Stage) {
    return this.db.transaction(async (c) => {
      await lockAccount(c, claim.owner);
      const job = await this.valid(c, claim);
      if (!job) return false;
      await saveJob(c, claim.owner, {
        ...job,
        stages: { ...job.stages, [stage]: value },
      });
      return true;
    });
  }
  async complete(claim: ProcessingClaim, result: ProcessingResult) {
    const terms = await publicationTerms(result);
    return this.db.transaction(async (c) => {
      await lockAccount(c, claim.owner);
      const job = await this.valid(c, claim);
      if (!job) return false;
      if (job.kind === "compile") {
        const { state } = await context(c, claim.owner);
        await saveState(c, claim.owner, {
          ...state!,
          phase: "ready",
          policy: policySchema.parse(result.policy),
          policy_hash: result.policy_hash,
        });
      } else {
        const briefingID = "organized_" + job.raw_id;
        if (result.decision?.disposition === "published" && result.briefing) {
          const old = (
            await c.query<{ document: Briefing }>(
              "SELECT document FROM briefings WHERE owner=$1 AND id=$2",
              [claim.owner, briefingID],
            )
          ).rows[0]?.document;
          const doc = briefingSchema.parse({
            ...result.briefing,
            revision: (old?.revision ?? 0) + 1,
            category_id: terms.find((t) => t.kind === "category")?.id ?? null,
            tag_ids: terms.filter((t) => t.kind === "tag").map((t) => t.id),
          });
          for (const term of terms)
            await c.query(
              "INSERT INTO terms(owner,id,kind,name) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
              [claim.owner, term.id, term.kind, term.name],
            );
          await c.query(
            "INSERT INTO briefings(owner,id,document,category_id,title,search_text,updated_at,read,saved,hidden,state_version,processing_visible) VALUES($1,$2,$3,$4,$5,$6,$7,false,false,false,1,true) ON CONFLICT(owner,id) DO UPDATE SET document=excluded.document,category_id=excluded.category_id,title=excluded.title,search_text=excluded.search_text,updated_at=excluded.updated_at,processing_visible=true",
            [
              claim.owner,
              briefingID,
              doc,
              doc.category_id,
              doc.title,
              doc.title + "\n" + doc.summary + "\n" + doc.markdown,
              doc.updated_at,
            ],
          );
          await c.query(
            "DELETE FROM briefing_terms WHERE owner=$1 AND briefing_id=$2",
            [claim.owner, briefingID],
          );
          for (const term of terms.filter((t) => t.kind === "tag"))
            await c.query(
              "INSERT INTO briefing_terms(owner,briefing_id,term_id) VALUES($1,$2,$3)",
              [claim.owner, briefingID, term.id],
            );
          await appendChange(c, claim.owner, briefingID, "upsert");
        } else {
          const hidden = await c.query(
            "UPDATE briefings SET processing_visible=false WHERE owner=$1 AND id=$2 AND processing_visible RETURNING id",
            [claim.owner, briefingID],
          );
          if (hidden.rowCount)
            await appendChange(c, claim.owner, briefingID, "delete");
        }
        await c.query(
          "INSERT INTO processing_results(owner,raw_id,source_id,briefing_id,document) VALUES($1,$2,$3,$4,$5) ON CONFLICT(owner,raw_id) DO UPDATE SET document=excluded.document,source_id=excluded.source_id",
          [
            claim.owner,
            job.raw_id,
            job.source_id,
            briefingID,
            {
              version: job.version,
              raw_revision: job.raw_revision,
              fingerprint: job.fingerprint,
              pipeline_version: "organize-v1",
              decision: result.decision,
              job_id: job.id,
            },
          ],
        );
      }
      await saveJob(c, claim.owner, {
        ...job,
        state: "complete",
        lease_until: 0,
        error: null,
        outcome: result.decision?.disposition,
      });
      await appendChange(c, claim.owner, "preferences", "settings");
      return true;
    });
  }
  async fail(claim: ProcessingClaim, code: string, retryable: boolean) {
    await this.db.transaction(async (c) => {
      await lockAccount(c, claim.owner);
      const job = await this.valid(c, claim);
      if (!job) return;
      const retry = retryable && job.attempts < 3;
      await saveJob(c, claim.owner, {
        ...job,
        state: retry ? "queued" : "failed",
        available: Date.now() + Math.min(300000, 30000 * 2 ** job.attempts),
        lease_until: 0,
        error: code,
      });
      if (!retry && job.kind === "compile") {
        const { state } = await context(c, claim.owner);
        await saveState(c, claim.owner, {
          ...state!,
          phase: "failed",
          error: code,
        });
      }
    });
  }
}
