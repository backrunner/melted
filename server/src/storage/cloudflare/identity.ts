// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { Problem, invalid, unauthorized } from "../../shared/problem.js";
import { id, random, hash } from "../../shared/crypto.js";
import { type Session } from "../../modules/identity/types.js";
import { AccountDatabase } from "./sqlite.js";

type PreparedSession = {
  session: Session;
  family: string;
  accessHash: string;
  refreshHash: string;
};
type SessionRow = {
  family: string;
  used: number;
  revoked: number;
  access_expires: number;
  family_expires: number;
};
export class AccountIdentity {
  constructor(private db: AccountDatabase) {}
  private async prepareSession(
    owner: string,
    family = id("ses"),
  ): Promise<PreparedSession> {
    const session = {
      account_id: owner,
      access_token: `access.${owner}.${random()}`,
      refresh_token: `refresh.${owner}.${random()}`,
      expires_at: new Date(Date.now() + 900_000).toISOString(),
    };
    return {
      session,
      family,
      accessHash: await hash(session.access_token),
      refreshHash: await hash(session.refresh_token),
    };
  }
  private storeSession(p: PreparedSession) {
    this.db.sql.exec(
      "INSERT INTO families(id,expires) VALUES(?,?) ON CONFLICT DO NOTHING",
      p.family,
      Date.now() + 30 * 86400_000,
    );
    this.db.sql.exec(
      "INSERT INTO sessions(refresh_hash,access_hash,family,access_expires) VALUES(?,?,?,?)",
      p.refreshHash,
      p.accessHash,
      p.family,
      Date.parse(p.session.expires_at),
    );
    return p.session;
  }
  async challenge(owner: string, p: Record<string, unknown>) {
    const publicKey = p.public_key as string;
    try {
      await crypto.subtle.importKey(
        "raw",
        Buffer.from(publicKey, "base64url"),
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["verify"],
      );
    } catch {
      throw invalid();
    }
    const challenge_id = `${owner}.${crypto.randomUUID().replaceAll("-", "")}`;
    const message = `melted-key-v1\n${p.serverID}\n${challenge_id}\n${random()}`;
    this.db.sql.exec("DELETE FROM challenges WHERE expires<?", Date.now());
    if (
      this.db.first<{ count: number }>(
        "SELECT count(*) AS count FROM challenges",
      )!.count >= 10
    )
      throw new Problem(429, "rate_limited");
    this.db.sql.exec(
      "INSERT INTO challenges(id,public_key,message,expires) VALUES(?,?,?,?)",
      challenge_id,
      publicKey,
      message,
      Date.now() + 120_000,
    );
    return { challenge_id, message, expires_in: 120 };
  }
  async keySession(owner: string, p: Record<string, unknown>) {
    const challenge = this.db.first<{
      id: string;
      public_key: string;
      message: string;
      expires: number;
    }>("SELECT * FROM challenges WHERE id=?", p.challenge_id as string);
    if (!challenge || challenge.expires < Date.now()) throw unauthorized();
    const key = await crypto.subtle.importKey(
      "raw",
      Buffer.from(challenge.public_key, "base64url"),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    if (
      !(await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        key,
        Buffer.from(p.signature as string, "base64url"),
        new TextEncoder().encode(challenge.message),
      ))
    )
      throw unauthorized();
    const prepared = await this.prepareSession(owner);
    return this.db.transaction(() => {
      if (
        !this.db.first(
          "DELETE FROM challenges WHERE id=? AND expires>? RETURNING id",
          challenge.id,
          Date.now(),
        )
      )
        throw unauthorized();
      if (!this.db.meta("registered")) {
        if (!p.registration) throw new Problem(403, "registration_closed");
        this.db.setMeta("registered", "key");
        this.db.setMeta("public_key", challenge.public_key);
      }
      if (this.db.meta("public_key") !== challenge.public_key)
        throw unauthorized();
      return this.storeSession(prepared);
    });
  }
  async externalIdentity(p: Record<string, unknown>) {
    if (!this.db.meta("registered")) {
      if (!p.registration) throw new Problem(403, "registration_closed");
      this.db.setMeta("registered", "oidc");
    }
    return {};
  }
  async managedSession(owner: string) {
    const prepared = await this.prepareSession(owner);
    this.db.transaction(() => {
      if (
        this.db.meta("registered") &&
        this.db.meta("registered") !== "managed"
      )
        throw unauthorized();
      this.db.setMeta("registered", "managed");
      this.storeSession(prepared);
    });
    return prepared.session;
  }
  async issueSession(owner: string) {
    if (!this.db.meta("registered")) throw unauthorized();
    const prepared = await this.prepareSession(owner);
    return this.db.transaction(() => this.storeSession(prepared));
  }
  async authenticate(owner: string, p: Record<string, unknown>) {
    const row = this.db.first<SessionRow>(
      "SELECT s.family,s.used,s.access_expires,f.revoked,f.expires AS family_expires FROM sessions s JOIN families f ON f.id=s.family WHERE s.access_hash=?",
      await hash(p.token as string),
    );
    if (
      !row ||
      row.used ||
      row.revoked ||
      row.access_expires <= Date.now() ||
      row.family_expires <= Date.now()
    )
      throw unauthorized();
    return { owner, family: row.family };
  }
  async refresh(owner: string, p: Record<string, unknown>) {
    const tokenHash = await hash(p.token as string);
    const prepared = await this.prepareSession(owner);
    const result = this.db.transaction(() => {
      const row = this.db.first<SessionRow>(
        "SELECT s.family,s.used,s.access_expires,f.revoked,f.expires AS family_expires FROM sessions s JOIN families f ON f.id=s.family WHERE s.refresh_hash=?",
        tokenHash,
      );
      if (!row || row.revoked || row.family_expires <= Date.now()) return null;
      if (row.used) {
        this.db.sql.exec(
          "UPDATE families SET revoked=1 WHERE id=?",
          row.family,
        );
        return null;
      }
      this.db.sql.exec(
        "UPDATE sessions SET used=1 WHERE refresh_hash=?",
        tokenHash,
      );
      prepared.family = row.family;
      return this.storeSession(prepared);
    });
    if (!result) throw unauthorized();
    return result;
  }
  logout(p: Record<string, unknown>) {
    this.db.sql.exec(
      "UPDATE families SET revoked=1 WHERE id=?",
      p.family as string,
    );
    return {};
  }
}
