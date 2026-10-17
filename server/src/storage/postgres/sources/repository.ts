// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import type {
  Source,
  SourceInput,
  SourcePatch,
  SourceRepository,
  Run,
  RawItem,
  RawItemSummary,
} from "../../../modules/sources/types.js";
import {
  newSource,
  patchSource,
  iso,
} from "../../../modules/sources/lifecycle.js";
import { hash } from "../../../shared/crypto.js";
import { Problem } from "../../../shared/problem.js";
import { pageLimit } from "../../../modules/sources/schemas.js";
import {
  lockOwner,
  getSource,
  getRun,
  saveSource,
  cancelRuns,
  replay,
  remember,
} from "./records.js";
import { PostgresSourceJobs, enqueue } from "./jobs.js";

export class PostgresSources
  extends PostgresSourceJobs
  implements SourceRepository
{
  async list(owner: string): Promise<Source[]> {
    return (
      await this.db.query<{ document: Source }>(
        "SELECT document FROM sources WHERE owner=$1 AND NOT deleted ORDER BY id",
        [owner],
      )
    ).rows.map((r) => r.document);
  }
  get(owner: string, id: string) {
    return getSource(this.db, owner, id);
  }
  async create(
    owner: string,
    input: SourceInput,
    key: string,
  ): Promise<Source> {
    const fingerprint = await hash(JSON.stringify(input));
    return this.db.transaction(async (c) => {
      await lockOwner(c, owner);
      const now = Date.now();
      const existing = await replay<Source>(
        c,
        owner,
        "create",
        key,
        fingerprint,
        now,
      );
      if (existing) return existing;
      const count = (
        await c.query<{ count: string }>(
          "SELECT count(*) FROM sources WHERE owner=$1 AND NOT deleted",
          [owner],
        )
      ).rows[0]!;
      if (Number(count.count) >= 100) throw new Problem(429, "source_limit");
      const source = newSource(input, now);
      await saveSource(c, owner, source);
      await remember(c, owner, "create", key, fingerprint, source, now);
      return source;
    });
  }
  patch(owner: string, id: string, input: SourcePatch): Promise<Source> {
    return this.db.transaction(async (c) => {
      await lockOwner(c, owner);
      const now = Date.now();
      const next = patchSource(await getSource(c, owner, id), input, now);
      await cancelRuns(c, owner, id, now);
      await saveSource(c, owner, next);
      return next;
    });
  }
  async remove(owner: string, id: string, version: number) {
    await this.db.transaction(async (c) => {
      await lockOwner(c, owner);
      const now = Date.now(),
        source = await getSource(c, owner, id);
      if (source.version !== version)
        throw new Problem(409, "version_conflict");
      await saveSource(c, owner, {
        ...source,
        enabled: false,
        deleted: true,
        generation: source.generation + 1,
        version: source.version + 1,
        updated_at: iso(now),
        checkpoint: {},
      });
      await cancelRuns(c, owner, id, now);
      await c.query("DELETE FROM raw_items WHERE owner=$1 AND source_id=$2", [
        owner,
        id,
      ]);
    });
  }
  async sync(
    owner: string,
    id: string,
    key: string,
    expectedVersion?: number,
    action?: string,
  ): Promise<Run> {
    const fingerprint = await hash(
      expectedVersion === undefined
        ? id
        : JSON.stringify({ id, expectedVersion, action }),
    );
    return this.db.transaction(async (c) => {
      await lockOwner(c, owner);
      const now = Date.now();
      const old = await replay<Run>(c, owner, "sync", key, fingerprint, now);
      if (old) return old;
      const source = await getSource(c, owner, id);
      if (expectedVersion !== undefined && source.version !== expectedVersion)
        throw new Problem(409, "version_conflict");
      if (!source.enabled) throw new Problem(409, "source_disabled");
      const run = await enqueue(
        c,
        owner,
        source,
        "manual",
        `manual:${key}:${now}`,
        now,
      );
      await remember(c, owner, "sync", key, fingerprint, run, now);
      return run;
    });
  }
  receipt(owner: string, id: string) {
    return getRun(this.db, owner, id);
  }
  async items(
    owner: string,
    source: string,
    after: string | null,
    limit: number,
  ) {
    pageLimit(limit);
    await this.get(owner, source);
    const rows = (
      await this.db.query<{ document: RawItemSummary }>(
        `SELECT jsonb_build_object(
          'id',id,'source_id',source_id,'external_id',document#>'{content,external_id}',
          'revision',document->'revision','title',document#>'{content,title}',
          'canonical_url',document#>'{content,canonical_url}','published_at',document#>'{content,published_at}',
          'received_at',document->'received_at','updated_at',document->'updated_at',
          'media_count',jsonb_array_length(document#>'{content,media}')) AS document
        FROM raw_items WHERE owner=$1 AND source_id=$2 AND ($3::text IS NULL OR id>$3) ORDER BY id LIMIT $4`,
        [owner, source, after, limit + 1],
      )
    ).rows;
    const items = rows.slice(0, limit).map((r) => r.document);
    return {
      items,
      next_cursor: rows.length > limit ? items.at(-1)!.id : null,
    };
  }
  async raw(owner: string, id: string, revision?: number): Promise<RawItem> {
    const r =
      revision === undefined
        ? await this.db.query<{ document: RawItem }>(
            "SELECT document FROM raw_items WHERE owner=$1 AND id=$2",
            [owner, id],
          )
        : await this.db.query<{ document: RawItem }>(
            "SELECT document FROM raw_item_revisions WHERE owner=$1 AND item_id=$2 AND revision=$3",
            [owner, id, revision],
          );
    if (!r.rows[0]) throw new Problem(404, "raw_item_not_found");
    return r.rows[0].document;
  }
}
