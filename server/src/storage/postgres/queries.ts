import { briefingProjection } from "./content.js";
import { Database } from "./database.js";
import { hash, id } from "../../shared/crypto.js";
import { invalid, Problem } from "../../shared/problem.js";
import type { Briefing } from "../../modules/content/schemas.js";
import type { Filter } from "../../modules/content/filters.js";
import type { Page } from "../../modules/content/repository.js";
import { lockAccount } from "./account.js";

export async function listBriefings(
  db: Database,
  owner: string,
  f: Filter,
  cursor: string | null,
  limit: number,
): Promise<Page> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw invalid();
  const queryHash = await hash(JSON.stringify(f));
  let snapshot = "",
    offset = 0,
    documents: Briefing[];
  if (cursor) {
    const parts = Buffer.from(cursor, "base64url").toString().split(":");
    if (
      parts.length !== 2 ||
      !/^query_[a-f0-9]{32}$/.test(parts[0]!) ||
      !/^\d+$/.test(parts[1]!)
    )
      throw invalid();
    snapshot = parts[0]!;
    offset = Number(parts[1]);
    const row = (
      await db.query<{ documents: Briefing[] }>(
        "SELECT documents FROM query_snapshots WHERE id=$1 AND owner=$2 AND query_hash=$3 AND expires_at>now()",
        [snapshot, owner, queryHash],
      )
    ).rows[0];
    if (!row) throw new Problem(410, "cursor_expired");
    documents = row.documents;
  } else {
    documents = await db.transaction(async (c) => {
      await lockAccount(c, owner);
      await c.query(
        "DELETE FROM query_snapshots WHERE owner=$1 AND (expires_at<now() OR id IN (SELECT id FROM query_snapshots WHERE owner=$1 ORDER BY created_at DESC OFFSET 7))",
        [owner],
      );
      const selection = ` FROM briefings b WHERE b.owner=$1 AND NOT b.hidden
          AND ($2='all' OR ($2='unread' AND NOT b.read) OR ($2='saved' AND b.saved)) AND ($3='' OR strpos(lower(b.search_text),lower($3))>0)
          AND (cardinality($4::text[])=0 OR b.category_id=ANY($4))
          AND (cardinality($5::text[])=0 OR EXISTS(SELECT 1 FROM briefing_terms t JOIN terms term ON term.owner=t.owner AND term.id=t.term_id WHERE t.owner=b.owner AND t.briefing_id=b.id AND term.kind='tag' AND t.term_id=ANY($5)))
          AND (cardinality($6::text[])=0 OR EXISTS(SELECT 1 FROM briefing_terms t JOIN terms term ON term.owner=t.owner AND term.id=t.term_id WHERE t.owner=b.owner AND t.briefing_id=b.id AND term.kind='subject' AND t.term_id=ANY($6)))
          AND ($7::timestamptz IS NULL OR b.updated_at >= $7) AND ($8::timestamptz IS NULL OR b.updated_at < $8)
          ORDER BY b.updated_at DESC,b.id DESC LIMIT 2001`;
      const parameters = [
        owner,
        f.view,
        f.q,
        f.category_ids,
        f.tag_ids,
        f.subject_ids,
        f.from,
        f.to,
      ];
      const capacity = (
        await c.query<{ count: string; bytes: string }>(
          `SELECT count(*) AS count,coalesce(sum(octet_length(document::text)),0) AS bytes FROM (SELECT b.document ${selection}) candidate`,
          parameters,
        )
      ).rows[0]!;
      if (
        Number(capacity.count) > 2000 ||
        Number(capacity.bytes) > 8 * 1024 * 1024
      )
        throw new Problem(422, "snapshot_capacity");
      const rows = await c.query<{ document: Briefing }>(
        `SELECT ${briefingProjection} ${selection}`,
        parameters,
      );
      const docs = rows.rows.map((r) => r.document);
      const encoded = JSON.stringify(docs);
      if (docs.length > 2000 || Buffer.byteLength(encoded) > 8 * 1024 * 1024)
        throw new Problem(422, "snapshot_capacity");
      snapshot = id("query");
      await c.query(
        "INSERT INTO query_snapshots(id,owner,query_hash,documents) VALUES($1,$2,$3,$4)",
        [snapshot, owner, queryHash, encoded],
      );
      return docs;
    });
  }
  if (!Number.isSafeInteger(offset) || offset > documents.length)
    throw invalid();
  const end = Math.min(offset + limit, documents.length);
  const slice = documents.slice(offset, end);
  const visible = new Set(
    (
      await db.query<{ id: string }>(
        "SELECT id FROM briefings WHERE owner=$1 AND id=ANY($2::text[]) AND NOT hidden",
        [owner, slice.map((d) => d.id)],
      )
    ).rows.map((r) => r.id),
  );
  return {
    items: slice
      .filter((d) => visible.has(d.id))
      .map((d) => ({ ...d, markdown: "", evidence: [] })),
    total: documents.length,
    query_hash: queryHash,
    ...(end < documents.length
      ? {
          next_cursor: Buffer.from(`${snapshot}:${end}`).toString("base64url"),
        }
      : {}),
  };
}
