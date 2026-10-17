// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import {
  BaseCollectorPlugin,
  PluginSettingsError,
  type CollectorContext,
} from "../../modules/plugins/sdk/index.js";
import { destination } from "../shared/social.js";
import {
  operatorSchema,
  settingsSchema,
  publicKey,
  type Operator,
  type Settings,
} from "./config.js";
import { descriptor } from "./descriptor.js";
import { normalizeEvents } from "./events.js";
import { requestRelay, type RelayRequest } from "./relay.js";
export class NostrCollector extends BaseCollectorPlugin<Operator, Settings> {
  constructor(private readonly transport: RelayRequest = requestRelay) {
    super({
      descriptor,
      operatorSchema,
      configurationSchema: settingsSchema,
      targets: ["node", "cloudflare"],
      capabilities: ["websocket"],
    });
  }
  protected override describe(operator: Operator) {
    return {
      ...descriptor,
      form: {
        fields: descriptor.form.fields.map((field) =>
          field.id === "relay"
            ? {
                id: "relay",
                type: "select" as const,
                label: "Relay",
                required: true,
                default: operator.relays[0]!.url,
                options: operator.relays.map((r) => ({
                  value: r.url,
                  label: r.url,
                })),
              }
            : field,
        ),
      },
    };
  }
  protected destinations(operator: Operator) {
    return [...new Set(operator.relays.map((r) => new URL(r.url).origin))].map(
      (origin) =>
        destination("nostr", origin, [
          "author_public_key",
          "hashtag",
          "event_kind",
        ]),
    );
  }
  protected override deploymentIssues(
    operator: Operator,
    target: "node" | "cloudflare",
  ) {
    return target === "cloudflare" &&
      operator.relays.some((r) => r.allow_private)
      ? ["Production Cloudflare Nostr requires public WSS"]
      : [];
  }
  protected override validateConfiguration(
    settings: Settings,
    operator: Operator,
  ) {
    if (!operator.relays.some((r) => r.url === settings.relay))
      throw new PluginSettingsError("nostr_relay_not_allowed", 403);
  }
  protected async collect(context: CollectorContext<Settings>) {
    const c = context.configuration;
    return normalizeEvents(
      await this.transport(
        c.relay,
        {
          kinds: [c.kind === "articles" ? 30023 : 1],
          limit: c.max_items,
          ...(c.mode === "author"
            ? { authors: [publicKey(c.target)] }
            : { "#t": [c.target] }),
        },
        context.signal,
      ),
      c,
    );
  }
}
export const nostrPlugin = new NostrCollector();
