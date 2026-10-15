import { z } from "zod";
import { Database } from "./database.js";
import { type Config } from "../../config/schema.js";
import { id, random, hash } from "../../shared/crypto.js";
import { parse } from "../../shared/validation.js";
import { unauthorized, Problem } from "../../shared/problem.js";
import type { Session } from "../../modules/identity/types.js";
import { issue } from "./sessions.js";

const keySchema = z.string().regex(/^[A-Za-z0-9_-]{87}$/);
export async function challenge(db: Database, config: Config, body: unknown) {
  const { public_key } = parse(
    z.object({ public_key: keySchema }).strict(),
    body,
  );
  try {
    await crypto.subtle.importKey(
      "raw",
      Buffer.from(public_key, "base64url"),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
  } catch {
    throw new Problem(400, "invalid_public_key");
  }
  const challenge_id = id("challenge");
  const message = `melted-key-v1\n${config.serverID}\n${challenge_id}\n${random()}`;
  await db.query(
    "INSERT INTO auth_challenges(id,public_key,message) VALUES($1,$2,$3)",
    [challenge_id, public_key, message],
  );
  return { challenge_id, message, expires_in: 120 };
}
export async function keySession(
  db: Database,
  config: Config,
  body: unknown,
): Promise<Session> {
  const input = parse(
    z
      .object({
        challenge_id: z.string().max(128),
        signature: z.string().regex(/^[A-Za-z0-9_-]{86}$/),
      })
      .strict(),
    body,
  );
  return db.transaction(async (connection) => {
    // Consumed once. Concurrent submissions cannot create duplicate owners/sessions.
    const result = await connection.query<{
      public_key: string;
      message: string;
    }>(
      "DELETE FROM auth_challenges WHERE id=$1 AND expires_at>now() RETURNING public_key,message",
      [input.challenge_id],
    );
    const challenge = result.rows[0];
    if (!challenge) throw unauthorized();
    const key = await crypto.subtle.importKey(
      "raw",
      Buffer.from(challenge.public_key, "base64url"),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      Buffer.from(input.signature, "base64url"),
      new TextEncoder().encode(challenge.message),
    );
    if (!valid) throw unauthorized();
    const fingerprint = await hash(challenge.public_key);
    // A lock on this fingerprint serializes registration even before an account exists.
    await connection.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
      [fingerprint],
    );
    const existing = await connection.query<{ owner: string }>(
      "SELECT owner FROM credentials WHERE fingerprint=$1",
      [fingerprint],
    );
    let owner = existing.rows[0]?.owner;
    if (!owner) {
      if (config.registration !== "key")
        throw new Problem(403, "registration_closed");
      owner = id("acc");
      await connection.query("INSERT INTO accounts(id) VALUES($1)", [owner]);
      await connection.query(
        "INSERT INTO credentials(fingerprint,owner,public_key) VALUES($1,$2,$3)",
        [fingerprint, owner, challenge.public_key],
      );
    }
    return issue(connection, owner);
  });
}
