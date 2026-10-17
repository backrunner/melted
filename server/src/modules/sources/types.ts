// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
export type Checkpoint = {
  target?: string;
  etag?: string;
  last_modified?: string;
};
export type Source = {
  id: string;
  plugin: "rsshub";
  name: string;
  route: string;
  interval_seconds: number;
  enabled: boolean;
  version: number;
  generation: number;
  checkpoint: Checkpoint;
  created_at: string;
  updated_at: string;
  next_poll_at: number;
  last_success_at: string | null;
  last_run_id: string | null;
  last_error: string | null;
  blocked: boolean;
  deleted: boolean;
};
export type SourceInput = Pick<
  Source,
  "name" | "route" | "interval_seconds" | "enabled"
>;
export type SourcePatch = Partial<SourceInput> & { expected_version: number };
export type Counts = {
  received: number;
  inserted: number;
  updated: number;
  duplicates: number;
  invalid: number;
};
export type Run = {
  id: string;
  source_id: string;
  generation: number;
  trigger: "manual" | "scheduled";
  slot: string;
  state: "queued" | "running" | "complete" | "partial" | "failed" | "cancelled";
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  available_at: number;
  lease_until: number;
  fence: number;
  attempts: number;
  counts: Counts;
  warnings: { index: number; code: string }[];
  error: { code: string; retryable: boolean } | null;
};
export type Claim = { owner: string; source: Source; run: Run };
export type RawContent = {
  external_id: string;
  title: string | null;
  parts: { kind: "html" | "text"; mime_type: string; text: string }[];
  canonical_url: string | null;
  authors: { name?: string; url?: string; avatar?: string }[];
  language: string | null;
  published_at: string | null;
  modified_at: string | null;
  tags: string[];
  media: {
    url: string;
    mime_type?: string;
    title?: string;
    size_in_bytes?: number;
    duration_in_seconds?: number;
  }[];
};
export type PreparedItem = {
  external_key: string;
  content: RawContent;
  content_hash: string;
};
export type RawItem = PreparedItem & {
  id: string;
  source_id: string;
  revision: number;
  received_at: string;
  updated_at: string;
};
export type RawItemSummary = Pick<
  RawItem,
  "id" | "source_id" | "revision" | "received_at" | "updated_at"
> &
  Pick<
    RawContent,
    "external_id" | "title" | "canonical_url" | "published_at"
  > & { media_count: number };
export type PollResult = {
  items: PreparedItem[];
  checkpoint: Checkpoint;
  received: number;
  warnings: Run["warnings"];
  not_modified: boolean;
};
export type PollFailure = {
  code: string;
  retryable: boolean;
  retry_after_ms?: number;
  blocked?: boolean;
};
export interface SourceRepository {
  list(owner: string): Promise<Source[]>;
  get(owner: string, id: string): Promise<Source>;
  create(owner: string, input: SourceInput, key: string): Promise<Source>;
  patch(owner: string, id: string, input: SourcePatch): Promise<Source>;
  remove(owner: string, id: string, version: number): Promise<void>;
  sync(owner: string, id: string, key: string): Promise<Run>;
  receipt(owner: string, id: string): Promise<Run>;
  items(
    owner: string,
    source: string,
    after: string | null,
    limit: number,
  ): Promise<{ items: RawItemSummary[]; next_cursor: string | null }>;
  raw(owner: string, id: string, revision?: number): Promise<RawItem>;
  claim(owner: string, run: string, now?: number): Promise<Claim | null>;
  complete(claim: Claim, result: PollResult, now?: number): Promise<boolean>;
  fail(claim: Claim, failure: PollFailure, now?: number): Promise<boolean>;
}
