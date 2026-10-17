// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { z } from "zod";
import {
  presetPageSchema,
  presetResolutionSchema,
  type PresetProvider,
} from "../presets.js";
import { Problem } from "../../../shared/problem.js";
import { manifestSchema, type Manifest } from "../compatibility.js";
import {
  descriptorSchema,
  validateSettings,
  type Configuration,
  type PluginDescriptor,
} from "../dsl.js";
import {
  CollectorError,
  type CollectorPlugin,
  type ConfiguredCollector,
  type Destination,
} from "../definition.js";
import type { Checkpoint, PollResult } from "../../sources/types.js";

export type CollectorContext<Settings> = {
  readonly configuration: Readonly<Settings>;
  readonly checkpoint: Readonly<Checkpoint>;
  readonly signal?: AbortSignal;
  /** Opaque, stable per durable receipt; retries/fencing reclaims share this ID. */
  readonly execution?: Readonly<{ id: string }>;
};
export type CollectorDefinition<Operator, Settings extends Configuration> = {
  descriptor: z.input<typeof descriptorSchema>;
  operatorSchema: z.ZodType<Operator>;
  configurationSchema: z.ZodType<Settings>;
  targets: Manifest["targets"];
  capabilities: Manifest["capabilities"];
  requiredBindings?: string[];
};
export class PluginSettingsError extends Problem {
  constructor(code: string, status: 400 | 403 = 400) {
    super(status, code);
  }
}

/** Template-method lifecycle for trusted, compiled collectors on Node and Workers. */
export abstract class BaseCollectorPlugin<
  Operator,
  Settings extends Configuration,
> implements CollectorPlugin {
  readonly descriptor: PluginDescriptor;
  readonly manifest: Manifest;
  protected constructor(
    private readonly definition: CollectorDefinition<Operator, Settings>,
  ) {
    this.descriptor = descriptorSchema.parse(definition.descriptor);
    this.manifest = manifestSchema.parse({
      id: this.descriptor.id,
      version: this.descriptor.version,
      runtime: "builtin",
      targets: definition.targets,
      capabilities: definition.capabilities,
      required_bindings: definition.requiredBindings ?? [],
    });
  }
  protected describe(_operator: Operator): PluginDescriptor {
    return this.descriptor;
  }
  protected presets(_operator: Operator): PresetProvider | undefined {
    return undefined;
  }
  protected abstract destinations(operator: Operator): Destination[];
  protected validateConfiguration(
    _settings: Settings,
    _operator: Operator,
  ): void {}
  protected deploymentIssues(
    _operator: Operator,
    _target: "node" | "cloudflare",
  ): string[] {
    return [];
  }
  protected abstract collect(
    context: CollectorContext<Settings>,
    operator: Operator,
  ): Promise<PollResult>;

  deploymentErrors(value: unknown, target: "node" | "cloudflare"): string[] {
    return this.deploymentIssues(
      this.definition.operatorSchema.parse(value),
      target,
    );
  }
  configure(value: unknown): ConfiguredCollector {
    const operator = this.definition.operatorSchema.parse(value);
    const descriptor = descriptorSchema.parse(this.describe(operator));
    if (
      descriptor.id !== this.descriptor.id ||
      descriptor.version !== this.descriptor.version ||
      descriptor.config_version !== this.descriptor.config_version
    )
      throw new Error("Configured collector identity changed");
    const validate = (value: Configuration): Settings => {
      const result = this.definition.configurationSchema.safeParse(
        validateSettings(descriptor.form, value),
      );
      if (!result.success) throw new Problem(400, "invalid_plugin_settings");
      this.validateConfiguration(result.data, operator);
      validateSettings(descriptor.form, result.data);
      return result.data;
    };
    const provider = this.presets(operator);
    if (Boolean(provider) !== Boolean(descriptor.collection.preset_catalog))
      throw new Error(
        "Preset catalog implementation does not match descriptor",
      );
    return {
      descriptor,
      ...(provider
        ? {
            presets: {
              list: async (query) =>
                presetPageSchema.parse(await provider.list(query)),
              resolve: async (id, input) => {
                const result = presetResolutionSchema.parse(
                  await provider.resolve(id, input),
                );
                return {
                  ...result,
                  configuration: validate(result.configuration),
                };
              },
            } satisfies PresetProvider,
          }
        : {}),
      destinations: this.destinations(operator),
      validate,
      poll: async (source, signal, execution) => {
        if (
          source.plugin !== descriptor.id ||
          source.config_version !== descriptor.config_version
        )
          throw new CollectorError({
            code: "plugin_config_version_mismatch",
            retryable: false,
            blocked: true,
          });
        const checkCancellation = () => {
          if (signal?.aborted)
            throw new CollectorError({
              code: "collector_cancelled",
              retryable: true,
            });
        };
        checkCancellation();
        const result = await this.collect(
          {
            configuration: Object.freeze(validate(source.configuration)),
            checkpoint: Object.freeze({ ...source.checkpoint }),
            signal,
            execution: execution && Object.freeze({ ...execution }),
          },
          operator,
        );
        checkCancellation();
        return result;
      },
    };
  }
}
