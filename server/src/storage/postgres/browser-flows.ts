import { Database } from "./database.js";
import { hash, id } from "../../shared/crypto.js";
import { unauthorized, Problem } from "../../shared/problem.js";
import { issue } from "./sessions.js";
import type { BrowserFlow } from "../../modules/identity/browser-flow.js";

export class PostgresBrowserFlows {
  constructor(private db: Database) {}
  async saveFlow(f: BrowserFlow) {
    await this.db.query(
      "INSERT INTO browser_flows(id,client_state,client_challenge,redirect_uri,provider_state,nonce,provider_verifier,issuer) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        f.id,
        f.client_state,
        f.client_challenge,
        f.redirect_uri,
        f.provider_state,
        f.nonce,
        f.provider_verifier,
        f.issuer,
      ],
    );
  }
  async readFlow(flowID: string): Promise<BrowserFlow> {
    const row = (
      await this.db.query<BrowserFlow>(
        "SELECT * FROM browser_flows WHERE id=$1 AND status='pending' AND expires_at>now()",
        [flowID],
      )
    ).rows[0];
    if (!row) throw unauthorized();
    return row;
  }
  async claimFlow(state: string): Promise<BrowserFlow> {
    const row = (
      await this.db.query<BrowserFlow>(
        "UPDATE browser_flows SET status='processing' WHERE provider_state=$1 AND status='pending' AND expires_at>now() RETURNING *",
        [state],
      )
    ).rows[0];
    if (!row) throw unauthorized();
    return row;
  }
  async completeFlow(
    f: BrowserFlow,
    subject: string,
    code: string,
    registration: boolean,
  ) {
    await this.db.transaction(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        f.issuer + "\n" + subject,
      ]);
      let owner = (
        await c.query<{ owner: string }>(
          "SELECT owner FROM external_identities WHERE issuer=$1 AND subject=$2",
          [f.issuer, subject],
        )
      ).rows[0]?.owner;
      if (!owner) {
        if (!registration) throw new Problem(403, "registration_closed");
        owner = id("acc");
        await c.query("INSERT INTO accounts(id) VALUES($1)", [owner]);
        await c.query(
          "INSERT INTO external_identities(issuer,subject,owner) VALUES($1,$2,$3)",
          [f.issuer, subject, owner],
        );
      }
      const completed = await c.query(
        "UPDATE browser_flows SET status='complete' WHERE id=$1 AND status='processing' AND expires_at>now() RETURNING id",
        [f.id],
      );
      if (!completed.rowCount) throw unauthorized();
      await c.query(
        "INSERT INTO browser_codes(code_hash,owner,challenge,redirect_uri) VALUES($1,$2,$3,$4)",
        [await hash(code), owner, f.client_challenge, f.redirect_uri],
      );
    });
  }
  async exchangeCode(code: string, challenge: string, redirect: string) {
    return this.db.transaction(async (c) => {
      const row = (
        await c.query<{ owner: string }>(
          "DELETE FROM browser_codes WHERE code_hash=$1 AND challenge=$2 AND redirect_uri=$3 AND expires_at>now() RETURNING owner",
          [await hash(code), challenge, redirect],
        )
      ).rows[0];
      if (!row) throw unauthorized();
      return issue(c, row.owner);
    });
  }
}
