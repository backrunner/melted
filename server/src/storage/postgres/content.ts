// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { Database } from "./database.js";
import { hash } from "../../shared/crypto.js";
import { Problem } from "../../shared/problem.js";
import type {
  Briefing,
  Fixture,
  Mutation,
} from "../../modules/content/schemas.js";
import { lockAccount, appendChange } from "./account.js";
import { validateFixture } from "../../modules/content/fixtures.js";

export const briefingProjection = `b.document || jsonb_build_object('state',jsonb_build_object('read',b.read,'saved',b.saved,'hidden',b.hidden,'version',b.state_version)) AS document`;
export class PostgresContent {
  constructor(private db: Database) {}
  async taxonomy(owner: string) {
    return (
      await this.db.query<Fixture["terms"][number]>(
        "SELECT id,kind,name FROM terms WHERE owner=$1 ORDER BY kind,name,id",
        [owner],
      )
    ).rows;
  }
  async detail(owner: string, contentID: string) {
    const row = (
      await this.db.query<{ document: Briefing }>(
        `SELECT ${briefingProjection} FROM briefings b WHERE b.owner=$1 AND b.id=$2 AND NOT b.hidden`,
        [owner, contentID],
      )
    ).rows[0];
    if (!row) throw new Problem(404, "not_found");
    return row.document;
  }
  async setState(owner: string, contentID: string, m: Mutation) {
    const payloadHash = await hash(
      JSON.stringify({ id: contentID, mutation: m }),
    );
    return this.db.transaction(async (c) => {
      await lockAccount(c, owner);
      const old = (
        await c.query<{ payload_hash: string; response: Briefing["state"] }>(
          "SELECT payload_hash,response FROM mutations WHERE owner=$1 AND id=$2",
          [owner, m.mutation_id],
        )
      ).rows[0];
      if (old) {
        if (old.payload_hash !== payloadHash)
          throw new Problem(409, "conflict");
        return old.response;
      }
      const row = (
        await c.query<{ state_version: string }>(
          "SELECT state_version FROM briefings WHERE owner=$1 AND id=$2 FOR UPDATE",
          [owner, contentID],
        )
      ).rows[0];
      if (!row) throw new Problem(404, "not_found");
      if (Number(row.state_version) !== m.expected_version)
        throw new Problem(409, "conflict");
      const state = {
        read: m.read,
        saved: m.saved,
        hidden: m.hidden,
        version: m.expected_version + 1,
      };
      await c.query(
        "UPDATE briefings SET read=$3,saved=$4,hidden=$5,state_version=$6 WHERE owner=$1 AND id=$2",
        [
          owner,
          contentID,
          state.read,
          state.saved,
          state.hidden,
          state.version,
        ],
      );
      await appendChange(c, owner, contentID, "state");
      await c.query(
        "INSERT INTO mutations(owner,id,payload_hash,response) VALUES($1,$2,$3,$4)",
        [owner, m.mutation_id, payloadHash, JSON.stringify(state)],
      );
      return state;
    });
  }
  async importDemo(owner: string, fixture: Fixture) {
    validateFixture(fixture);
    await this.db.transaction(async (c) => {
      await lockAccount(c, owner);
      for (const t of fixture.terms)
        await c.query(
          "INSERT INTO terms(owner,id,kind,name) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
          [owner, t.id, t.kind, t.name],
        );
      for (const d of fixture.documents) {
        const inserted = await c.query(
          `INSERT INTO briefings(owner,id,document,category_id,title,search_text,updated_at,read,saved,hidden,state_version)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1) ON CONFLICT DO NOTHING RETURNING id`,
          [
            owner,
            d.id,
            JSON.stringify(d),
            d.category_id,
            d.title,
            d.title + "\n" + d.summary + "\n" + d.markdown,
            d.updated_at,
            d.state.read,
            d.state.saved,
            d.state.hidden,
          ],
        );
        if (!inserted.rowCount) continue;
        for (const term of [...d.tag_ids, ...d.subject_ids])
          await c.query(
            "INSERT INTO briefing_terms(owner,briefing_id,term_id) VALUES($1,$2,$3)",
            [owner, d.id, term],
          );
        await appendChange(c, owner, d.id, "upsert");
      }
    });
  }
}
