// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { z } from "zod";
import { originSchema, publicOrigin } from "../../shared/network-origin.js";
export const operatorSchema = z
  .object({
    instances: z
      .array(
        z
          .object({
            origin: originSchema,
            allow_private: z.boolean().default(false),
            access_token: z
              .string()
              .min(1)
              .max(4096)
              .regex(/^[\x21-\x7e]+$/)
              .optional(),
          })
          .strict()
          .refine((i) => i.allow_private || publicOrigin(i.origin)),
      )
      .min(1)
      .max(50),
  })
  .strict()
  .refine(
    (c) =>
      new Set(c.instances.map((i) => i.origin)).size === c.instances.length,
  );
export const settingsSchema = z
  .object({
    instance: originSchema,
    mode: z.enum(["account", "hashtag"]).default("account"),
    target: z.string().min(1).max(320),
    include_replies: z.boolean().default(true),
    include_boosts: z.boolean().default(false),
    max_items: z.number().int().min(1).max(40).default(40),
  })
  .strict()
  .refine((c) =>
    c.mode === "account"
      ? /^[A-Za-z0-9_.-]+(?:@[A-Za-z0-9.-]+)?$/.test(c.target)
      : /^[\p{L}\p{N}_]+$/u.test(c.target),
  );
export type Operator = z.infer<typeof operatorSchema>;
export type Settings = z.infer<typeof settingsSchema>;
