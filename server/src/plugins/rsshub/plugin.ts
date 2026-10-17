// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { z } from "zod";
import {
  BaseCollectorPlugin,
  type CollectorContext,
  type Destination,
} from "../../modules/plugins/sdk/index.js";
import { rsshubConfigSchema, type RSSHubConfig } from "./config.js";
import { authorizeRoute, validRoute } from "./routes.js";
import { pollRSSHub } from "./collector.js";
import { routeSuggestions } from "./catalog.js";
import { descriptor } from "./descriptor.js";
const settingsSchema = z
  .object({ route: z.string().max(2048).refine(validRoute) })
  .strict();
type Settings = z.infer<typeof settingsSchema>;
export class RSSHubCollector extends BaseCollectorPlugin<
  RSSHubConfig,
  Settings
> {
  constructor() {
    super({
      descriptor,
      operatorSchema: rsshubConfigSchema,
      configurationSchema: settingsSchema,
      targets: ["node", "cloudflare"],
      capabilities: ["https"],
    });
  }
  protected override describe(operator: RSSHubConfig) {
    return {
      ...this.descriptor,
      form: {
        fields: [
          {
            ...this.descriptor.form.fields[0]!,
            suggestions: routeSuggestions(operator),
          },
        ],
      },
    };
  }
  protected destinations(operator: RSSHubConfig): Destination[] {
    return [
      {
        id: this.descriptor.id,
        origin: operator.base_url,
        purpose: "public_feed_collection",
        data_categories: ["source_route"],
      },
    ];
  }
  protected override deploymentIssues(
    operator: RSSHubConfig,
    target: "node" | "cloudflare",
  ) {
    return target === "cloudflare" &&
      (operator.allow_private || !operator.base_url.startsWith("https://"))
      ? ["Production Cloudflare RSSHub requires a public HTTPS instance"]
      : [];
  }
  protected override validateConfiguration(
    settings: Settings,
    operator: RSSHubConfig,
  ) {
    authorizeRoute(operator, settings.route);
  }
  protected collect(
    context: CollectorContext<Settings>,
    operator: RSSHubConfig,
  ) {
    return pollRSSHub(context, operator, context.signal);
  }
}
export const rsshubPlugin = new RSSHubCollector();
