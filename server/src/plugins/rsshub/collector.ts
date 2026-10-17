// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { authorizeRoute } from "./routes.js";
import { hash } from "../../shared/crypto.js";
import { normalizeFeed } from "./json-feed.js";
import type { RSSHubConfig } from "./config.js";
import type { Source, PollResult } from "../../modules/sources/types.js";

import { CollectorError } from "../../modules/plugins/definition.js";
export { CollectorError } from "../../modules/plugins/definition.js";
export function retryAfter(value: string | null, now = Date.now()) {
  if (!value) return undefined;
  const delay = /^\d+$/.test(value)
    ? Number(value) * 1000
    : Date.parse(value) - now;
  return Number.isFinite(delay)
    ? Math.max(0, Math.min(delay, 8.64e15 - now))
    : undefined;
}
export async function pollRSSHub(
  source: Source,
  config: RSSHubConfig,
  signal?: AbortSignal,
  transport: typeof fetch = fetch,
  timeout = 30_000,
): Promise<PollResult> {
  try {
    authorizeRoute(config, String(source.configuration.route));
  } catch {
    throw new CollectorError({
      code: "route_not_allowed",
      retryable: false,
      blocked: true,
    });
  }
  const target = new URL(String(source.configuration.route), config.base_url);
  if (target.origin !== config.base_url)
    throw new CollectorError({
      code: "invalid_destination",
      retryable: false,
      blocked: true,
    });
  target.searchParams.set("format", "json");
  target.searchParams.set("limit", "100");
  if (config.access_key) target.searchParams.set("key", config.access_key);
  // Bind validators to the actual instance, route, format and server credential.
  // Only the hash is persisted; the credential-bearing URL never leaves here.
  const targetHash = await hash(target.href);
  const checkpoint =
    source.checkpoint.target === targetHash ? source.checkpoint : {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const deadline = signal
    ? AbortSignal.any([signal, controller.signal])
    : controller.signal;
  try {
    const headers = new Headers({
      Accept: "application/feed+json, application/json",
      "User-Agent": "Melted/0.2 RSSHub collector",
    });
    if (checkpoint.etag) headers.set("If-None-Match", checkpoint.etag);
    if (checkpoint.last_modified)
      headers.set("If-Modified-Since", checkpoint.last_modified);
    const response = await transport(target, {
      headers,
      redirect: "manual",
      signal: deadline,
    });
    if (response.status === 304) {
      if (!checkpoint.etag && !checkpoint.last_modified)
        throw new CollectorError({
          code: "unexpected_not_modified",
          retryable: false,
        });
      return {
        items: [],
        checkpoint,
        received: 0,
        warnings: [],
        not_modified: true,
      };
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new CollectorError({
        code: `upstream_http_${response.status}`,
        retryable: response.status === 429 || response.status >= 500,
        retry_after_ms: retryAfter(response.headers.get("Retry-After")),
        blocked:
          response.status >= 300 &&
          response.status < 500 &&
          response.status !== 429,
      });
    }
    if (!response.body)
      throw new CollectorError({ code: "empty_response", retryable: true });
    const reader = response.body.getReader();
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 4 * 1024 * 1024)
          throw new CollectorError({
            code: "response_too_large",
            retryable: false,
          });
        chunks.push(part.value);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    const buffer = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.byteLength;
    }
    let result: PollResult;
    try {
      result = await normalizeFeed(
        JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer)),
      );
    } catch {
      throw new CollectorError({ code: "invalid_feed", retryable: false });
    }
    const etag = response.headers.get("ETag"),
      modified = response.headers.get("Last-Modified");
    result.checkpoint.target = targetHash;
    if (etag && etag.length <= 1000) result.checkpoint.etag = etag;
    if (modified && modified.length <= 1000)
      result.checkpoint.last_modified = modified;
    return result;
  } catch (error) {
    if (error instanceof CollectorError) throw error;
    // Network exceptions can contain the credential-bearing URL: never expose them.
    throw new CollectorError({
      code: deadline.aborted ? "collector_timeout" : "upstream_unavailable",
      retryable: true,
    });
  } finally {
    clearTimeout(timer);
  }
}
