// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { CollectorError } from "../plugins/definition.js";
import type { PluginRegistry } from "../plugins/registry.js";
import { Problem } from "../../shared/problem.js";
import { validateResult } from "../ingest/result.js";
import { hash } from "../../shared/crypto.js";
import type { Claim, PollResult, SourceRepository } from "../sources/types.js";

export async function executeClaim(
  repository: SourceRepository,
  claim: Claim,
  registry: PluginRegistry,
  configuration: Record<string, unknown>,
  signal?: AbortSignal,
) {
  let result: PollResult;
  try {
    const plugin = registry.resolve(claim.source.plugin, configuration);
    if (plugin.descriptor.config_version !== claim.source.config_version)
      throw new Problem(409, "plugin_config_version_mismatch");
    plugin.validate(claim.source.configuration);
    result = await validateResult(
      await plugin.poll(claim.source, signal, {
        id: await hash(
          JSON.stringify([claim.owner, claim.run.id, claim.run.generation]),
        ),
      }),
    );
  } catch (error) {
    await repository.fail(
      claim,
      error instanceof CollectorError
        ? error.failure
        : error instanceof Problem
          ? { code: error.code, retryable: false, blocked: true }
          : { code: "collector_failed", retryable: true },
    );
    return;
  }
  // Do not turn a storage failure into a successful queue acknowledgement.
  await repository.complete(claim, result);
}
