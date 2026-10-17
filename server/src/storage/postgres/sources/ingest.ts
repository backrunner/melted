// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import type { Connection } from "../database.js";
import type {
  Counts,
  PollResult,
  RawItem,
} from "../../../modules/sources/types.js";
import { id } from "../../../shared/crypto.js";
import { iso, emptyCounts } from "../../../modules/sources/lifecycle.js";

export async function ingest(
  c: Connection,
  owner: string,
  source: string,
  result: PollResult,
  now: number,
): Promise<Counts> {
  const counts = {
    ...emptyCounts(),
    received: result.received,
    invalid: result.warnings.length,
  };
  for (const item of result.items) {
    const previous = (
      await c.query<{ document: RawItem }>(
        "SELECT document FROM raw_items WHERE owner=$1 AND source_id=$2 AND external_key=$3",
        [owner, source, item.external_key],
      )
    ).rows[0]?.document;
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
    await c.query(
      "INSERT INTO raw_items(owner,id,source_id,external_key,document) VALUES($1,$2,$3,$4,$5) ON CONFLICT(owner,id) DO UPDATE SET document=excluded.document",
      [owner, record.id, source, record.external_key, record],
    );
    await c.query(
      "INSERT INTO raw_item_revisions(owner,item_id,revision,document) VALUES($1,$2,$3,$4)",
      [owner, record.id, record.revision, record],
    );
    if (previous) counts.updated++;
    else counts.inserted++;
  }
  return counts;
}
