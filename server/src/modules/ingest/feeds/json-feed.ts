// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { z } from "zod";
import { hash } from "../../../shared/crypto.js";
import { hasPortableText } from "../../../shared/text.js";
import type { PollResult, RawContent } from "../../sources/types.js";

const url = z
  .url()
  .max(4096)
  .refine(
    (v) =>
      ["https:", "http:"].includes(new URL(v).protocol) &&
      !new URL(v).username &&
      !new URL(v).password,
  );
const author = z.object({
  name: z.string().max(1000).optional(),
  url: url.optional(),
  avatar: url.optional(),
});
const date = z.iso
  .datetime({ offset: true })
  .transform((v) => new Date(v).toISOString());
const itemSchema = z
  .object({
    id: z.union([
      z.string().min(1).max(4096),
      z.number().int().transform(String),
    ]),
    title: z.string().max(10000).optional(),
    url: url.optional(),
    content_html: z.string().optional(),
    content_text: z.string().optional(),
    date_published: date.optional(),
    date_modified: date.optional(),
    authors: z.array(author).max(100).optional(),
    author: author.optional(),
    language: z.string().max(100).optional(),
    tags: z.array(z.string().max(1000)).max(100).optional(),
    image: url.optional(),
    banner_image: url.optional(),
    attachments: z
      .array(
        z.object({
          url,
          mime_type: z.string().max(200).optional(),
          title: z.string().max(1000).optional(),
          size_in_bytes: z.number().nonnegative().optional(),
          duration_in_seconds: z.number().nonnegative().optional(),
        }),
      )
      .max(100)
      .optional(),
  })
  .refine((v) => Boolean(v.content_html || v.content_text), "Missing content");
const feedSchema = z.object({
  version: z.enum([
    "https://jsonfeed.org/version/1",
    "https://jsonfeed.org/version/1.1",
  ]),
  title: z.string(),
  items: z.array(z.unknown()).max(1000),
  authors: z.array(author).max(100).optional(),
  author: author.optional(),
  language: z.string().max(100).optional(),
});

export async function normalizeFeed(value: unknown): Promise<PollResult> {
  const feed = feedSchema.parse(value);
  const result: PollResult = {
    items: [],
    checkpoint: {},
    received: feed.items.length,
    warnings: [],
    not_modified: false,
  };
  const versions = new Map<
    string,
    { hash: string; indices: number[]; conflict: boolean }
  >();
  let batchBytes = 0;
  for (const [index, candidate] of feed.items.entries()) {
    if (index >= 100) {
      result.warnings.push({ index, code: "item_limit" });
      continue;
    }
    if (
      new TextEncoder().encode(JSON.stringify(candidate)).length >
      256 * 1024
    ) {
      result.warnings.push({ index, code: "item_too_large" });
      continue;
    }
    const parsed = itemSchema.safeParse(candidate);
    if (!parsed.success) {
      result.warnings.push({ index, code: "invalid_item" });
      continue;
    }
    const item = parsed.data;
    const content: RawContent = {
      external_id: item.id,
      title: item.title ?? null,
      parts: [
        ...(item.content_html
          ? [
              {
                kind: "html" as const,
                mime_type: "text/html",
                text: item.content_html,
              },
            ]
          : []),
        ...(item.content_text
          ? [
              {
                kind: "text" as const,
                mime_type: "text/plain",
                text: item.content_text,
              },
            ]
          : []),
      ],
      canonical_url: item.url ?? null,
      authors:
        item.authors ??
        (item.author
          ? [item.author]
          : (feed.authors ?? (feed.author ? [feed.author] : []))),
      language: item.language ?? feed.language ?? null,
      published_at: item.date_published ?? null,
      modified_at: item.date_modified ?? null,
      tags: item.tags ?? [],
      media: [
        ...(item.attachments ?? []),
        ...(item.image ? [{ url: item.image }] : []),
        ...(item.banner_image ? [{ url: item.banner_image }] : []),
      ],
    };
    if (!hasPortableText(content)) {
      result.warnings.push({ index, code: "invalid_text" });
      continue;
    }
    const serialized = JSON.stringify(content);
    const contentBytes = new TextEncoder().encode(serialized).length;
    if (contentBytes > 256 * 1024) {
      result.warnings.push({ index, code: "item_too_large" });
      continue;
    }
    if (batchBytes + contentBytes > 4 * 1024 * 1024) {
      result.warnings.push({ index, code: "batch_too_large" });
      continue;
    }
    batchBytes += contentBytes;
    const contentHash = await hash(serialized);
    const previous = versions.get(content.external_id);
    if (previous) {
      previous.indices.push(index);
      previous.conflict ||= previous.hash !== contentHash;
    } else
      versions.set(content.external_id, {
        hash: contentHash,
        indices: [index],
        conflict: false,
      });
    result.items.push({
      external_key: await hash(content.external_id),
      content,
      content_hash: contentHash,
    });
  }
  // No order-dependent winner for conflicting versions within one response.
  // Keep the previous persisted revision until the source resolves the conflict.
  for (const group of versions.values())
    if (group.conflict)
      result.warnings.push(
        ...group.indices.map((index) => ({
          index,
          code: "conflicting_external_id",
        })),
      );
  result.items = result.items.filter(
    (item) => !versions.get(item.content.external_id)!.conflict,
  );
  result.warnings.sort((a, b) => a.index - b.index);
  return result;
}
