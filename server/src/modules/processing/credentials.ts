// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { z } from "zod";
import type { Config } from "../../config/schema.js";
import type { Repository } from "../../storage/repository.js";
import { Problem } from "../../shared/problem.js";
import {
  processingConfigSchema,
  processingDisclosure,
  type ProcessingConfig,
} from "./config.js";
import type { ProcessingRepository } from "./types.js";

const secret = z
  .string()
  .min(1)
  .max(4096)
  .regex(/^[\x21-\x7e]+$/);
export const credentialMutationSchema = z
  .object({
    expected_version: z
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER - 1),
    changes: z
      .object({
        generator_key: secret.nullable().optional(),
        decision_key: secret.nullable().optional(),
      })
      .strict()
      .refine((c) => Object.keys(c).length > 0),
  })
  .strict();
export const credentialStatusSchema = z
  .object({
    version: z.number().int().nonnegative(),
    configured: z
      .object({ generator_key: z.boolean(), decision_key: z.boolean() })
      .strict(),
    updated_at: z.string().nullable(),
    updated_by: z.string().nullable(),
  })
  .strict();
export type CredentialKeys = { generator_key?: string; decision_key?: string };
export type CredentialRecord = {
  version: number;
  iv: string;
  ciphertext: string;
  updated_at: string;
  updated_by: string;
};
export interface CredentialRepository {
  read(scope: string): Promise<CredentialRecord | null>;
  save(
    scope: string,
    owner: string | null,
    expected: number,
    key: string,
    digest: string,
    record: CredentialRecord,
  ): Promise<CredentialRecord>;
}
const bytes = (hex: string) =>
  Uint8Array.from(hex.match(/../g)!, (v) => parseInt(v, 16));
const context = (config: Config, scope: string, version: number) =>
  new TextEncoder().encode(
    JSON.stringify(["melted-credentials-v1", config.serverID, scope, version]),
  );
async function sealKey(config: Config, algorithm: "AES-GCM" | "HMAC") {
  if (!config.processingSealKey)
    throw new Problem(503, "credential_storage_unavailable");
  const master = await crypto.subtle.importKey(
    "raw",
    bytes(config.processingSealKey),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode(config.serverID),
      info: new TextEncoder().encode("melted-credentials-v1/" + algorithm),
    },
    master,
    algorithm === "HMAC"
      ? { name: "HMAC", hash: "SHA-256", length: 256 }
      : { name: "AES-GCM", length: 256 },
    false,
    algorithm === "HMAC" ? ["sign"] : ["encrypt", "decrypt"],
  );
}
export async function openCredentials(
  config: Config,
  scope: string,
  record: CredentialRecord | null,
): Promise<CredentialKeys> {
  if (!record) return {};
  try {
    const value = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: Buffer.from(record.iv, "base64url"),
        additionalData: context(config, scope, record.version),
      },
      await sealKey(config, "AES-GCM"),
      Buffer.from(record.ciphertext, "base64url"),
    );
    return z
      .object({
        generator_key: secret.optional(),
        decision_key: secret.optional(),
      })
      .strict()
      .parse(JSON.parse(new TextDecoder().decode(value)));
  } catch {
    throw new Problem(503, "credential_storage_unavailable");
  }
}
export function credentialScope(config: Config, owner: string) {
  const mode = config.processing?.credentials.mode;
  return mode === "byok"
    ? "account:" + owner
    : mode === "shared"
      ? "server"
      : null;
}
export function authorizeCredentials(
  config: Config,
  owner: string,
  scope: string,
) {
  const mode = config.processing?.credentials.mode;
  if (mode === "byok" && scope === "account") return "account:" + owner;
  if (
    mode === "shared" &&
    scope === "server" &&
    config.processing!.credentials.administrators.includes(owner)
  )
    return "server";
  // An absent descriptor is backed by enforcement on every read/write, including stale clients.
  throw new Problem(403, "credential_configuration_forbidden");
}
export async function credentialStatus(
  config: Config,
  scope: string,
  record: CredentialRecord | null,
) {
  const keys = await openCredentials(config, scope, record);
  return credentialStatusSchema.parse({
    version: record?.version ?? 0,
    configured: {
      generator_key: Boolean(keys.generator_key),
      decision_key: Boolean(keys.decision_key),
    },
    updated_at: record?.updated_at ?? null,
    updated_by: record?.updated_by ?? null,
  });
}
export async function saveCredentials(
  repo: Repository,
  config: Config,
  owner: string,
  scope: string,
  body: unknown,
  key: string,
) {
  const parsed = credentialMutationSchema.safeParse(body);
  if (!parsed.success) throw new Problem(400, "invalid_credentials_input");
  const input = parsed.data,
    old = await repo.credentials.read(scope),
    keys = await openCredentials(config, scope, old);
  for (const field of ["generator_key", "decision_key"] as const)
    if (Object.hasOwn(input.changes, field)) {
      const value = input.changes[field];
      if (value === null) delete keys[field];
      else if (value) keys[field] = value;
    }
  const version = input.expected_version + 1,
    iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: context(config, scope, version) },
    await sealKey(config, "AES-GCM"),
    new TextEncoder().encode(JSON.stringify(keys)),
  );
  const digest = Buffer.from(
    await crypto.subtle.sign(
      "HMAC",
      await sealKey(config, "HMAC"),
      new TextEncoder().encode(
        JSON.stringify([config.serverID, scope, owner, input]),
      ),
    ),
  ).toString("hex");
  const stored = await repo.credentials.save(
    scope,
    scope.startsWith("account:") ? owner : null,
    input.expected_version,
    key,
    digest,
    {
      version,
      iv: Buffer.from(iv).toString("base64url"),
      ciphertext: Buffer.from(ciphertext).toString("base64url"),
      updated_at: new Date().toISOString(),
      updated_by: owner,
    },
  );
  return credentialStatus(config, scope, stored);
}
export async function effectiveProcessing(
  repo: Pick<Repository, "credentials">,
  config: Config,
  owner: string,
): Promise<ProcessingConfig | undefined> {
  const configured = config.processing;
  if (!configured) return undefined;
  const { credentials: _, ...base } = configured;
  if (configured.credentials.mode === "operator")
    return processingConfigSchema.parse(base);
  const scope = credentialScope(config, owner)!,
    stored = await repo.credentials.read(scope),
    keys = await openCredentials(config, scope, stored);
  if (!keys.generator_key || !keys.decision_key) return undefined;
  return {
    ...processingConfigSchema.parse({
      ...base,
      generator: { ...base.generator, api_key: keys.generator_key },
      decision: { ...base.decision, api_key: keys.decision_key },
    }),
    credential_binding: { scope, version: stored!.version },
  };
}
/** Per-stage re-resolution prevents old credentials or another account's keys from being reused. */
export function guardedProcessing(
  repo: Repository,
  config: Config,
): ProcessingRepository {
  const base = repo.processing;
  const valid = async (owner: string, fingerprint: string) => {
    const current = await effectiveProcessing(repo, config, owner),
      ai = await processingDisclosure(current);
    return ai?.fingerprint === fingerprint;
  };
  return {
    status: base.status.bind(base),
    action: base.action.bind(base),
    schedule: base.schedule.bind(base),
    jobs: base.jobs.bind(base),
    fail: base.fail.bind(base),
    claim: base.claim.bind(base),
    invalidate: base.invalidate.bind(base),
    current: async (c) =>
      (await valid(c.owner, c.job.fingerprint)) && (await base.current(c)),
    checkpoint: async (c, s, v) =>
      (await valid(c.owner, c.job.fingerprint)) &&
      (await base.checkpoint(c, s, v)),
    complete: async (c, r) =>
      (await valid(c.owner, c.job.fingerprint)) && (await base.complete(c, r)),
  };
}
/** Read-side gate: shared-key changes cross DOs, so withdraw stale publications before serving them. */
export async function refreshProcessingContext(
  repo: Repository,
  config: Config,
  owner: string,
) {
  const current = await effectiveProcessing(repo, config, owner),
    ai = await processingDisclosure(current);
  await repo.processing.invalidate(owner, ai?.fingerprint ?? "unavailable");
  return current;
}
