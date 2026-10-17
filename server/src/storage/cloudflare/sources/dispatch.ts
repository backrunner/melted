// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { Problem } from "../../../shared/problem.js";
import type {
  SourceInput,
  SourcePatch,
  Claim,
  PollResult,
  PollFailure,
} from "../../../modules/sources/types.js";
import type { AccountSources } from "./repository.js";

export function dispatchSources(
  s: AccountSources,
  owner: string,
  op: string,
  p: Record<string, unknown>,
): unknown {
  switch (op) {
    case "sources.list":
      return s.list();
    case "sources.get":
      return s.source(p.id as string);
    case "sources.create":
      return s.create(
        p.input as SourceInput,
        p.key as string,
        p.fingerprint as string,
      );
    case "sources.patch":
      return s.patch(p.id as string, p.input as SourcePatch);
    case "sources.remove":
      return s.remove(p.id as string, p.version as number);
    case "sources.sync":
      return s.sync(
        p.id as string,
        p.key as string,
        p.fingerprint as string,
        p.expectedVersion as number | undefined,
      );
    case "sources.receipt":
      return s.run(p.id as string);
    case "sources.items":
      return s.items(
        p.source as string,
        p.after as string | null,
        p.limit as number,
      );
    case "sources.raw":
      return s.raw(p.id as string, p.revision as number | undefined);
    case "sources.claim":
      return s.claim(owner, p.run as string, p.now as number | undefined);
    case "sources.complete":
      return s.complete(
        p.claim as Claim,
        p.result as PollResult,
        p.now as number | undefined,
      );
    case "sources.fail":
      return s.fail(
        p.claim as Claim,
        p.failure as PollFailure,
        p.now as number | undefined,
      );
    default:
      throw new Problem(404, "not_found");
  }
}
