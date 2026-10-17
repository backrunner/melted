// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import {
  BaseCollectorPlugin,
  CollectorError,
  PluginSettingsError,
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
export class FediverseCollector extends BaseCollectorPlugin<
  Operator,
  Settings
> {
  constructor(private readonly transport: typeof fetch = fetch) {
    super({
      descriptor,
      operatorSchema,
      configurationSchema: settingsSchema,
      targets: ["node", "cloudflare"],
      capabilities: ["https"],
    });
  }
  protected override describe(operator: Operator) {
    return {
      ...descriptor,
      form: {
        fields: descriptor.form.fields.map((field) =>
          field.id === "instance"
            ? {
                id: "instance",
                type: "select" as const,
                label: "实例",
                required: true,
                default: operator.instances[0]!.origin,
                options: operator.instances.map((i) => ({
                  value: i.origin,
                  label: new URL(i.origin).host,
                })),
              }
            : field,
        ),
      },
    };
  }
  protected destinations(operator: Operator) {
    return operator.instances.map((i) =>
      destination("fediverse", i.origin, ["account_identifier", "hashtag"]),
    );
  }
  protected override deploymentIssues(
    operator: Operator,
    target: "node" | "cloudflare",
  ) {
    return target === "cloudflare" &&
      operator.instances.some((i) => i.allow_private)
      ? ["Production Cloudflare Fediverse requires public HTTPS"]
      : [];
  }
  protected override validateConfiguration(
    settings: Settings,
    operator: Operator,
  ) {
    if (!operator.instances.some((i) => i.origin === settings.instance))
      throw new PluginSettingsError("fediverse_instance_not_allowed", 403);
  }
  protected async collect(
    context: CollectorContext<Settings>,
    operator: Operator,
  ) {
    const c = context.configuration,
      instance = operator.instances.find((i) => i.origin === c.instance)!;
    // One deadline covers both account lookup and statuses. Never follow a URL returned by the instance.
    const signal = context.signal
      ? AbortSignal.any([context.signal, AbortSignal.timeout(30_000)])
      : AbortSignal.timeout(30_000);
    const headers: Record<string, string> = { Accept: "application/json" };
    if (instance.access_token)
      headers.Authorization = `Bearer ${instance.access_token}`;
    const get = async (url: URL) => {
      const response = await requestJSON(url, {
        transport: this.transport,
        signal,
        headers,
      });
      if (response.status === 304)
        throw new CollectorError({
          code: "unexpected_not_modified",
          retryable: false,
        });
      return response.data;
    };
    let accountID: string | undefined;
    if (c.mode === "account") {
      const url = new URL("/api/v1/accounts/lookup", c.instance);
      url.searchParams.set("acct", c.target);
      try {
        accountID = string(object(await get(url)).id);
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(accountID)) throw new Error();
      } catch (error) {
        if (error instanceof CollectorError) throw error;
        throw new CollectorError({
          code: "invalid_account_response",
          retryable: false,
        });
      }
    }
    const url = new URL(
      accountID
        ? `/api/v1/accounts/${accountID}/statuses`
        : `/api/v1/timelines/tag/${encodeURIComponent(c.target)}`,
      c.instance,
    );
    url.searchParams.set("limit", String(c.max_items));
    if (accountID) {
      url.searchParams.set("exclude_replies", String(!c.include_replies));
      url.searchParams.set("exclude_reblogs", String(!c.include_boosts));
    }
    return normalizeItems(
      array(await get(url)).slice(0, c.max_items),
      (entry) => {
        let post = object(entry);
        const isPublic = (value: unknown) => {
          if (
            !["public", "unlisted", "private", "direct"].includes(string(value))
          )
            throw new Error("invalid_visibility");
          return value === "public";
        };
        if (!isPublic(post.visibility)) return null;
        if (post.reblog) {
          if (!c.include_boosts) return null;
          post = object(post.reblog);
        }
        if (
          !isPublic(post.visibility) ||
          (!c.include_replies && post.in_reply_to_id != null)
        )
          return null;
        const result = blank(string(post.uri)),
          author = object(post.account);
        result.title =
          typeof post.spoiler_text === "string" && post.spoiler_text
            ? post.spoiler_text
            : null;
        result.parts = [
          { kind: "html", mime_type: "text/html", text: string(post.content) },
        ];
        result.canonical_url = link(post.url) ?? link(post.uri);
        result.authors = [
          {
            name:
              typeof author.display_name === "string" && author.display_name
                ? author.display_name
                : string(author.acct),
            ...(link(author.url) ? { url: link(author.url)! } : {}),
            ...(link(author.avatar) ? { avatar: link(author.avatar)! } : {}),
          },
        ];
        result.language = post.language == null ? null : string(post.language);
        result.published_at = date(post.created_at);
        result.modified_at = date(post.edited_at);
        if (Array.isArray(post.tags))
          result.tags = post.tags.map((tag) => string(object(tag).name));
        if (Array.isArray(post.media_attachments))
          for (const value of post.media_attachments) {
            const media = object(value),
              url = link(media.url) ?? link(media.remote_url);
            if (url)
              result.media.push({
                url,
                ...(typeof media.description === "string"
                  ? { title: media.description.slice(0, 1000) }
                  : {}),
              });
          }
        return result;
      },
    );
  }
}
export const fediversePlugin = new FediverseCollector();
