// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import type { Database } from "./database.js";
import { lockAccount, appendChange } from "./account.js";
import {
  emptySettings,
  type SettingsState,
  type SettingsMutation,
} from "../../modules/settings/dsl.js";
import { hash } from "../../shared/crypto.js";
import { Problem } from "../../shared/problem.js";
import { hideProcessing } from "./processing/repository.js";

export class PostgresSettings {
  constructor(private db: Database) {}
  async settings(owner: string, section: string): Promise<SettingsState> {
    const row = (
      await this.db.query<{ document: SettingsState }>(
        "SELECT document FROM account_settings WHERE owner=$1 AND section=$2",
        [owner, section],
      )
    ).rows[0];
    return row?.document ?? emptySettings(section);
  }
  async saveSettings(
    owner: string,
    section: string,
    input: SettingsMutation,
    requestID: string,
  ): Promise<SettingsState> {
    const payloadHash = await hash(JSON.stringify(input));
    return this.db.transaction(async (c) => {
      await lockAccount(c, owner);
      const old = (
        await c.query<{ payload_hash: string; response: SettingsState }>(
          "SELECT payload_hash,response FROM settings_requests WHERE owner=$1 AND section=$2 AND id=$3",
          [owner, section, requestID],
        )
      ).rows[0];
      if (old) {
        if (old.payload_hash !== payloadHash)
          throw new Problem(409, "idempotency_conflict");
        return old.response;
      }
      const current = (
        await c.query<{ version: string }>(
          "SELECT version FROM account_settings WHERE owner=$1 AND section=$2",
          [owner, section],
        )
      ).rows[0];
      if (Number(current?.version ?? 0) !== input.expected_version)
        throw new Problem(409, "settings_conflict");
      const result: SettingsState = {
        schema_version: input.schema_version,
        version: input.expected_version + 1,
        values: input.values,
        application: "stored",
      };
      const document = JSON.stringify(result);
      if (section === "preferences") await hideProcessing(c, owner);
      await c.query(
        "INSERT INTO account_settings(owner,section,version,document) VALUES($1,$2,$3,$4) ON CONFLICT(owner,section) DO UPDATE SET version=excluded.version,document=excluded.document",
        [owner, section, result.version, document],
      );
      await c.query(
        "INSERT INTO settings_versions(owner,section,version,document) VALUES($1,$2,$3,$4)",
        [owner, section, result.version, document],
      );
      await c.query(
        "INSERT INTO settings_requests(owner,section,id,payload_hash,response) VALUES($1,$2,$3,$4,$5)",
        [owner, section, requestID, payloadHash, document],
      );
      await appendChange(c, owner, section, "settings");
      return result;
    });
  }
}
