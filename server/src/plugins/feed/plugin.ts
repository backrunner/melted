// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import {
  BaseCollectorPlugin,
  CollectorError,
  requestBytes,
  type CollectorContext,
  type Destination,
} from "../../modules/plugins/sdk/index.js";
import { hash } from "../../shared/crypto.js";
import { normalizeSyndication } from "../../modules/ingest/feeds/syndication.js";
import {
  authorizeFeed,
  feedConfigSchema,
  feedSettingsSchema,
  type FeedConfig,
  type FeedSettings,
} from "./config.js";
import { descriptor } from "./descriptor.js";

export class FeedCollector extends BaseCollectorPlugin<
  FeedConfig,
  FeedSettings
> {
  constructor(private readonly transport: typeof fetch = fetch) {
    super({
      descriptor,
      operatorSchema: feedConfigSchema,
      configurationSchema: feedSettingsSchema,
      targets: ["node", "cloudflare"],
      capabilities: ["https"],
    });
  }
  protected destinations(operator: FeedConfig): Destination[] {
    return [...operator.allowed_origins, ...operator.private_origins].map(
      (origin) => ({
        id: "feed",
        origin,
        purpose: "public_feed_collection",
        data_categories: ["feed_path", "feed_query"],
      }),
    );
  }
  protected override deploymentIssues(
    operator: FeedConfig,
    target: "node" | "cloudflare",
  ) {
    return target === "cloudflare" && operator.private_origins.length
      ? ["Production Cloudflare feeds require public HTTPS origins"]
      : [];
  }
  protected override validateConfiguration(
    settings: FeedSettings,
    operator: FeedConfig,
  ) {
    authorizeFeed(operator, settings.url);
  }
  protected async collect(
    context: CollectorContext<FeedSettings>,
    operator: FeedConfig,
  ) {
    const target = authorizeFeed(operator, context.configuration.url);
    const targetHash = await hash(
      JSON.stringify([
        target.href,
        context.configuration.format,
        context.configuration.max_items,
      ]),
    );
    const checkpoint =
      context.checkpoint.target === targetHash ? context.checkpoint : {};
    const headers = new Headers({
      Accept:
        "application/rss+xml, application/atom+xml, application/feed+json, application/xml, text/xml, application/json",
      "User-Agent": "Melted/0.2 Feed collector",
    });
    if (checkpoint.etag) headers.set("If-None-Match", checkpoint.etag);
    if (checkpoint.last_modified)
      headers.set("If-Modified-Since", checkpoint.last_modified);
    const response = await requestBytes(target, {
      headers,
      signal: context.signal,
      transport: this.transport,
    });
    if (response.status === 304) {
      if (!checkpoint.etag && !checkpoint.last_modified)
        throw new CollectorError({
          code: "unexpected_not_modified",
          retryable: false,
        });
      return {
        items: [],
        received: 0,
        warnings: [],
        checkpoint: { ...checkpoint },
        not_modified: true,
      };
    }
    const result = await normalizeSyndication(
      response.data,
      target.href,
      context.configuration.format,
      context.configuration.max_items,
      response.headers.get("Content-Type"),
    );
    result.checkpoint.target = targetHash;
    const etag = response.headers.get("ETag"),
      modified = response.headers.get("Last-Modified");
    if (etag && etag.length <= 1000) result.checkpoint.etag = etag;
    if (modified && modified.length <= 1000)
      result.checkpoint.last_modified = modified;
    return result;
  }
}
export const feedPlugin = new FeedCollector();
