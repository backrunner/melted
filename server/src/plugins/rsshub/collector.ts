// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { authorizeRoute } from "./routes.js";
import { hash } from "../../shared/crypto.js";
import { normalizeFeed } from "./json-feed.js";
import type { RSSHubConfig } from "./config.js";
import type {
  CollectorContext,
  Configuration,
  PollResult,
} from "../../modules/plugins/sdk/index.js";

import {
  CollectorError,
  requestJSON,
} from "../../modules/plugins/sdk/index.js";
export async function pollRSSHub(
  source: CollectorContext<Configuration>,
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
  const headers = new Headers({
    Accept: "application/feed+json, application/json",
    "User-Agent": "Melted/0.2 RSSHub collector",
  });
  if (checkpoint.etag) headers.set("If-None-Match", checkpoint.etag);
  if (checkpoint.last_modified)
    headers.set("If-Modified-Since", checkpoint.last_modified);
  const response = await requestJSON(target, {
    headers,
    signal,
    transport,
    timeoutMs: timeout,
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
  let result: PollResult;
  try {
    result = await normalizeFeed(response.data);
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
}
