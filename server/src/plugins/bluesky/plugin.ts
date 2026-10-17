// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import {
  BaseCollectorPlugin,
  CollectorError,
  requestJSON,
  type CollectorContext,
} from "../../modules/plugins/sdk/index.js";
import {
  array,
  blank,
  date,
  destination,
  link,
  normalizeItems,
  object,
  string,
} from "../shared/social.js";
import {
  operatorSchema,
  settingsSchema,
  type Operator,
  type Settings,
} from "./config.js";
import { descriptor } from "./descriptor.js";

export class BlueskyCollector extends BaseCollectorPlugin<Operator, Settings> {
  constructor(private readonly transport: typeof fetch = fetch) {
    super({
      descriptor,
      operatorSchema,
      configurationSchema: settingsSchema,
      targets: ["node", "cloudflare"],
      capabilities: ["https"],
    });
  }
  protected destinations(operator: Operator) {
    return [
      destination("bluesky", operator.service_url, [
        "account_identifier",
        "feed_identifier",
      ]),
    ];
  }
  protected override deploymentIssues(
    operator: Operator,
    target: "node" | "cloudflare",
  ) {
    return target === "cloudflare" && operator.allow_private
      ? ["Production Cloudflare Bluesky requires public HTTPS"]
      : [];
  }
  protected async collect(
    context: CollectorContext<Settings>,
    operator: Operator,
  ) {
    const c = context.configuration;
    const url = new URL(
      `/xrpc/app.bsky.feed.${c.mode === "author" ? "getAuthorFeed" : "getFeed"}`,
      operator.service_url,
    );
    url.searchParams.set(c.mode === "author" ? "actor" : "feed", c.target);
    url.searchParams.set("limit", String(c.max_items));
    const response = await requestJSON(url, {
      transport: this.transport,
      signal: context.signal,
      headers: { Accept: "application/json" },
    });
    if (response.status === 304)
      throw new CollectorError({
        code: "unexpected_not_modified",
        retryable: false,
      });
    let entries: unknown[];
    try {
      entries = array(object(response.data).feed);
    } catch {
      throw new CollectorError({
        code: "invalid_social_response",
        retryable: false,
      });
    }
    return normalizeItems(entries.slice(0, c.max_items), (entry) => {
      const item = object(entry),
        post = object(item.post),
        record = object(post.record),
        author = object(post.author);
      if (
        (!c.include_reposts && item.reason !== undefined) ||
        (!c.include_replies && record.reply !== undefined)
      )
        return null;
      if (record.$type !== "app.bsky.feed.post")
        throw new Error("invalid_record");
      const uri = string(post.uri),
        did = string(author.did);
      const match =
        /^at:\/\/(did:[^/]+)\/app\.bsky\.feed\.post\/([A-Za-z0-9._~:-]+)$/.exec(
          uri,
        );
      if (!match || match[1] !== did) throw new Error("invalid_post_uri");
      const result = blank(uri);
      result.parts = [
        { kind: "text", mime_type: "text/plain", text: string(record.text) },
      ];
      result.canonical_url = `https://bsky.app/profile/${encodeURIComponent(did)}/post/${match[2]}`;
      result.authors = [
        {
          name:
            typeof author.displayName === "string" && author.displayName
              ? author.displayName
              : string(author.handle),
          url: `https://bsky.app/profile/${encodeURIComponent(did)}`,
          ...(link(author.avatar) ? { avatar: link(author.avatar)! } : {}),
        },
      ];
      result.published_at = date(record.createdAt);
      if (Array.isArray(record.langs) && record.langs.length)
        result.language = string(record.langs[0]);
      if (Array.isArray(record.tags)) result.tags = record.tags.map(string);
      if (post.embed) {
        let embed = object(post.embed);
        if (embed.media) embed = object(embed.media);
        if (Array.isArray(embed.images))
          for (const image of embed.images) {
            const i = object(image);
            const url = link(i.fullsize);
            if (url)
              result.media.push({
                url,
                ...(typeof i.alt === "string"
                  ? { title: i.alt.slice(0, 1000) }
                  : {}),
              });
          }
        const video = link(embed.playlist);
        if (video)
          result.media.push({
            url: video,
            mime_type: "application/vnd.apple.mpegurl",
          });
        if (embed.external) {
          const e = object(embed.external),
            url = link(e.uri);
          if (url)
            result.media.push({
              url,
              ...(typeof e.title === "string"
                ? { title: e.title.slice(0, 1000) }
                : {}),
            });
        }
      }
      return result;
    });
  }
}
export const blueskyPlugin = new BlueskyCollector();
