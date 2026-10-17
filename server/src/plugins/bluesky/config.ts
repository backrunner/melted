// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { z } from "zod";
import { originSchema, publicOrigin } from "../../shared/network-origin.js";
import { maxItemsSchema } from "../shared/social.js";
export const operatorSchema = z
  .object({
    service_url: originSchema.default("https://public.api.bsky.app"),
    allow_private: z.boolean().default(false),
  })
  .strict()
  .refine((c) => c.allow_private || publicOrigin(c.service_url));
export function actor(value: string) {
  return /^(?:did:plc:[a-z2-7]{24}|did:web:[A-Za-z0-9.%:_-]+|[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z][A-Za-z0-9-]*)$/.test(
    value,
  );
}
export const settingsSchema = z
  .object({
    mode: z.enum(["author", "feed"]).default("author"),
    target: z.string().min(1).max(1000),
    include_replies: z.boolean().default(true),
    include_reposts: z.boolean().default(false),
    max_items: maxItemsSchema,
  })
  .strict()
  .refine((c) =>
    c.mode === "author"
      ? actor(c.target)
      : /^at:\/\/[^/]+\/app\.bsky\.feed\.generator\/[A-Za-z0-9._~:-]+$/.test(
          c.target,
        ) && actor(c.target.split("/")[2]!),
  );
export type Operator = z.infer<typeof operatorSchema>;
export type Settings = z.infer<typeof settingsSchema>;
