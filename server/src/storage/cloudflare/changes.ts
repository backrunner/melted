// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import type { AccountDatabase } from "./sqlite.js";

export function appendChange(
  db: AccountDatabase,
  contentID: string,
  kind: string,
) {
  const sequence = Number(db.meta("sequence") ?? 0) + 1;
  db.setMeta("sequence", String(sequence));
  db.sql.exec(
    "INSERT INTO changes(sequence,entity_id,kind) VALUES(?,?,?)",
    sequence,
    contentID,
    kind,
  );
}
export function listChanges(db: AccountDatabase, after: number) {
  return db.sql
    .exec(
      "SELECT sequence,entity_id,kind FROM changes WHERE sequence>? ORDER BY sequence LIMIT 101",
      after,
    )
    .toArray();
}
