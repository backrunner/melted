// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { type Connection } from "./database.js";
import { unauthorized } from "../../shared/problem.js";

export async function lockAccount(c: Connection, owner: string) {
  if (
    !(await c.query("SELECT id FROM accounts WHERE id=$1 FOR UPDATE", [owner]))
      .rowCount
  )
    throw unauthorized();
}
export async function appendChange(
  c: Connection,
  owner: string,
  contentID: string,
  kind: string,
) {
  const row = (
    await c.query<{ change_sequence: string }>(
      "UPDATE accounts SET change_sequence=change_sequence+1 WHERE id=$1 RETURNING change_sequence",
      [owner],
    )
  ).rows[0]!;
  await c.query(
    "INSERT INTO changes(owner,sequence,entity_id,kind) VALUES($1,$2,$3,$4)",
    [owner, row.change_sequence, contentID, kind],
  );
}
