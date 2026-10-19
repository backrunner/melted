// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import type {
  ProcessingRepository,
  ProcessingStatus,
  ProcessingClaim,
  ProcessingResult,
  Stage,
  Job,
} from "../../../modules/processing/types.js";
import { call } from "../rpc.js";
export class CloudProcessing implements ProcessingRepository {
  constructor(private namespace: DurableObjectNamespace) {}
  private request<T>(owner: string, operation: string, payload: unknown = {}) {
    return call<T>(this.namespace, owner, "processing." + operation, payload);
  }
  invalidate(owner: string, fingerprint: string) {
    return this.request<void>(owner, "invalidate", { fingerprint });
  }
  status(owner: string) {
    return this.request<ProcessingStatus>(owner, "status");
  }
  action(
    owner: string,
    version: number,
    action: "compile" | "activate" | "reprocess",
    fingerprint: string,
    key: string,
  ) {
    return this.request<ProcessingStatus>(owner, "action", {
      version,
      action,
      fingerprint,
      key,
    });
  }
  schedule(owner: string) {
    return this.request<void>(owner, "schedule");
  }
  claim(
    owner: string,
    id: string,
    fingerprint: string,
    dailyLimit: number,
    now?: number,
  ) {
    return this.request<ProcessingClaim | null>(owner, "claim", {
      id,
      fingerprint,
      dailyLimit,
      ...(now === undefined ? {} : { now }),
    });
  }
  current(claim: ProcessingClaim) {
    return this.request<boolean>(claim.owner, "current", { claim });
  }
  checkpoint(claim: ProcessingClaim, stage: string, value: Stage) {
    return this.request<boolean>(claim.owner, "checkpoint", {
      claim,
      stage,
      value,
    });
  }
  complete(claim: ProcessingClaim, result: ProcessingResult) {
    return this.request<boolean>(claim.owner, "complete", { claim, result });
  }
  fail(claim: ProcessingClaim, code: string, retryable: boolean) {
    return this.request<void>(claim.owner, "fail", { claim, code, retryable });
  }
  jobs(owner: string) {
    return this.request<Job[]>(owner, "jobs");
  }
}
