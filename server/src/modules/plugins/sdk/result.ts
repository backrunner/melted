// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { validateResult } from "../../ingest/result.js";
import type { RawContent, PollResult } from "../../sources/types.js";

/** Build canonical hashes/counts from content; host validates again before commit. */
export function collectionResult(input: {
  items: RawContent[];
  checkpoint?: PollResult["checkpoint"];
  warnings?: PollResult["warnings"];
  notModified?: boolean;
}): Promise<PollResult> {
  const warnings = input.warnings ?? [];
  return validateResult({
    items: input.items.map((content) => ({
      content,
      external_key: "",
      content_hash: "",
    })),
    checkpoint: input.checkpoint ?? {},
    received: input.items.length + warnings.length,
    warnings,
    not_modified: input.notModified ?? false,
  });
}
