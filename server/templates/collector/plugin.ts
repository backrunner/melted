// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { z } from "zod";
import {
  BaseCollectorPlugin,
  CollectorError,
  PluginSettingsError,
  collectionResult,
  requestJSON,
  type CollectorContext,
  type Destination,
  type RawContent,
} from "../../src/modules/plugins/sdk/index.js";
import {
  operatorSchema,
  settingsSchema,
  type Operator,
  type Settings,
} from "./config.js";
import { descriptor } from "./descriptor.js";

const itemSchema = z
  .object({
    id: z.string().min(1).max(4096),
    title: z.string().max(10000),
    text: z.string().max(200000),
    published_at: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();
const feedSchema = z.object({ items: z.array(z.unknown()).max(100) }).strict();

export class ExampleCollector extends BaseCollectorPlugin<Operator, Settings> {
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
      ...this.descriptor,
      form: {
        fields: [
          {
            ...this.descriptor.form.fields[0]!,
            suggestions: operator.allowed_topics.map((topic) => ({
              value: topic,
              label: topic,
            })),
          },
        ],
      },
    };
  }
  protected destinations(operator: Operator): Destination[] {
    return [
      {
        id: this.descriptor.id,
        origin: operator.base_url,
        purpose: "public_feed_collection",
        data_categories: ["source_topic"],
      },
    ];
  }
  protected override validateConfiguration(
    settings: Settings,
    operator: Operator,
  ) {
    if (!operator.allowed_topics.includes(settings.topic))
      throw new PluginSettingsError("topic_not_allowed", 403);
  }
  protected async collect(
    context: CollectorContext<Settings>,
    operator: Operator,
  ) {
    const target = new URL("/articles", operator.base_url);
    target.searchParams.set("topic", context.configuration.topic);
    const response = await requestJSON(target, {
      signal: context.signal,
      transport: this.transport,
      headers: {
        Accept: "application/json",
        ...(operator.token
          ? { Authorization: `Bearer ${operator.token}` }
          : {}),
      },
    });
    if (response.status === 304)
      throw new CollectorError({
        code: "unexpected_not_modified",
        retryable: false,
      });
    const feed = feedSchema.safeParse(response.data);
    if (!feed.success)
      throw new CollectorError({ code: "invalid_feed", retryable: false });
    const items: RawContent[] = [],
      warnings: { index: number; code: string }[] = [];
    for (const [index, value] of feed.data.items.entries()) {
      const item = itemSchema.safeParse(value);
      if (!item.success) {
        warnings.push({ index, code: "invalid_item" });
        continue;
      }
      const { id, title, text, published_at } = item.data;
      items.push({
        external_id: id,
        title,
        parts: [{ kind: "text", mime_type: "text/plain", text }],
        canonical_url: null,
        authors: [],
        language: null,
        published_at: published_at ?? null,
        modified_at: null,
        tags: [],
        media: [],
      });
    }
    return collectionResult({ items, warnings });
  }
}
export const examplePlugin = new ExampleCollector();
