// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import type { Database } from "./database.js";
import type { Change } from "../../modules/sync/repository.js";

export async function listChanges(
  db: Database,
  owner: string,
  after: number,
): Promise<Change[]> {
  const rows = (
    await db.query<{
      sequence: string;
      entity_id: string;
      kind: string;
    }>(
      "SELECT sequence,entity_id,kind FROM changes WHERE owner=$1 AND sequence>$2 ORDER BY sequence LIMIT 101",
      [owner, after],
    )
  ).rows;
  return rows.map((r) => ({ ...r, sequence: Number(r.sequence) }));
}
