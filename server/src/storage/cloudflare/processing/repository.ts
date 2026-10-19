// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import type { AccountDatabase } from "../sqlite.js";
import { appendChange } from "../changes.js";
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
} from "../../../modules/processing/types.js";
import type { RawItem, Source } from "../../../modules/sources/types.js";
import { publicationTerms } from "../../../modules/processing/publication.js";
import { hash, id } from "../../../shared/crypto.js";
import { Problem } from "../../../shared/problem.js";
import {
  briefingSchema,
  type Briefing,
} from "../../../modules/content/schemas.js";

const day = () => new Date().toISOString().slice(0, 10);
export function initializeProcessing(db: AccountDatabase) {
  if (db.meta("processing_schema") === "1") return;
  db.transaction(() => {
    if (
      !db.sql
        .exec<{ name: string }>("PRAGMA table_info(briefings)")
        .toArray()
        .some((c) => c.name === "processing_visible")
    )
      db.sql.exec(
        "ALTER TABLE briefings ADD COLUMN processing_visible INTEGER NOT NULL DEFAULT 1",
      );
    db.sql
      .exec(`CREATE TABLE IF NOT EXISTS processing_state(id INTEGER PRIMARY KEY,document TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS processing_jobs(id TEXT PRIMARY KEY,document TEXT NOT NULL,state TEXT NOT NULL,available INTEGER NOT NULL,lease_until INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS processing_due ON processing_jobs(state,available);
      CREATE TABLE IF NOT EXISTS processing_budget(day TEXT PRIMARY KEY,reserved INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS processing_actions(id TEXT PRIMARY KEY,payload_hash TEXT NOT NULL,created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS processing_results(raw_id TEXT PRIMARY KEY,source_id TEXT NOT NULL,briefing_id TEXT NOT NULL,document TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS processing_item_identity ON processing_jobs(json_extract(document,'$.raw_id'),json_extract(document,'$.version'),json_extract(document,'$.fingerprint'),json_extract(document,'$.raw_revision'),json_extract(document,'$.source_generation'));
      CREATE TABLE IF NOT EXISTS processing_outbox(id TEXT PRIMARY KEY,token TEXT NOT NULL,due INTEGER NOT NULL);`);
    db.setMeta("processing_schema", "1");
  });
}
function read<T>(
  db: AccountDatabase,
  query: string,
  ...args: SqlStorageValue[]
): T | undefined {
  const row = db.first<{ document: string }>(query, ...args);
  return row ? (JSON.parse(row.document) as T) : undefined;
}
function context(db: AccountDatabase) {
  return {
    settings:
      read<SettingsState>(
        db,
        "SELECT document FROM account_settings WHERE section='preferences'",
      ) ?? emptySettings("preferences"),
    state: read<ProcessingState>(
      db,
      "SELECT document FROM processing_state WHERE id=1",
    ),
  };
}
function saveState(db: AccountDatabase, state: ProcessingState) {
  db.sql.exec(
    "INSERT INTO processing_state(id,document) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document",
    JSON.stringify(state),
  );
}
function queue(db: AccountDatabase, job: Job) {
  if (job.state === "queued" || job.state === "running")
    db.sql.exec(
      "INSERT INTO processing_outbox(id,token,due) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET token=excluded.token,due=excluded.due",
      job.id,
      id("dispatch"),
      job.state === "running" ? job.lease_until : job.available,
    );
  else db.sql.exec("DELETE FROM processing_outbox WHERE id=?", job.id);
}
function saveJob(db: AccountDatabase, job: Job) {
  db.sql.exec(
    "INSERT INTO processing_jobs(id,document,state,available,lease_until) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document,state=excluded.state,available=excluded.available,lease_until=excluded.lease_until",
    job.id,
    JSON.stringify(job),
    job.state,
    job.available,
    job.lease_until,
  );
  queue(db, job);
}
export function hideProcessing(db: AccountDatabase, source?: string) {
  const rows = db.sql
    .exec<{ id: string }>(
      "UPDATE briefings SET processing_visible=0 WHERE processing_visible=1 AND id IN (SELECT briefing_id FROM processing_results WHERE (? IS NULL OR source_id=?)) RETURNING id",
      source ?? null,
      source ?? null,
    )
    .toArray();
  for (const row of rows) appendChange(db, row.id, "delete");
  db.sql.exec("DELETE FROM snapshot_items");
  db.sql.exec("DELETE FROM snapshots");
  if (source) {
    db.sql.exec(
      "DELETE FROM briefings WHERE id IN (SELECT briefing_id FROM processing_results WHERE source_id=?)",
      source,
    );
    db.sql.exec("DELETE FROM processing_results WHERE source_id=?", source);
  }
  for (const row of db.sql
    .exec<{ document: string }>(
      "SELECT document FROM processing_jobs WHERE (? IS NULL OR json_extract(document,'$.source_id')=?)",
      source ?? null,
      source ?? null,
    )
    .toArray())
    saveJob(db, {
      ...(JSON.parse(row.document) as Job),
      state: "cancelled",
      lease_until: 0,
      error: source ? "source_deleted" : "processing_superseded",
      ...(source ? { stages: {}, outcome: undefined } : {}),
    });
}
export class AccountProcessing {
  constructor(private db: AccountDatabase) {}
  invalidate(fingerprint: string) {
    this.db.transaction(() => {
      const { state } = context(this.db);
      if (!state || state.fingerprint === fingerprint || state.consent === "")
        return;
      hideProcessing(this.db);
      saveState(this.db, {
        ...state,
        consent: "",
        phase: "failed",
        error: "processing_configuration_changed",
      });
      appendChange(this.db, "preferences", "settings");
    });
  }
  status(): ProcessingStatus {
    const { settings, state } = context(this.db),
      counts = {
        queued: 0,
        running: 0,
        failed: 0,
        published: 0,
        filtered: 0,
        held: 0,
      };
    for (const job of this.db.sql
      .exec<{ state: string; outcome: string; count: number }>(
        "SELECT state,json_extract(document,'$.outcome') AS outcome,count(*) AS count FROM processing_jobs WHERE json_extract(document,'$.version')=? GROUP BY state,outcome",
        settings.version,
      )
      .toArray()) {
      if (
        job.state === "queued" ||
        job.state === "running" ||
        job.state === "failed"
      )
        counts[job.state] += job.count;
      if (
        job.state === "complete" &&
        (job.outcome === "published" ||
          job.outcome === "filtered" ||
          job.outcome === "held")
      )
        counts[job.outcome] += job.count;
    }
    const current = state?.version === settings.version ? state : undefined;
    return {
      configured: Boolean(state),
      version: settings.version,
      phase: current?.phase ?? "stored",
      ...(current ? { fingerprint: current.fingerprint } : {}),
      ...(current?.policy ? { policy: current.policy } : {}),
      ...(current?.error ? { error: current.error } : {}),
      jobs: counts,
      reserved_calls:
        this.db.first<{ reserved: number }>(
          "SELECT reserved FROM processing_budget WHERE day=?",
          day(),
        )?.reserved ?? 0,
    };
  }
  jobs(): Job[] {
    return this.db.sql
      .exec<{ document: string }>(
        "SELECT document FROM processing_jobs ORDER BY available DESC,id DESC LIMIT 50",
      )
      .toArray()
      .map((r) => JSON.parse(r.document) as Job);
  }
  async action(
    version: number,
    action: "compile" | "activate" | "reprocess",
    fingerprint: string,
    key: string,
  ) {
    const payloadHash = await hash(
      JSON.stringify([version, action, fingerprint]),
    );
    this.db.transaction(() => {
      const old = this.db.first<{ payload_hash: string }>(
        "SELECT payload_hash FROM processing_actions WHERE id=?",
        key,
      );
      if (old) {
        if (old.payload_hash !== payloadHash)
          throw new Problem(409, "idempotency_conflict");
        return;
      }
      const { settings, state } = context(this.db);
      if (settings.version !== version || version < 1)
        throw new Problem(409, "settings_conflict");
      if (action === "compile") {
        if (
          state?.version !== version ||
          state.fingerprint !== fingerprint ||
          state.phase === "failed"
        ) {
          hideProcessing(this.db);
          saveState(this.db, {
            version,
            fingerprint,
            consent: fingerprint,
            phase: "pending",
          });
          const job = newJob(version, fingerprint);
          const previous = read<Job>(
            this.db,
            "SELECT document FROM processing_jobs WHERE id=?",
            job.id,
          );
          // Reusing a logical job ID must never reuse an old lease's fencing token.
          saveJob(this.db, { ...job, fence: previous?.fence ?? 0 });
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
        saveState(this.db, { ...state, phase: "active" });
        if (action === "reprocess")
          for (const { document } of this.db.sql
            .exec<{ document: string }>(
              "SELECT document FROM processing_jobs WHERE state='failed'",
            )
            .toArray()) {
            const job = JSON.parse(document) as Job;
            if (
              job.version === version &&
              job.fingerprint === fingerprint &&
              job.kind === "item" &&
              job.state === "failed"
            )
              saveJob(this.db, {
                ...job,
                state: "queued",
                attempts: 0,
                error: null,
                stages: {},
                available: Date.now(),
              });
          }
      }
      appendChange(this.db, "preferences", "settings");
      this.db.sql.exec(
        "INSERT INTO processing_actions(id,payload_hash,created) VALUES(?,?,?)",
        key,
        payloadHash,
        Date.now(),
      );
    });
    this.schedule();
    return this.status();
  }
  schedule() {
    this.db.transaction(() => {
      const { settings, state } = context(this.db);
      if (
        state?.phase === "active" &&
        state.version === settings.version &&
        state.consent === state.fingerprint
      ) {
        const rows = this.db.sql
          .exec<{ raw: string; source: string }>(
            "SELECT r.document AS raw,s.document AS source FROM raw_items r JOIN sources s ON s.id=r.source_id WHERE s.enabled=1 AND s.deleted=0 AND NOT EXISTS(SELECT 1 FROM processing_jobs j WHERE json_extract(j.document,'$.raw_id')=r.id AND json_extract(j.document,'$.version')=? AND json_extract(j.document,'$.fingerprint')=? AND json_extract(j.document,'$.raw_revision')=json_extract(r.document,'$.revision') AND json_extract(j.document,'$.source_generation')=json_extract(s.document,'$.generation') AND j.state<>'cancelled') ORDER BY r.id LIMIT 20",
            settings.version,
            state.fingerprint,
          )
          .toArray();
        let added = 0;
        for (const row of rows) {
          const job = newJob(
            settings.version,
            state.fingerprint,
            JSON.parse(row.raw) as RawItem,
            JSON.parse(row.source) as Source,
          );
          const previous = read<Job>(
            this.db,
            "SELECT document FROM processing_jobs WHERE id=?",
            job.id,
          );
          if (previous && previous.state !== "cancelled") continue;
          saveJob(this.db, { ...job, fence: previous?.fence ?? 0 });
          if (++added >= 20) break;
        }
      }
      for (const { document } of this.db.sql
        .exec<{ document: string }>(
          "SELECT document FROM processing_jobs j WHERE state IN ('queued','running') AND NOT EXISTS(SELECT 1 FROM processing_outbox o WHERE o.id=j.id) LIMIT 20",
        )
        .toArray()) {
        const job = JSON.parse(document) as Job;
        if (
          (job.state === "queued" || job.state === "running") &&
          !this.db.first("SELECT id FROM processing_outbox WHERE id=?", job.id)
        )
          queue(this.db, job);
      }
    });
  }
  private readClaim(owner: string, job: Job): ProcessingClaim {
    const { settings, state } = context(this.db);
    return {
      owner,
      job,
      settings,
      policy: state?.policy,
      raw: job.raw_id
        ? read<RawItem>(
            this.db,
            "SELECT document FROM raw_items WHERE id=?",
            job.raw_id,
          )
        : undefined,
      source: job.source_id
        ? read<Source>(
            this.db,
            "SELECT document FROM sources WHERE id=?",
            job.source_id,
          )
        : undefined,
    };
  }
  claim(
    owner: string,
    id: string,
    fingerprint: string,
    dailyLimit: number,
    now = Date.now(),
  ): ProcessingClaim | null {
    return this.db.transaction(() => {
      const job = read<Job>(
        this.db,
        "SELECT document FROM processing_jobs WHERE id=?",
        id,
      );
      if (
        !job ||
        job.available > now ||
        (job.state !== "queued" &&
          !(job.state === "running" && job.lease_until <= now))
      )
        return null;
      const claim = this.readClaim(owner, job),
        { state } = context(this.db);
      if (
        job.fingerprint !== fingerprint ||
        !canRun(job, state, claim.settings, claim.raw, claim.source)
      ) {
        saveJob(this.db, {
          ...job,
          state: "cancelled",
          lease_until: 0,
          error: "processing_superseded",
        });
        return null;
      }
      const stop = (code: string) => {
        saveJob(this.db, {
          ...job,
          state: "failed",
          lease_until: 0,
          error: code,
        });
        if (job.kind === "compile" && state)
          saveState(this.db, { ...state, phase: "failed", error: code });
        return null;
      };
      if (job.attempts >= 3) return stop("processing_attempt_limit");
      if (
        this.db.first<{ count: number }>(
          "SELECT count(*) AS count FROM processing_jobs WHERE state='running' AND lease_until>?",
          now,
        )!.count >= 2
      )
        return null;
      const reserved = job.kind === "compile" ? 1 : 4,
        budget =
          this.db.first<{ reserved: number }>(
            "SELECT reserved FROM processing_budget WHERE day=?",
            day(),
          )?.reserved ?? 0;
      if (budget + reserved > dailyLimit)
        return stop("processing_daily_budget");
      this.db.sql.exec(
        "INSERT INTO processing_budget(day,reserved) VALUES(?,?) ON CONFLICT(day) DO UPDATE SET reserved=excluded.reserved",
        day(),
        budget + reserved,
      );
      const next: Job = {
        ...job,
        state: "running",
        attempts: job.attempts + 1,
        fence: job.fence + 1,
        lease_until: now + 240000,
      };
      saveJob(this.db, next);
      return { ...claim, job: next };
    });
  }
  private valid(claim: ProcessingClaim) {
    const job = read<Job>(
      this.db,
      "SELECT document FROM processing_jobs WHERE id=?",
      claim.job.id,
    );
    if (
      !job ||
      job.state !== "running" ||
      job.fence !== claim.job.fence ||
      job.lease_until <= Date.now()
    )
      return undefined;
    const latest = this.readClaim(claim.owner, job),
      { state } = context(this.db);
    return canRun(job, state, latest.settings, latest.raw, latest.source)
      ? job
      : undefined;
  }
  current(claim: ProcessingClaim) {
    return Boolean(this.valid(claim));
  }
  checkpoint(claim: ProcessingClaim, stage: string, value: Stage) {
    return this.db.transaction(() => {
      const job = this.valid(claim);
      if (!job) return false;
      saveJob(this.db, { ...job, stages: { ...job.stages, [stage]: value } });
      return true;
    });
  }
  async complete(claim: ProcessingClaim, result: ProcessingResult) {
    const terms = await publicationTerms(result);
    return this.db.transaction(() => {
      const job = this.valid(claim);
      if (!job) return false;
      if (job.kind === "compile") {
        const { state } = context(this.db);
        saveState(this.db, {
          ...state!,
          phase: "ready",
          policy: policySchema.parse(result.policy),
          policy_hash: result.policy_hash,
        });
      } else {
        const briefingID = "organized_" + job.raw_id;
        if (result.decision?.disposition === "published" && result.briefing) {
          const old = read<Briefing>(
            this.db,
            "SELECT document FROM briefings WHERE id=?",
            briefingID,
          );
          const doc = briefingSchema.parse({
            ...result.briefing,
            revision: (old?.revision ?? 0) + 1,
            state: old?.state ?? result.briefing.state,
            category_id: terms.find((t) => t.kind === "category")?.id ?? null,
            tag_ids: terms.filter((t) => t.kind === "tag").map((t) => t.id),
          });
          for (const term of terms)
            this.db.sql.exec(
              "INSERT INTO terms(id,kind,name) VALUES(?,?,?) ON CONFLICT DO NOTHING",
              term.id,
              term.kind,
              term.name,
            );
          this.db.sql.exec(
            "INSERT INTO briefings(id,document,category_id,search_text,updated_at,read,saved,hidden,version,processing_visible) VALUES(?,?,?,?,?,?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET document=excluded.document,category_id=excluded.category_id,search_text=excluded.search_text,updated_at=excluded.updated_at,processing_visible=1",
            briefingID,
            JSON.stringify(doc),
            doc.category_id,
            doc.title + "\n" + doc.summary + "\n" + doc.markdown,
            Date.parse(doc.updated_at),
            Number(doc.state.read),
            Number(doc.state.saved),
            Number(doc.state.hidden),
            doc.state.version,
          );
          appendChange(this.db, briefingID, "upsert");
        } else {
          if (
            this.db.sql
              .exec(
                "UPDATE briefings SET processing_visible=0 WHERE id=? AND processing_visible=1 RETURNING id",
                briefingID,
              )
              .toArray().length
          )
            appendChange(this.db, briefingID, "delete");
        }
        this.db.sql.exec(
          "INSERT INTO processing_results(raw_id,source_id,briefing_id,document) VALUES(?,?,?,?) ON CONFLICT(raw_id) DO UPDATE SET document=excluded.document,source_id=excluded.source_id",
          job.raw_id!,
          job.source_id!,
          briefingID,
          JSON.stringify({
            version: job.version,
            raw_revision: job.raw_revision,
            fingerprint: job.fingerprint,
            pipeline_version: "organize-v1",
            decision: result.decision,
            job_id: job.id,
          }),
        );
      }
      saveJob(this.db, {
        ...job,
        state: "complete",
        lease_until: 0,
        error: null,
        outcome: result.decision?.disposition,
      });
      appendChange(this.db, "preferences", "settings");
      return true;
    });
  }
  fail(claim: ProcessingClaim, code: string, retryable: boolean) {
    this.db.transaction(() => {
      const job = this.valid(claim);
      if (!job) return;
      const retry = retryable && job.attempts < 3;
      saveJob(this.db, {
        ...job,
        state: retry ? "queued" : "failed",
        available: Date.now() + Math.min(300000, 30000 * 2 ** job.attempts),
        lease_until: 0,
        error: code,
      });
      if (!retry && job.kind === "compile") {
        const { state } = context(this.db);
        saveState(this.db, { ...state!, phase: "failed", error: code });
      }
    });
  }
  outbox(now = Date.now()) {
    return this.db.sql
      .exec<{ id: string; token: string; due: number }>(
        "SELECT id,token,due FROM processing_outbox WHERE due<=? ORDER BY due LIMIT 20",
        now,
      )
      .toArray();
  }
  dispatched(id: string, token: string) {
    this.db.sql.exec(
      "DELETE FROM processing_outbox WHERE id=? AND token=?",
      id,
      token,
    );
  }
  nextWake() {
    return (
      this.db.first<{ due: number | null }>(
        "SELECT min(due) AS due FROM processing_outbox",
      )?.due ?? null
    );
  }
}
