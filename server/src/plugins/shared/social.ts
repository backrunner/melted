// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { z } from "zod";
import {
  collectionResult,
  CollectorError,
  type Destination,
} from "../../modules/plugins/sdk/index.js";
import type { RawContent, Run } from "../../modules/sources/types.js";
import { isHTTPURL } from "../../shared/url.js";

export const maxItemsSchema = z.number().int().min(1).max(100).default(50);
export const maxItemsField = {
  id: "max_items",
  type: "integer" as const,
  label: "单次条数上限",
  minimum: 1,
  maximum: 100,
  default: 50,
  help: "采集最新窗口，不回填完整历史",
};
export const actions = [
  {
    id: "sync",
    label: "立即采集",
    description: "获取当前公开内容",
    effect: "collect" as const,
    input: { fields: [] },
  },
  {
    id: "validate",
    label: "检查配置",
    description: "检查订阅目标与服务器授权",
    effect: "validate" as const,
    input: { fields: [] },
  },
];
export function destination(
  id: string,
  origin: string,
  categories: string[],
): Destination {
  return {
    id,
    origin,
    purpose: "public_feed_collection",
    data_categories: categories,
  };
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("invalid_object");
  return value as Record<string, unknown>;
}
export function string(value: unknown): string {
  if (typeof value !== "string") throw new Error("invalid_string");
  return value;
}
export function link(value: unknown): string | null {
  return typeof value === "string" && isHTTPURL(value) ? value : null;
}
export function date(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (
    typeof value !== "string" ||
    !z.iso.datetime({ offset: true }).safeParse(value).success
  )
    throw new Error("invalid_date");
  return new Date(value).toISOString();
}
export function blank(external_id: string): RawContent {
  return {
    external_id,
    title: null,
    parts: [],
    canonical_url: null,
    authors: [],
    language: null,
    published_at: null,
    modified_at: null,
    tags: [],
    media: [],
  };
}
export function array(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > 1000)
    throw new CollectorError({
      code: "invalid_social_response",
      retryable: false,
    });
  return value;
}
/** Validate entries independently so malformed content remains a visible partial run. */
export async function normalizeItems(
  values: unknown[],
  convert: (value: unknown) => RawContent | null | Promise<RawContent | null>,
) {
  const items: RawContent[] = [],
    warnings: Run["warnings"] = [];
  for (const [index, value] of values.entries()) {
    try {
      const content = await convert(value);
      if (!content) continue;
      await collectionResult({ items: [content] });
      items.push(content);
    } catch {
      warnings.push({ index, code: "invalid_social_item" });
    }
  }
  return collectionResult({ items, warnings });
}
