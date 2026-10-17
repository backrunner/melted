// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { z } from "zod";
import { bech32 } from "@scure/base";
import { maxItemsSchema } from "../shared/social.js";
import { publicOrigin } from "../../shared/network-origin.js";

export const relaySchema = z
  .string()
  .min(1)
  .max(200)
  .refine((value) => {
    try {
      const u = new URL(value);
      return (
        ["ws:", "wss:"].includes(u.protocol) &&
        !u.username &&
        !u.password &&
        !u.search &&
        !u.hash &&
        !/[\s\\]/.test(value) &&
        !/%(?![0-9a-f]{2})/i.test(value)
      );
    } catch {
      return false;
    }
  })
  .transform((v) => new URL(v).href);
export const operatorSchema = z
  .object({
    relays: z
      .array(
        z
          .object({
            url: relaySchema,
            allow_private: z.boolean().default(false),
          })
          .strict()
          .refine(
            (r) =>
              r.allow_private ||
              publicOrigin(
                r.url.replace(/^wss:/, "https:").replace(/^ws:/, "http:"),
              ),
          ),
      )
      .min(1)
      .max(50),
  })
  .strict()
  .refine((c) => new Set(c.relays.map((r) => r.url)).size === c.relays.length);
export function publicKey(value: string): string {
  if (/^[0-9a-fA-F]{64}$/.test(value)) return value.toLowerCase();
  const decoded = bech32.decode(value as `${string}1${string}`, 1024),
    bytes = bech32.fromWords(decoded.words);
  if (decoded.prefix !== "npub" || bytes.length !== 32)
    throw new Error("invalid_nostr_pubkey");
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
export const settingsSchema = z
  .object({
    relay: relaySchema,
    mode: z.enum(["author", "hashtag"]).default("author"),
    target: z.string().min(1).max(200),
    kind: z.enum(["notes", "articles"]).default("notes"),
    max_items: maxItemsSchema,
  })
  .strict()
  .refine((c) => {
    try {
      return c.mode === "author"
        ? Boolean(publicKey(c.target))
        : /^[\p{L}\p{N}_]+$/u.test(c.target);
    } catch {
      return false;
    }
  });
export type Operator = z.infer<typeof operatorSchema>;
export type Settings = z.infer<typeof settingsSchema>;
