// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { Problem, invalid } from "../../shared/problem.js";
import { id, hash } from "../../shared/crypto.js";
import { type Briefing } from "../../modules/content/schemas.js";
import { type Filter } from "../../modules/content/filters.js";
import { type Page } from "../../modules/content/repository.js";
import { AccountDatabase } from "./sqlite.js";

export async function listBriefings(
  db: AccountDatabase,
  f: Filter,
  cursor: string | null,
  limit: number,
): Promise<Page> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw invalid();
  const queryHash = await hash(JSON.stringify(f));
  return db.transaction(() => {
    let snapshot = "",
      offset = 0,
      total = 0;
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
      const row = db.first<{ total: number }>(
        "SELECT total FROM snapshots WHERE id=? AND query_hash=? AND expires>?",
        snapshot,
        queryHash,
        Date.now(),
      );
      if (!row) throw new Problem(410, "cursor_expired");
      total = row.total;
    } else {
      db.sql.exec(
        "DELETE FROM snapshots WHERE expires<? OR id IN (SELECT id FROM snapshots ORDER BY created DESC,id DESC LIMIT -1 OFFSET 7)",
        Date.now(),
      );
      const candidates = db.sql.exec<{ document: string }>(
        `SELECT b.document FROM briefings b WHERE NOT hidden AND processing_visible
          AND (?='all' OR (?='unread' AND NOT read) OR (?='saved' AND saved)) AND (?='' OR instr(lower(search_text),lower(?))>0)
          AND (?='[]' OR category_id IN (SELECT value FROM json_each(?)))
          AND (?='[]' OR EXISTS(SELECT 1 FROM json_each(b.document,'$.tag_ids') t JOIN terms term ON term.id=t.value AND term.kind='tag' WHERE t.value IN (SELECT value FROM json_each(?))))
          AND (?='[]' OR EXISTS(SELECT 1 FROM json_each(b.document,'$.subject_ids') t JOIN terms term ON term.id=t.value AND term.kind='subject' WHERE t.value IN (SELECT value FROM json_each(?))))
          AND (? IS NULL OR updated_at>=?) AND (? IS NULL OR updated_at<?) ORDER BY updated_at DESC,id DESC LIMIT 2001`,
        f.view,
        f.view,
        f.view,
        f.q,
        f.q,
        JSON.stringify(f.category_ids),
        JSON.stringify(f.category_ids),
        JSON.stringify(f.tag_ids),
        JSON.stringify(f.tag_ids),
        JSON.stringify(f.subject_ids),
        JSON.stringify(f.subject_ids),
        f.from,
        f.from ? Date.parse(f.from) : null,
        f.to,
        f.to ? Date.parse(f.to) : null,
      );
      const documents: { document: string }[] = [];
      let bytes = 0;
      for (const row of candidates) {
        bytes += Buffer.byteLength(row.document);
        if (documents.length >= 2000 || bytes > 8 * 1024 * 1024)
          throw new Problem(422, "snapshot_capacity");
        documents.push(row);
      }
      total = documents.length;
      snapshot = id("query");
      db.sql.exec(
        "INSERT INTO snapshots(id,query_hash,total,expires,created) VALUES(?,?,?,?,?)",
        snapshot,
        queryHash,
        total,
        Date.now() + 300_000,
        Date.now(),
      );
      documents.forEach((d, index) =>
        db.sql.exec(
          "INSERT INTO snapshot_items(snapshot,ordinal,document) VALUES(?,?,?)",
          snapshot,
          index,
          d.document,
        ),
      );
    }
    if (!Number.isSafeInteger(offset) || offset > total) throw invalid();
    const end = Math.min(total, offset + limit);
    const items = db.sql
      .exec<{ document: string }>(
        `SELECT s.document FROM snapshot_items s JOIN briefings b ON b.id=json_extract(s.document,'$.id')
        WHERE s.snapshot=? AND s.ordinal>=? AND s.ordinal<? AND NOT b.hidden AND b.processing_visible ORDER BY s.ordinal`,
        snapshot,
        offset,
        end,
      )
      .toArray()
      .map((r) => ({
        ...(JSON.parse(r.document) as Briefing),
        markdown: "",
        evidence: [],
      }));
    return {
      items,
      total,
      query_hash: queryHash,
      ...(end < total
        ? {
            next_cursor: Buffer.from(`${snapshot}:${end}`).toString(
              "base64url",
            ),
          }
        : {}),
    };
  });
}
