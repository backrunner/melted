// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { z } from "zod";
import { originSchema, publicOrigin } from "../../shared/network-origin.js";
import { profileSchema } from "../../modules/agent-collection/protocol.js";
export const operatorSchema = z
  .object({
    gateway_origin: originSchema,
    allow_private: z.boolean().default(false),
    access_token: z
      .string()
      .min(32)
      .max(4096)
      .regex(/^[\x21-\x7e]+$/),
    profiles: z.array(profileSchema).min(1).max(10),
  })
  .strict()
  .refine((o) => o.allow_private || publicOrigin(o.gateway_origin))
  .refine(
    (o) => new Set(o.profiles.map((p) => p.id)).size === o.profiles.length,
  )
  .refine(
    (o) =>
      new Set([
        o.gateway_origin,
        ...o.profiles.flatMap((p) => [p.model_origin, ...p.allowed_origins]),
      ]).size <= 50,
  );
export type Operator = z.infer<typeof operatorSchema>;
