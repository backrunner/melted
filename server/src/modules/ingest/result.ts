// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { z } from "zod";
import { hash } from "../../shared/crypto.js";
import { hasPortableText, isPortableText } from "../../shared/text.js";
import { CollectorError } from "../plugins/definition.js";
import { identifier } from "../plugins/dsl.js";
import type { PollResult } from "../sources/types.js";
const text = z.string().refine(isPortableText);
const url = z
  .url()
  .max(4096)
  .refine((v) => {
    const u = new URL(v);
    return (
      ["http:", "https:"].includes(u.protocol) && !u.username && !u.password
    );
  });
const date = z.iso.datetime({ offset: true }).nullable();
const content = z
  .object({
    external_id: text.min(1).max(4096),
    title: text.max(10000).nullable(),
    parts: z
      .array(
        z
          .object({
            kind: z.enum(["text", "html"]),
            mime_type: z.enum(["text/plain", "text/html"]),
            text,
          })
          .strict(),
      )
      .min(1)
      .max(2),
    canonical_url: url.nullable(),
    authors: z
      .array(
        z
          .object({
            name: text.max(1000).optional(),
            url: url.optional(),
            avatar: url.optional(),
          })
          .strict(),
      )
      .max(100),
    language: text.max(100).nullable(),
    published_at: date,
    modified_at: date,
    tags: z.array(text.max(1000)).max(100),
    media: z
      .array(
        z
          .object({
            url,
            mime_type: text.max(200).optional(),
            title: text.max(1000).optional(),
            size_in_bytes: z.number().nonnegative().optional(),
            duration_in_seconds: z.number().nonnegative().optional(),
          })
          .strict(),
      )
      .max(102),
  })
  .strict();
const resultSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            external_key: z.string(),
            content_hash: z.string(),
            content,
          })
          .strict(),
      )
      .max(100),
    checkpoint: z
      .record(identifier, text.max(4096))
      .refine((v) => Object.keys(v).length <= 40),
    received: z.number().int().min(0).max(1000),
    not_modified: z.boolean(),
    warnings: z
      .array(
        z
          .object({
            index: z.number().int().min(0).max(999),
            code: text.min(1).max(100),
          })
          .strict(),
      )
      .max(1000),
  })
  .strict();
/** Host owns identity/hashes and bounds; a plugin cannot write a chosen storage key. */
export async function validateResult(value: unknown): Promise<PollResult> {
  const parsed = resultSchema.safeParse(value);
  if (!parsed.success || !hasPortableText(parsed.data))
    throw new CollectorError({
      code: "invalid_plugin_output",
      retryable: false,
    });
  const result = parsed.data;
  if (
    result.received !== result.items.length + result.warnings.length ||
    (result.not_modified &&
      (result.received !== 0 || result.warnings.length > 0))
  )
    throw new CollectorError({
      code: "invalid_plugin_counts",
      retryable: false,
    });
  let bytes = 0;
  const ids = new Map<string, string>();
  for (const item of result.items) {
    const serialized = JSON.stringify(item.content),
      size = new TextEncoder().encode(serialized).length;
    bytes += size;
    if (size > 256 * 1024 || bytes > 4 * 1024 * 1024)
      throw new CollectorError({
        code: "plugin_output_too_large",
        retryable: false,
      });
    item.external_key = await hash(item.content.external_id);
    item.content_hash = await hash(serialized);
    const previous = ids.get(item.external_key);
    if (previous && previous !== item.content_hash)
      throw new CollectorError({
        code: "conflicting_plugin_output",
        retryable: false,
      });
    ids.set(item.external_key, item.content_hash);
  }
  return result;
}
