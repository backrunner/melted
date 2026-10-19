// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { z } from "zod";
import { isPortableText } from "../../shared/text.js";
import type { RawItem, Source } from "../sources/types.js";
import type { SettingsState } from "../settings/dsl.js";
import type { Briefing } from "../content/schemas.js";

const text = (max: number) => z.string().min(1).max(max).refine(isPortableText);
const terms = z
  .array(z.object({ name: text(100), rule: text(1000) }).strict())
  .max(20);
export const policySchema = z
  .object({
    categories: terms,
    tags: terms,
    tag_rules: z.array(text(1000)).max(20),
    include: z.array(text(1000)).max(20),
    exclude: z.array(text(1000)).max(20),
    preferences: z.array(text(1000)).max(20),
    output: z
      .object({
        language: text(100),
        style: text(1000),
        structure: text(1000),
        length: text(500),
      })
      .strict(),
    warnings: z.array(text(1000)).max(20),
  })
  .strict()
  .refine((p) =>
    [p.categories, p.tags].every(
      (list) => new Set(list.map((t) => t.name)).size === list.length,
    ),
  );
export type Policy = z.infer<typeof policySchema>;
export type Usage = {
  model: string;
  input_tokens: number;
  output_tokens: number;
};
export type Stage = { value: unknown; usage: Usage };
export type Job = {
  id: string;
  kind: "compile" | "item";
  version: number;
  fingerprint: string;
  state: "queued" | "running" | "complete" | "failed" | "cancelled";
  available: number;
  lease_until: number;
  fence: number;
  attempts: number;
  raw_id?: string;
  raw_revision?: number;
  source_id?: string;
  source_generation?: number;
  stages: Record<string, Stage>;
  error: string | null;
  outcome?: string;
};
export type ProcessingState = {
  version: number;
  fingerprint: string;
  consent: string;
  phase: "pending" | "ready" | "active" | "failed";
  policy?: Policy;
  policy_hash?: string;
  error?: string;
};
export const processingActionSchema = z
  .object({
    expected_version: z.number().int().positive(),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    action: z.enum(["compile", "activate", "reprocess"]),
  })
  .strict();
export const processingStatusSchema = z
  .object({
    configured: z.boolean(),
    version: z.number().int().nonnegative(),
    phase: z.enum([
      "stored",
      "pending",
      "ready",
      "active",
      "failed",
      "unavailable",
      "consent_required",
    ]),
    fingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    policy: policySchema.optional(),
    error: z.string().max(200).optional(),
    preview: z
      .array(
        z
          .object({ label: z.string().max(1000), value: z.string().max(30000) })
          .strict(),
      )
      .max(20)
      .optional(),
    jobs: z
      .object({
        queued: z.number().int().nonnegative(),
        running: z.number().int().nonnegative(),
        failed: z.number().int().nonnegative(),
        published: z.number().int().nonnegative(),
        filtered: z.number().int().nonnegative(),
        held: z.number().int().nonnegative(),
      })
      .strict(),
    reserved_calls: z.number().int().nonnegative(),
    daily_call_limit: z.number().int().positive().optional(),
  })
  .strict();
export type ProcessingStatus = z.infer<typeof processingStatusSchema>;
export const processingJobsSchema = z.object({
  jobs: z
    .array(
      z.object({
        id: z.string(),
        kind: z.enum(["compile", "item"]),
        version: z.number().int().positive(),
        raw_id: z.string().optional(),
        raw_revision: z.number().int().positive().optional(),
        state: z.enum(["queued", "running", "complete", "failed", "cancelled"]),
        outcome: z.enum(["published", "filtered", "held"]).optional(),
        error: z.string().nullable(),
        attempts: z.number().int().nonnegative(),
        fingerprint: z.string(),
        pipeline_version: z.literal("organize-v1"),
        usage: z.array(
          z.object({
            stage: z.string(),
            model: z.string(),
            input_tokens: z.number().int().nonnegative(),
            output_tokens: z.number().int().nonnegative(),
          }),
        ),
      }),
    )
    .max(50),
});
export type ProcessingClaim = {
  owner: string;
  job: Job;
  settings: SettingsState;
  policy?: Policy;
  raw?: RawItem;
  source?: Source;
};
export type ProcessingResult = {
  policy?: Policy;
  policy_hash?: string;
  decision?: {
    disposition: "published" | "filtered" | "held";
    category: string | null;
    tags: string[];
    reason: string;
  };
  briefing?: Briefing;
};
export interface ProcessingRepository {
  invalidate(owner: string, fingerprint: string): Promise<void>;
  status(owner: string): Promise<ProcessingStatus>;
  action(
    owner: string,
    version: number,
    action: "compile" | "activate" | "reprocess",
    fingerprint: string,
    key: string,
  ): Promise<ProcessingStatus>;
  schedule(owner: string): Promise<void>;
  claim(
    owner: string,
    id: string,
    fingerprint: string,
    dailyLimit: number,
    now?: number,
  ): Promise<ProcessingClaim | null>;
  current(claim: ProcessingClaim): Promise<boolean>;
  checkpoint(
    claim: ProcessingClaim,
    stage: string,
    value: Stage,
  ): Promise<boolean>;
  complete(claim: ProcessingClaim, result: ProcessingResult): Promise<boolean>;
  fail(claim: ProcessingClaim, code: string, retryable: boolean): Promise<void>;
  jobs(owner: string): Promise<Job[]>;
}
export const jobID = (
  version: number,
  fingerprint: string,
  raw?: RawItem,
  source?: Source,
) =>
  raw && source
    ? `process_${version}_${raw.id}_${raw.revision}_${source.generation}_${fingerprint}`
    : `compile_${version}_${fingerprint}`;
export function newJob(
  version: number,
  fingerprint: string,
  raw?: RawItem,
  source?: Source,
): Job {
  return {
    id: jobID(version, fingerprint, raw, source),
    kind: raw ? "item" : "compile",
    version,
    fingerprint,
    state: "queued",
    available: Date.now(),
    lease_until: 0,
    fence: 0,
    attempts: 0,
    stages: {},
    error: null,
    ...(raw && source
      ? {
          raw_id: raw.id,
          raw_revision: raw.revision,
          source_id: source.id,
          source_generation: source.generation,
        }
      : {}),
  };
}
export function canRun(
  job: Job,
  state: ProcessingState | undefined,
  settings: SettingsState,
  raw?: RawItem,
  source?: Source,
) {
  return (
    settings.version === job.version &&
    state?.version === job.version &&
    state.fingerprint === job.fingerprint &&
    state.consent === job.fingerprint &&
    (job.kind === "compile"
      ? state.phase === "pending"
      : state.phase === "active" &&
        raw?.revision === job.raw_revision &&
        source?.enabled === true &&
        !source.deleted &&
        source.generation === job.source_generation)
  );
}
