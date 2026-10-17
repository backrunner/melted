// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import {
  BaseCollectorPlugin,
  CollectorError,
  PluginSettingsError,
  type CollectorContext,
  type Destination,
} from "../../modules/plugins/sdk/index.js";
import { validateResult } from "../../modules/ingest/result.js";
import {
  authorizedURL,
  policyHash,
  settingsSchema,
  type AgentSettings,
} from "../../modules/agent-collection/protocol.js";
import { descriptor } from "./descriptor.js";
import { operatorSchema, type Operator } from "./config.js";

export class DeepSeekHarnessCollector extends BaseCollectorPlugin<
  Operator,
  AgentSettings
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
  protected override describe(o: Operator) {
    return {
      ...this.descriptor,
      form: {
        fields: this.descriptor.form.fields.map((f) =>
          f.id !== "profile"
            ? f
            : {
                id: f.id,
                type: "select" as const,
                label: f.label,
                required: true,
                default: o.profiles[0]!.id,
                options: o.profiles.map((p) => ({
                  value: p.id,
                  label: p.label,
                })),
              },
        ),
      },
    };
  }
  protected destinations(o: Operator): Destination[] {
    return [
      ...new Set([
        o.gateway_origin,
        ...o.profiles.flatMap((p) => [p.model_origin, ...p.allowed_origins]),
      ]),
    ].map((origin) => ({
      id: descriptor.id,
      origin,
      purpose: "agent_collection",
      data_categories: [
        "collection_goal",
        "public_source_content",
        "source_url",
      ],
    }));
  }
  protected override deploymentIssues(
    o: Operator,
    target: "node" | "cloudflare",
  ) {
    return target === "cloudflare" && o.allow_private
      ? ["Production Cloudflare ACP gateways require public HTTPS"]
      : [];
  }
  protected override validateConfiguration(c: AgentSettings, o: Operator) {
    const profile = o.profiles.find((p) => p.id === c.profile);
    if (!profile) throw new PluginSettingsError("agent_profile_unavailable");
    try {
      authorizedURL(profile, c.start_url);
    } catch {
      throw new PluginSettingsError("agent_url_denied", 403);
    }
  }
  protected async collect(
    context: CollectorContext<AgentSettings>,
    o: Operator,
  ) {
    if (!context.execution)
      throw new CollectorError({
        code: "agent_execution_required",
        retryable: false,
      });
    const deadline = AbortSignal.timeout(
      (context.configuration.timeout_seconds + 8) * 1000,
    );
    const signal = context.signal
      ? AbortSignal.any([context.signal, deadline])
      : deadline;
    const transport = this.transport;
    try {
      const response = await transport(
        new URL("/v1/collect", o.gateway_origin),
        {
          method: "POST",
          redirect: "manual",
          signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${o.access_token}`,
          },
          body: JSON.stringify({
            version: 1,
            execution_id: context.execution.id,
            policy_hash: await policyHash(
              o.profiles.find((p) => p.id === context.configuration.profile)!,
            ),
            configuration: context.configuration,
          }),
        },
      );
      // An ambiguous invocation may have incurred model charges. Replays use the same
      // durable ID, but transport failures are deliberately left for manual review.
      if (!response.ok) {
        await response.body?.cancel();
        throw new CollectorError({
          code: `agent_gateway_http_${response.status}`,
          retryable: false,
          blocked: response.status >= 300 && response.status < 500,
        });
      }
      if (!response.body) throw new Error("empty");
      const reader = response.body.getReader(),
        chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 4 * 1024 * 1024) throw new Error("oversize");
          chunks.push(part.value);
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      const value = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      );
      if (value?.error && /^agent_[a-z_]{1,80}$/.test(value.error))
        throw new CollectorError({
          code: value.error,
          retryable: false,
          blocked: value.error === "agent_policy_mismatch",
        });
      const result = await validateResult(value);
      if (result.items.length > context.configuration.max_items)
        throw new Error("items");
      return result;
    } catch (error) {
      if (error instanceof CollectorError) throw error;
      throw new CollectorError({
        code: signal.aborted
          ? "agent_timeout_or_cancelled"
          : "agent_gateway_invalid_response",
        retryable: false,
      });
    }
  }
}
export const deepSeekHarnessPlugin = new DeepSeekHarnessCollector();
