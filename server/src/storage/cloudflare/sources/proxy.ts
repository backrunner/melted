// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import type {
  SourceRepository,
  Source,
  SourceInput,
  SourcePatch,
  Run,
  RawItem,
  RawItemSummary,
  Claim,
  PollResult,
  PollFailure,
} from "../../../modules/sources/types.js";
import { hash } from "../../../shared/crypto.js";
import { call } from "../rpc.js";

export class CloudSources implements SourceRepository {
  constructor(private namespace: DurableObjectNamespace) {}
  private invoke<T>(owner: string, op: string, payload: unknown = {}) {
    return call<T>(this.namespace, owner, "sources." + op, payload);
  }
  list(owner: string) {
    return this.invoke<Source[]>(owner, "list");
  }
  get(owner: string, id: string) {
    return this.invoke<Source>(owner, "get", { id });
  }
  async create(
    owner: string,
    input: SourceInput,
    key: string,
    fingerprint?: string,
  ) {
    return this.invoke<Source>(owner, "create", {
      input,
      key,
      fingerprint: fingerprint ?? (await hash(JSON.stringify(input))),
    });
  }
  patch(owner: string, id: string, input: SourcePatch) {
    return this.invoke<Source>(owner, "patch", { id, input });
  }
  async remove(owner: string, id: string, version: number) {
    await this.invoke(owner, "remove", { id, version });
  }
  async sync(
    owner: string,
    id: string,
    key: string,
    expectedVersion?: number,
    action?: string,
  ) {
    return this.invoke<Run>(owner, "sync", {
      id,
      key,
      fingerprint: await hash(
        expectedVersion === undefined
          ? id
          : JSON.stringify({ id, expectedVersion, action }),
      ),
      expectedVersion,
    });
  }
  receipt(owner: string, id: string) {
    return this.invoke<Run>(owner, "receipt", { id });
  }
  items(owner: string, source: string, after: string | null, limit: number) {
    return this.invoke<{ items: RawItemSummary[]; next_cursor: string | null }>(
      owner,
      "items",
      { source, after, limit },
    );
  }
  raw(owner: string, id: string, revision?: number) {
    return this.invoke<RawItem>(owner, "raw", { id, revision });
  }
  claim(owner: string, run: string, now?: number) {
    return this.invoke<Claim | null>(owner, "claim", { run, now });
  }
  complete(claim: Claim, result: PollResult, now?: number) {
    return this.invoke<boolean>(claim.owner, "complete", {
      claim,
      result,
      now,
    });
  }
  fail(claim: Claim, failure: PollFailure, now?: number) {
    return this.invoke<boolean>(claim.owner, "fail", { claim, failure, now });
  }
}
