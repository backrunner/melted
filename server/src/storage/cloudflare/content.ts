// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { appendChange } from "./changes.js";
import { Problem } from "../../shared/problem.js";
import { hash } from "../../shared/crypto.js";
import {
  type Briefing,
  type Fixture,
  type Mutation,
} from "../../modules/content/schemas.js";
import { type Filter } from "../../modules/content/filters.js";
import { validateFixture } from "../../modules/content/fixtures.js";
import { AccountDatabase } from "./sqlite.js";
import { listBriefings } from "./queries.js";

export class AccountContent {
  constructor(private db: AccountDatabase) {}
  private document(contentID: string, includeHidden = false): Briefing {
    const row = this.db.first<{ document: string; hidden: number }>(
      "SELECT document,hidden FROM briefings WHERE id=?",
      contentID,
    );
    if (!row || (!includeHidden && row.hidden))
      throw new Problem(404, "not_found");
    return JSON.parse(row.document) as Briefing;
  }
  taxonomy() {
    return this.db.sql
      .exec("SELECT id,kind,name FROM terms ORDER BY kind,name,id")
      .toArray();
  }
  detail(id: string) {
    return this.document(id);
  }
  list(filter: Filter, cursor: string | null, limit: number) {
    return listBriefings(this.db, filter, cursor, limit);
  }
  async setState(contentID: string, m: Mutation) {
    const payloadHash = await hash(
      JSON.stringify({ id: contentID, mutation: m }),
    );
    return this.db.transaction(() => {
      const previous = this.db.first<{
        payload_hash: string;
        response: string;
      }>(
        "SELECT payload_hash,response FROM mutations WHERE id=?",
        m.mutation_id,
      );
      if (previous) {
        if (previous.payload_hash !== payloadHash)
          throw new Problem(409, "conflict");
        return JSON.parse(previous.response);
      }
      const doc = this.document(contentID, true);
      if (doc.state.version !== m.expected_version)
        throw new Problem(409, "conflict");
      doc.state = {
        read: m.read,
        saved: m.saved,
        hidden: m.hidden,
        version: m.expected_version + 1,
      };
      this.db.sql.exec(
        "UPDATE briefings SET document=?,read=?,saved=?,hidden=?,version=? WHERE id=?",
        JSON.stringify(doc),
        Number(m.read),
        Number(m.saved),
        Number(m.hidden),
        doc.state.version,
        contentID,
      );
      appendChange(this.db, contentID, "state");
      this.db.sql.exec(
        "INSERT INTO mutations(id,payload_hash,response,created) VALUES(?,?,?,?)",
        m.mutation_id,
        payloadHash,
        JSON.stringify(doc.state),
        Date.now(),
      );
      return doc.state;
    });
  }
  importDemo(fixture: Fixture) {
    validateFixture(fixture);
    return this.db.transaction(() => {
      for (const t of fixture.terms)
        this.db.sql.exec(
          "INSERT INTO terms(id,kind,name) VALUES(?,?,?) ON CONFLICT DO NOTHING",
          t.id,
          t.kind,
          t.name,
        );
      for (const d of fixture.documents) {
        const inserted = this.db.first(
          "INSERT INTO briefings(id,document,category_id,search_text,updated_at,read,saved,hidden,version) VALUES(?,?,?,?,?,?,?,?,1) ON CONFLICT DO NOTHING RETURNING id",
          d.id,
          JSON.stringify(d),
          d.category_id,
          d.title + "\n" + d.summary + "\n" + d.markdown,
          Date.parse(d.updated_at),
          Number(d.state.read),
          Number(d.state.saved),
          Number(d.state.hidden),
        );
        if (inserted) appendChange(this.db, d.id, "upsert");
      }
      return {};
    });
  }
}
