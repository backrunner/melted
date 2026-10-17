// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { id } from "../../shared/crypto.js";
import { Problem } from "../../shared/problem.js";
import type {
  Source,
  SourceInput,
  SourcePatch,
  Run,
  PollFailure,
} from "./types.js";

export const iso = (now: number) => new Date(now).toISOString();
export const active = (run: Run) =>
  run.state === "queued" || run.state === "running";
export const emptyCounts = () => ({
  received: 0,
  inserted: 0,
  updated: 0,
  duplicates: 0,
  invalid: 0,
});
export function newSource(input: SourceInput, now: number): Source {
  return {
    ...input,
    id: id("src"),
    plugin: "rsshub",
    version: 1,
    generation: 1,
    checkpoint: {},
    created_at: iso(now),
    updated_at: iso(now),
    next_poll_at: now,
    last_success_at: null,
    last_run_id: null,
    last_error: null,
    blocked: false,
    deleted: false,
  };
}
export function patchSource(
  source: Source,
  patch: SourcePatch,
  now: number,
): Source {
  if (source.version !== patch.expected_version)
    throw new Problem(409, "version_conflict");
  const { expected_version: _, ...changes } = patch;
  const targetChanged =
    changes.route !== undefined && changes.route !== source.route;
  return {
    ...source,
    ...changes,
    version: source.version + 1,
    generation: source.generation + 1,
    checkpoint: targetChanged ? {} : source.checkpoint,
    updated_at: iso(now),
    next_poll_at: now,
    blocked: false,
    last_error: null,
  };
}
export function newRun(
  source: Source,
  trigger: Run["trigger"],
  slot: string,
  now: number,
): Run {
  return {
    id: id("run"),
    source_id: source.id,
    generation: source.generation,
    trigger,
    slot,
    state: "queued",
    created_at: iso(now),
    started_at: null,
    finished_at: null,
    available_at: now,
    lease_until: 0,
    fence: 0,
    attempts: 0,
    counts: emptyCounts(),
    warnings: [],
    error: null,
  };
}
export function cancelled(run: Run, now: number): Run {
  return {
    ...run,
    state: "cancelled",
    fence: run.fence + 1,
    lease_until: 0,
    finished_at: iso(now),
    error: { code: "source_changed", retryable: false },
  };
}
export function canClaim(source: Source, run: Run, now: number) {
  return (
    source.enabled &&
    !source.deleted &&
    source.generation === run.generation &&
    active(run) &&
    run.available_at <= now &&
    (run.state !== "running" || run.lease_until <= now)
  );
}
export function claimed(run: Run, now: number): Run {
  return {
    ...run,
    state: "running",
    fence: run.fence + 1,
    attempts: run.attempts + 1,
    lease_until: now + 90_000,
    started_at: run.started_at ?? iso(now),
    error: null,
  };
}
export function canCommit(
  source: Source,
  run: Run,
  expected: Run,
  now: number,
) {
  return (
    source.enabled &&
    !source.deleted &&
    source.generation === expected.generation &&
    run.state === "running" &&
    run.fence === expected.fence &&
    run.lease_until > now
  );
}
export function failed(run: Run, failure: PollFailure, now: number): Run {
  const retry = failure.retryable && run.attempts < 4;
  const delay = Math.max(
    Math.min(3600_000, 30_000 * 2 ** Math.max(0, run.attempts - 1)),
    failure.retry_after_ms ?? 0,
  );
  return {
    ...run,
    state: retry ? "queued" : "failed",
    // Retry-After is parsed before the transaction. Clamp again at commit time
    // so elapsed IO cannot push an already capped delay past Date's range.
    available_at: Math.min(8.64e15, now + delay),
    lease_until: 0,
    finished_at: retry ? null : iso(now),
    error: { code: failure.code, retryable: failure.retryable },
  };
}
export function publicSource(source: Source) {
  const { checkpoint: _, deleted: __, generation: ___, ...visible } = source;
  return { ...visible, next_poll_at: iso(source.next_poll_at) };
}
export function publicRun(run: Run) {
  const {
    fence: _,
    lease_until: __,
    generation: ___,
    slot: ____,
    available_at,
    ...visible
  } = run;
  return {
    ...visible,
    next_retry_at:
      run.state === "queued" && run.attempts > 0 ? iso(available_at) : null,
  };
}
