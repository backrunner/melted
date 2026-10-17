// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { rsshubCollector, CollectorError } from "../collectors/rsshub.js";
import type { RSSHubConfig } from "../collectors/config.js";
import { collectorEnabled } from "../plugins/registry.js";
import type { Claim, PollResult, SourceRepository } from "../sources/types.js";

export async function executeClaim(
  repository: SourceRepository,
  claim: Claim,
  config: RSSHubConfig | undefined,
  signal?: AbortSignal,
) {
  let result: PollResult;
  try {
    if (!config || !collectorEnabled())
      throw new CollectorError({
        code: "collector_unconfigured",
        retryable: false,
        blocked: true,
      });
    result = await rsshubCollector.poll(claim.source, config, signal);
  } catch (error) {
    await repository.fail(
      claim,
      error instanceof CollectorError
        ? error.failure
        : { code: "collector_failed", retryable: true },
    );
    return;
  }
  // Do not turn a storage failure into a successful queue acknowledgement.
  await repository.complete(claim, result);
}
