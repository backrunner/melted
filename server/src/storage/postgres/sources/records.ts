// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import type { Connection } from "../database.js";
import type { Source, Run } from "../../../modules/sources/types.js";
import { Problem } from "../../../shared/problem.js";
import { cancelled } from "../../../modules/sources/lifecycle.js";

export async function lockOwner(c: Connection, owner: string) {
  if (
    !(await c.query("SELECT id FROM accounts WHERE id=$1 FOR UPDATE", [owner]))
      .rowCount
  )
    throw new Problem(404, "not_found");
}
export async function getSource(
  c: Connection,
  owner: string,
  id: string,
  includeDeleted = false,
): Promise<Source> {
  const s = (
    await c.query<{ document: Source }>(
      "SELECT document FROM sources WHERE owner=$1 AND id=$2",
      [owner, id],
    )
  ).rows[0]?.document;
  if (!s || (s.deleted && !includeDeleted))
    throw new Problem(404, "source_not_found");
  return s;
}
export async function getRun(
  c: Connection,
  owner: string,
  id: string,
): Promise<Run> {
  const r = (
    await c.query<{ document: Run }>(
      "SELECT document FROM source_runs WHERE owner=$1 AND id=$2",
      [owner, id],
    )
  ).rows[0]?.document;
  if (!r) throw new Problem(404, "receipt_not_found");
  return r;
}
export async function saveSource(c: Connection, owner: string, source: Source) {
  await c.query(
    "INSERT INTO sources(owner,id,document,enabled,blocked,deleted,next_poll) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(owner,id) DO UPDATE SET document=excluded.document,enabled=excluded.enabled,blocked=excluded.blocked,deleted=excluded.deleted,next_poll=excluded.next_poll",
    [
      owner,
      source.id,
      source,
      source.enabled,
      source.blocked,
      source.deleted,
      source.next_poll_at,
    ],
  );
}
export async function saveRun(c: Connection, owner: string, run: Run) {
  await c.query(
    "INSERT INTO source_runs(owner,id,source_id,slot,document,state,available,lease_until) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(owner,id) DO UPDATE SET document=excluded.document,state=excluded.state,available=excluded.available,lease_until=excluded.lease_until",
    [
      owner,
      run.id,
      run.source_id,
      run.slot,
      run,
      run.state,
      run.available_at,
      run.lease_until,
    ],
  );
}
export async function cancelRuns(
  c: Connection,
  owner: string,
  source: string,
  now: number,
) {
  const rows = await c.query<{ document: Run }>(
    "SELECT document FROM source_runs WHERE owner=$1 AND source_id=$2 AND state IN ('queued','running')",
    [owner, source],
  );
  for (const { document } of rows.rows)
    await saveRun(c, owner, cancelled(document, now));
}
export async function replay<T>(
  c: Connection,
  owner: string,
  operation: string,
  key: string,
  payload: string,
  now: number,
): Promise<T | undefined> {
  await c.query("DELETE FROM source_requests WHERE owner=$1 AND created<$2", [
    owner,
    now - 7 * 86400_000,
  ]);
  const row = (
    await c.query<{ payload_hash: string; response: T }>(
      "SELECT payload_hash,response FROM source_requests WHERE owner=$1 AND operation=$2 AND key=$3",
      [owner, operation, key],
    )
  ).rows[0];
  if (row && row.payload_hash !== payload)
    throw new Problem(409, "idempotency_conflict");
  return row?.response;
}
export async function remember(
  c: Connection,
  owner: string,
  operation: string,
  key: string,
  payload: string,
  response: unknown,
  now: number,
) {
  await c.query(
    "INSERT INTO source_requests(owner,operation,key,payload_hash,response,created) VALUES($1,$2,$3,$4,$5,$6)",
    [owner, operation, key, payload, response, now],
  );
}
