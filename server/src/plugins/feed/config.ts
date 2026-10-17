// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { z } from "zod";
import { isHTTPURL } from "../../shared/url.js";
import { PluginSettingsError } from "../../modules/plugins/sdk/index.js";

const origin = z
  .string()
  .max(2048)
  .refine((v) => {
    if (!isHTTPURL(v)) return false;
    const u = new URL(v);
    return u.pathname === "/" && !u.search;
  })
  .transform((v) => new URL(v).origin);
function publicOrigin(value: string) {
  if (!isHTTPURL(value)) return false;
  const u = new URL(value);
  // The operator selects trusted exact origins, never account-controlled hosts or wildcards.
  return (
    u.protocol === "https:" &&
    u.port === "" &&
    !/^[\d.]+$/.test(u.hostname) &&
    !u.hostname.includes(":") &&
    u.hostname.includes(".") &&
    !/(?:\.|^)(?:localhost|local|internal|home|lan|test|invalid)\.?$/i.test(
      u.hostname,
    ) &&
    !u.hostname.endsWith(".")
  );
}
export const feedConfigSchema = z
  .object({
    allowed_origins: z.array(origin.refine(publicOrigin)).max(50).default([]),
    private_origins: z.array(origin).max(10).default([]),
  })
  .strict()
  .refine((c) => {
    const origins = [...c.allowed_origins, ...c.private_origins];
    return (
      origins.length > 0 &&
      origins.length <= 50 &&
      new Set(origins).size === origins.length
    );
  }, "Configure distinct, explicitly authorized feed origins");
export const feedSettingsSchema = z
  .object({
    url: z
      .string()
      .max(2048)
      .refine(isHTTPURL)
      .transform((v) => new URL(v).href),
    format: z.enum(["auto", "rss", "atom", "json"]).default("auto"),
    max_items: z.number().int().min(1).max(100).default(100),
  })
  .strict();
export type FeedConfig = z.infer<typeof feedConfigSchema>;
export type FeedSettings = z.infer<typeof feedSettingsSchema>;
export function authorizeFeed(config: FeedConfig, value: string): URL {
  if (!isHTTPURL(value)) throw new PluginSettingsError("invalid_feed_url");
  const url = new URL(value);
  if (
    ![...config.allowed_origins, ...config.private_origins].includes(url.origin)
  )
    throw new PluginSettingsError("feed_origin_not_allowed", 403);
  return url;
}
