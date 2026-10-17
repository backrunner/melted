// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { z } from "zod";
import { hash } from "../../shared/crypto.js";
import { isHTTPURL } from "../../shared/url.js";
import { isPortableText } from "../../shared/text.js";
import { originSchema, publicOrigin } from "../../shared/network-origin.js";

export const profileSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]{0,49}$/),
    label: z.string().min(1).max(100),
    allowed_origins: z.array(originSchema.refine(publicOrigin)).min(1).max(20),
    model_origin: originSchema.refine(publicOrigin),
  })
  .strict()
  .refine((p) => new Set(p.allowed_origins).size === p.allowed_origins.length);
export type CollectionProfile = z.infer<typeof profileSchema>;
export const settingsSchema = z
  .object({
    profile: z.string().min(1).max(50),
    goal: z.string().trim().min(1).max(2000).refine(isPortableText),
    start_url: z.string().max(2048).refine(isHTTPURL),
    lookback_hours: z.number().int().min(1).max(168).default(24),
    max_items: z.number().int().min(1).max(20).default(10),
    max_requests: z.number().int().min(1).max(10).default(5),
    timeout_seconds: z.number().int().min(15).max(60).default(45),
  })
  .strict();
export type AgentSettings = z.infer<typeof settingsSchema>;
export const invocationSchema = z
  .object({
    version: z.literal(1),
    execution_id: z.string().regex(/^[a-f0-9]{64}$/),
    policy_hash: z.string().regex(/^[a-f0-9]{64}$/),
    configuration: settingsSchema,
  })
  .strict();
export type AgentInvocation = z.infer<typeof invocationSchema>;
export const policyHash = (profile: CollectionProfile) =>
  hash(
    JSON.stringify({
      protocol: 1,
      profile: profile.id,
      model_origin: profile.model_origin,
      allowed_origins: [...profile.allowed_origins].sort(),
      tools: ["collect_url", "submit_collection"],
      output: "observed_evidence_ids",
    }),
  );
export function authorizedURL(profile: CollectionProfile, value: string) {
  if (!isHTTPURL(value)) throw new Error("agent_url_denied");
  const url = new URL(value);
  if (!profile.allowed_origins.includes(url.origin) || url.hash)
    throw new Error("agent_url_denied");
  return url;
}
