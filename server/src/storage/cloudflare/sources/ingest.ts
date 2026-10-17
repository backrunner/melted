// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import type { AccountDatabase } from "../sqlite.js";
import type {
  Counts,
  PollResult,
  RawItem,
} from "../../../modules/sources/types.js";
import { id } from "../../../shared/crypto.js";
import { iso, emptyCounts } from "../../../modules/sources/lifecycle.js";

export function ingest(
  db: AccountDatabase,
  source: string,
  result: PollResult,
  now: number,
): Counts {
  const counts = {
    ...emptyCounts(),
    received: result.received,
    invalid: result.warnings.length,
  };
  for (const item of result.items) {
    const row = db.first<{ document: string }>(
      "SELECT document FROM raw_items WHERE source_id=? AND external_key=?",
      source,
      item.external_key,
    );
    const previous = row ? (JSON.parse(row.document) as RawItem) : undefined;
    if (previous?.content_hash === item.content_hash) {
      counts.duplicates++;
      continue;
    }
    const record: RawItem = {
      ...item,
      id: previous?.id ?? id("raw"),
      source_id: source,
      revision: (previous?.revision ?? 0) + 1,
      received_at: previous?.received_at ?? iso(now),
      updated_at: iso(now),
    };
    db.sql.exec(
      "INSERT INTO raw_items(id,source_id,external_key,document) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document",
      record.id,
      source,
      item.external_key,
      JSON.stringify(record),
    );
    db.sql.exec(
      "INSERT INTO raw_item_revisions(item_id,revision,document) VALUES(?,?,?)",
      record.id,
      record.revision,
      JSON.stringify(record),
    );
    if (previous) counts.updated++;
    else counts.inserted++;
  }
  return counts;
}
