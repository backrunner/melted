// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { z } from "zod";
import { Database, type Connection } from "./database.js";
import { id, random, hash } from "../../shared/crypto.js";
import { parse } from "../../shared/validation.js";
import { unauthorized } from "../../shared/problem.js";
import type { Session, Principal } from "../../modules/identity/types.js";

export async function issue(
  connection: Connection,
  owner: string,
  family?: string,
): Promise<Session> {
  family ??= id("ses");
  await connection.query(
    "INSERT INTO session_families(id,owner,expires_at) VALUES($1,$2,now()+interval '30 days') ON CONFLICT DO NOTHING",
    [family, owner],
  );
  const session = {
    account_id: owner,
    access_token: "access_" + random(),
    refresh_token: "refresh_" + random(),
    expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
  };
  await connection.query(
    "INSERT INTO sessions(refresh_hash,access_hash,family_id,access_expires_at) VALUES($1,$2,$3,$4)",
    [
      await hash(session.refresh_token),
      await hash(session.access_token),
      family,
      session.expires_at,
    ],
  );
  return session;
}
export async function authenticate(
  db: Database,
  token?: string,
): Promise<Principal> {
  if (!token?.startsWith("Bearer ") || token.length > 512) throw unauthorized();
  const result = await db.query<Principal>(
    `SELECT f.owner,f.id AS family FROM sessions s JOIN session_families f ON f.id=s.family_id
    WHERE s.access_hash=$1 AND NOT s.used AND NOT f.revoked AND s.access_expires_at>now() AND f.expires_at>now()`,
    [await hash(token.slice(7))],
  );
  if (!result.rows[0]) throw unauthorized();
  return result.rows[0];
}
export async function refresh(db: Database, body: unknown): Promise<Session> {
  const { refresh_token } = parse(
    z.object({ refresh_token: z.string().min(1).max(512) }).strict(),
    body,
  );
  const session = await db.transaction(async (connection) => {
    const result = await connection.query<{
      owner: string;
      id: string;
      used: boolean;
      revoked: boolean;
      expired: boolean;
    }>(
      `SELECT f.owner,f.id,s.used,f.revoked,f.expires_at<now() AS expired FROM sessions s
      JOIN session_families f ON f.id=s.family_id WHERE s.refresh_hash=$1 FOR UPDATE OF f,s`,
      [await hash(refresh_token)],
    );
    const row = result.rows[0];
    if (!row || row.revoked || row.expired) return null;
    if (row.used) {
      await connection.query(
        "UPDATE session_families SET revoked=true WHERE id=$1",
        [row.id],
      );
      return null;
    }
    await connection.query(
      "UPDATE sessions SET used=true WHERE refresh_hash=$1",
      [await hash(refresh_token)],
    );
    return issue(connection, row.owner, row.id);
  });
  // Replay revocation must commit before reporting an error.
  if (!session) throw unauthorized();
  return session;
}
