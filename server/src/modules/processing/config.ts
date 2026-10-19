// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { z } from "zod";
import { hash } from "../../shared/crypto.js";

const endpoint = z.url().refine((v) => {
  const u = new URL(v);
  return (
    u.protocol === "https:" &&
    !u.username &&
    !u.password &&
    !u.search &&
    !u.hash
  );
});
export const processingConfigSchema = z
  .object({
    generator: z
      .object({
        endpoint,
        model: z.string().min(1).max(100),
        api_key: z.string().min(1),
        max_tokens: z.number().int().min(512).max(8192).default(4096),
      })
      .strict(),
    decision: z
      .object({
        endpoint: endpoint.default("https://api.typesafe.ai/v1/systemone"),
        model: z.string().min(1).max(100).default("jev-latest"),
        api_key: z.string().min(1),
      })
      .strict(),
    daily_call_limit: z.number().int().min(6).max(10000).default(60),
    timeout_ms: z.number().int().min(1000).max(60000).default(30000),
    exclusion_threshold: z.number().min(0.7).max(1).default(0.9),
    inclusion_threshold: z.number().min(0.5).max(1).default(0.8),
    verification_threshold: z.number().min(0.7).max(1).default(0.9),
  })
  .strict();
export type ProcessingConfig = z.infer<typeof processingConfigSchema> & {
  credential_binding?: { scope: string; version: number };
};
export const processingSettingsSchema = processingConfigSchema
  .extend({
    generator: processingConfigSchema.shape.generator.extend({
      api_key: z.string().min(1).max(4096).optional(),
    }),
    decision: processingConfigSchema.shape.decision.extend({
      api_key: z.string().min(1).max(4096).optional(),
    }),
    credentials: z
      .object({
        mode: z.enum(["operator", "byok", "shared"]).default("operator"),
        administrators: z
          .array(z.string().regex(/^acc_[a-f0-9]{64}$/))
          .max(100)
          .default([]),
      })
      .strict()
      .default({ mode: "operator", administrators: [] }),
  })
  .refine(
    (c) =>
      c.credentials.mode !== "operator" ||
      Boolean(c.generator.api_key && c.decision.api_key),
    "Operator mode requires both server credentials",
  )
  .refine(
    (c) =>
      c.credentials.mode !== "shared" ||
      c.credentials.administrators.length > 0,
    "Shared client management requires explicit administrators",
  )
  .refine(
    (c) =>
      c.credentials.mode === "operator" ||
      (!c.generator.api_key && !c.decision.api_key),
    "Client-managed mode cannot silently fall back to operator keys",
  );
export type ProcessingSettings = z.infer<typeof processingSettingsSchema>;

export async function processingDisclosure(
  config?: ProcessingConfig | ProcessingSettings,
) {
  if (!config) return undefined;
  const publicConfig = {
    generator: {
      endpoint: config.generator.endpoint,
      model: config.generator.model,
      max_tokens: config.generator.max_tokens,
    },
    decision: {
      endpoint: config.decision.endpoint,
      model: config.decision.model,
    },
    daily_call_limit: config.daily_call_limit,
    timeout_ms: config.timeout_ms,
    exclusion_threshold: config.exclusion_threshold,
    inclusion_threshold: config.inclusion_threshold,
    verification_threshold: config.verification_threshold,
    pipeline_version: "organize-v1",
    ...("credential_binding" in config && config.credential_binding
      ? { credential_binding: config.credential_binding }
      : {}),
    ...("credentials" in config
      ? { credential_mode: config.credentials.mode }
      : {}),
  };
  return {
    fingerprint: await hash(JSON.stringify(publicConfig)),
    destinations: [
      new URL(config.generator.endpoint).origin,
      new URL(config.decision.endpoint).origin,
    ],
    configuration: publicConfig,
  };
}
