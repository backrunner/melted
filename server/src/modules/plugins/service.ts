// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { z } from "zod";
import { Problem } from "../../shared/problem.js";
import { parse } from "../../shared/validation.js";
import { hash } from "../../shared/crypto.js";
import { configurationSchema, validateSettings } from "./dsl.js";
import type { PluginRegistry } from "./registry.js";
import type { Source, SourceRepository } from "../sources/types.js";
import { sourceInputSchema, sourcePatchSchema } from "../sources/schemas.js";

export const actionRequestSchema = z
  .object({
    expected_version: z.number().int().positive(),
    plugin_version: z.string().min(1).max(100),
    input: configurationSchema.default({}),
  })
  .strict();
export class PluginService {
  constructor(
    readonly registry: PluginRegistry,
    readonly operator: Record<string, unknown>,
  ) {}
  create(value: unknown) {
    const input = parse(sourceInputSchema, value),
      plugin = this.registry.resolve(input.plugin, this.operator);
    if (input.config_version !== plugin.descriptor.config_version)
      throw new Problem(409, "plugin_config_version_mismatch");
    return {
      ...input,
      configuration: validateSettings(
        plugin.descriptor.form,
        plugin.validate(
          validateSettings(plugin.descriptor.form, input.configuration),
        ),
      ),
    };
  }
  patch(source: Source, value: unknown) {
    const input = parse(sourcePatchSchema, value);
    if (
      input.configuration !== undefined ||
      input.config_version !== undefined ||
      input.enabled === true
    ) {
      const plugin = this.resolve(source);
      if (
        (input.config_version ?? source.config_version) !==
        plugin.descriptor.config_version
      )
        throw new Problem(409, "plugin_config_version_mismatch");
      const configuration = validateSettings(
        plugin.descriptor.form,
        plugin.validate(
          validateSettings(
            plugin.descriptor.form,
            input.configuration ?? source.configuration,
          ),
        ),
      );
      if (input.configuration !== undefined)
        input.configuration = configuration;
    }
    return input;
  }
  resolve(source: Source) {
    const plugin = this.registry.resolve(source.plugin, this.operator);
    if (source.config_version !== plugin.descriptor.config_version)
      throw new Problem(409, "plugin_config_version_mismatch");
    return plugin;
  }
  async action(
    repository: SourceRepository,
    owner: string,
    source: Source,
    actionID: string,
    value: unknown,
    key: string,
  ) {
    const request = parse(actionRequestSchema, value),
      plugin = this.resolve(source);
    if (request.plugin_version !== plugin.descriptor.version)
      throw new Problem(409, "plugin_version_mismatch");
    const action = plugin.descriptor.actions.find((a) => a.id === actionID);
    if (!action) throw new Problem(404, "plugin_action_not_found");
    const actionInput = validateSettings(action.input, request.input);
    plugin.validate(
      validateSettings(plugin.descriptor.form, source.configuration),
    );
    if (action.effect === "validate") {
      if (source.version !== request.expected_version)
        throw new Problem(409, "version_conflict");
      return {
        status: "complete" as const,
        message: "配置有效，尚未发起网络请求",
      };
    }
    const run = await repository.sync(
      owner,
      source.id,
      key,
      request.expected_version,
      `${actionID}:${request.plugin_version}:${await hash(JSON.stringify(actionInput))}`,
    );
    return { status: "accepted" as const, receipt_id: run.id };
  }
}
