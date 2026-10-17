// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import type {
  Source,
  SourceInput,
  SourcePatch,
  Run,
  RawItem,
  RawItemSummary,
} from "../../../modules/sources/types.js";
import {
  newSource,
  patchSource,
  iso,
} from "../../../modules/sources/lifecycle.js";
import { Problem } from "../../../shared/problem.js";
import { pageLimit } from "../../../modules/sources/schemas.js";
import { AccountSourceJobs } from "./jobs.js";

export class AccountSources extends AccountSourceJobs {
  list(): Source[] {
    return this.db.sql
      .exec<{ document: string }>(
        "SELECT document FROM sources WHERE deleted=0 ORDER BY id",
      )
      .toArray()
      .map((r) => JSON.parse(r.document) as Source);
  }
  create(input: SourceInput, key: string, fingerprint: string): Source {
    return this.db.transaction(() => {
      const now = Date.now(),
        old = this.replay<Source>("create", key, fingerprint, now);
      if (old) return old;
      if (
        this.db.first<{ count: number }>(
          "SELECT count(*) AS count FROM sources WHERE deleted=0",
        )!.count >= 100
      )
        throw new Problem(429, "source_limit");
      const source = newSource(input, now);
      this.saveSource(source);
      this.remember("create", key, fingerprint, source, now);
      return source;
    });
  }
  patch(id: string, input: SourcePatch): Source {
    return this.db.transaction(() => {
      const now = Date.now(),
        next = patchSource(this.source(id), input, now);
      this.cancel(id, now);
      this.saveSource(next);
      return next;
    });
  }
  remove(id: string, version: number) {
    this.db.transaction(() => {
      const now = Date.now(),
        source = this.source(id);
      if (source.version !== version)
        throw new Problem(409, "version_conflict");
      this.saveSource({
        ...source,
        enabled: false,
        deleted: true,
        generation: source.generation + 1,
        version: source.version + 1,
        updated_at: iso(now),
        checkpoint: {},
      });
      this.cancel(id, now);
      this.db.sql.exec(
        "DELETE FROM raw_item_revisions WHERE item_id IN (SELECT id FROM raw_items WHERE source_id=?)",
        id,
      );
      this.db.sql.exec("DELETE FROM raw_items WHERE source_id=?", id);
    });
  }
  sync(
    id: string,
    key: string,
    fingerprint: string,
    expectedVersion?: number,
  ): Run {
    return this.db.transaction(() => {
      const now = Date.now(),
        old = this.replay<Run>("sync", key, fingerprint, now);
      if (old) return old;
      const source = this.source(id);
      if (expectedVersion !== undefined && source.version !== expectedVersion)
        throw new Problem(409, "version_conflict");
      if (!source.enabled) throw new Problem(409, "source_disabled");
      const run = this.enqueue(source, "manual", `manual:${key}:${now}`, now);
      this.remember("sync", key, fingerprint, run, now);
      return run;
    });
  }
  items(source: string, after: string | null, limit: number) {
    pageLimit(limit);
    this.source(source);
    const rows = this.db.sql
      .exec<{ document: string }>(
        `SELECT json_object(
          'id',id,'source_id',source_id,'external_id',json_extract(document,'$.content.external_id'),
          'revision',json_extract(document,'$.revision'),'title',json_extract(document,'$.content.title'),
          'canonical_url',json_extract(document,'$.content.canonical_url'),'published_at',json_extract(document,'$.content.published_at'),
          'received_at',json_extract(document,'$.received_at'),'updated_at',json_extract(document,'$.updated_at'),
          'media_count',json_array_length(document,'$.content.media')) AS document
        FROM raw_items WHERE source_id=? AND (? IS NULL OR id>?) ORDER BY id LIMIT ?`,
        source,
        after,
        after,
        limit + 1,
      )
      .toArray();
    const items = rows
      .slice(0, limit)
      .map((r) => JSON.parse(r.document) as RawItemSummary);
    return {
      items,
      next_cursor: rows.length > limit ? items.at(-1)!.id : null,
    };
  }
  raw(id: string, revision?: number): RawItem {
    const row =
      revision === undefined
        ? this.db.first<{ document: string }>(
            "SELECT document FROM raw_items WHERE id=?",
            id,
          )
        : this.db.first<{ document: string }>(
            "SELECT document FROM raw_item_revisions WHERE item_id=? AND revision=?",
            id,
            revision,
          );
    if (!row) throw new Problem(404, "raw_item_not_found");
    return JSON.parse(row.document) as RawItem;
  }
}
