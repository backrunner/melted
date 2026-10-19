// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import type { AccountDatabase } from "./sqlite.js";
import { appendChange } from "./changes.js";
import {
  emptySettings,
  type SettingsState,
  type SettingsMutation,
} from "../../modules/settings/dsl.js";
import { hash } from "../../shared/crypto.js";
import { Problem } from "../../shared/problem.js";
import { hideProcessing } from "./processing/repository.js";

export function initializeSettings(db: AccountDatabase) {
  db.sql
    .exec(`CREATE TABLE IF NOT EXISTS account_settings(section TEXT PRIMARY KEY,version INTEGER NOT NULL,document TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings_versions(section TEXT NOT NULL,version INTEGER NOT NULL,document TEXT NOT NULL,created INTEGER NOT NULL,PRIMARY KEY(section,version));
    CREATE TABLE IF NOT EXISTS settings_requests(section TEXT NOT NULL,id TEXT NOT NULL,payload_hash TEXT NOT NULL,response TEXT NOT NULL,created INTEGER NOT NULL,PRIMARY KEY(section,id));`);
}
export class AccountSettings {
  constructor(private db: AccountDatabase) {}
  settings(section: string): SettingsState {
    const row = this.db.first<{ document: string }>(
      "SELECT document FROM account_settings WHERE section=?",
      section,
    );
    return row ? JSON.parse(row.document) : emptySettings(section);
  }
  async saveSettings(
    section: string,
    input: SettingsMutation,
    requestID: string,
  ): Promise<SettingsState> {
    const payloadHash = await hash(JSON.stringify(input));
    return this.db.transaction(() => {
      const old = this.db.first<{ payload_hash: string; response: string }>(
        "SELECT payload_hash,response FROM settings_requests WHERE section=? AND id=?",
        section,
        requestID,
      );
      if (old) {
        if (old.payload_hash !== payloadHash)
          throw new Problem(409, "idempotency_conflict");
        return JSON.parse(old.response);
      }
      const current = this.settings(section);
      if (current.version !== input.expected_version)
        throw new Problem(409, "settings_conflict");
      const result: SettingsState = {
        schema_version: input.schema_version,
        version: current.version + 1,
        values: input.values,
        application: "stored",
      };
      const document = JSON.stringify(result),
        now = Date.now();
      if (section === "preferences") hideProcessing(this.db);
      this.db.sql.exec(
        "INSERT INTO account_settings(section,version,document) VALUES(?,?,?) ON CONFLICT(section) DO UPDATE SET version=excluded.version,document=excluded.document",
        section,
        result.version,
        document,
      );
      this.db.sql.exec(
        "INSERT INTO settings_versions(section,version,document,created) VALUES(?,?,?,?)",
        section,
        result.version,
        document,
        now,
      );
      this.db.sql.exec(
        "INSERT INTO settings_requests(section,id,payload_hash,response,created) VALUES(?,?,?,?,?)",
        section,
        requestID,
        payloadHash,
        document,
        now,
      );
      appendChange(this.db, section, "settings");
      return result;
    });
  }
}
