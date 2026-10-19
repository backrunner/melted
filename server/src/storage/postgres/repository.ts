// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { PostgresSources } from "./sources/repository.js";
import { listChanges } from "./changes.js";
import { Database } from "./database.js";
import { type Config } from "../../config/schema.js";
import { Problem } from "../../shared/problem.js";
import { rateLimit } from "./rate-limit.js";
import { authenticate, refresh, issue } from "./sessions.js";
import { challenge, keySession } from "./key-auth.js";
import { type Principal } from "../../modules/identity/types.js";
import type { Fixture, Mutation } from "../../modules/content/schemas.js";
import type { Filter } from "../../modules/content/filters.js";
import type { BrowserFlow } from "../../modules/identity/browser-flow.js";
import type { Repository } from "../repository.js";
import { PostgresContent } from "./content.js";
import { PostgresBrowserFlows } from "./browser-flows.js";
import { listBriefings } from "./queries.js";
import { PostgresSettings } from "./settings.js";
import type { SettingsMutation } from "../../modules/settings/dsl.js";
import { PostgresProcessing } from "./processing/repository.js";

import { PostgresCredentials } from "./processing/credentials.js";

export class PostgresRepository implements Repository {
  readonly sources: PostgresSources;
  readonly processing: PostgresProcessing;
  readonly credentials: PostgresCredentials;
  private content: PostgresContent;
  private browser: PostgresBrowserFlows;
  private accountSettings: PostgresSettings;
  constructor(readonly db: Database) {
    this.sources = new PostgresSources(db);
    this.processing = new PostgresProcessing(db);
    this.credentials = new PostgresCredentials(db);
    this.content = new PostgresContent(db);
    this.browser = new PostgresBrowserFlows(db);
    this.accountSettings = new PostgresSettings(db);
  }
  async health() {
    try {
      const result = await this.db.query(
        "SELECT 1 FROM schema_migrations WHERE version=$1",
        ["006_processing_credentials.sql"],
      );
      if (!result.rowCount) throw new Error("migration_missing");
    } catch {
      throw new Problem(503, "database_not_ready");
    }
  }
  limit(key: string, maximum: number) {
    return rateLimit(this.db, key, maximum);
  }
  settings(owner: string, section: string) {
    return this.accountSettings.settings(owner, section);
  }
  saveSettings(
    owner: string,
    section: string,
    input: SettingsMutation,
    requestID: string,
  ) {
    return this.accountSettings.saveSettings(owner, section, input, requestID);
  }
  challenge(config: Config, body: unknown) {
    return challenge(this.db, config, body);
  }
  keySession(config: Config, body: unknown) {
    return keySession(this.db, config, body);
  }
  authenticate(token?: string) {
    return authenticate(this.db, token);
  }
  managedSession(owner: string) {
    return this.db.transaction(async (connection) => {
      await connection.query(
        "INSERT INTO accounts(id) VALUES($1) ON CONFLICT(id) DO NOTHING",
        [owner],
      );
      return issue(connection, owner);
    });
  }
  refresh(body: unknown) {
    return refresh(this.db, body);
  }
  async logout(p: Principal) {
    await this.db.query(
      "UPDATE session_families SET revoked=true WHERE id=$1 AND owner=$2",
      [p.family, p.owner],
    );
  }
  taxonomy(owner: string) {
    return this.content.taxonomy(owner);
  }
  detail(owner: string, id: string) {
    return this.content.detail(owner, id);
  }
  list(owner: string, filter: Filter, cursor: string | null, limit: number) {
    return listBriefings(this.db, owner, filter, cursor, limit);
  }
  setState(owner: string, id: string, mutation: Mutation) {
    return this.content.setState(owner, id, mutation);
  }
  changes(owner: string, after: number) {
    return listChanges(this.db, owner, after);
  }
  importDemo(owner: string, fixture: Fixture) {
    return this.content.importDemo(owner, fixture);
  }
  saveFlow(flow: BrowserFlow) {
    return this.browser.saveFlow(flow);
  }
  readFlow(id: string) {
    return this.browser.readFlow(id);
  }
  claimFlow(state: string) {
    return this.browser.claimFlow(state);
  }
  completeFlow(
    flow: BrowserFlow,
    subject: string,
    code: string,
    registration: boolean,
  ) {
    return this.browser.completeFlow(flow, subject, code, registration);
  }
  exchangeCode(code: string, challenge: string, redirect: string) {
    return this.browser.exchangeCode(code, challenge, redirect);
  }
  async maintenance() {
    await this.db.query(
      "DELETE FROM processing_credential_requests WHERE created_at<now()-interval '7 days'",
    );
    await this.db.query(
      "DELETE FROM processing_actions WHERE created_at<now()-interval '7 days'; DELETE FROM processing_budget WHERE day < to_char(now()-interval '30 days','YYYY-MM-DD')",
    );
    await this.db.query(
      "DELETE FROM settings_requests WHERE created_at<now()-interval '7 days'",
    );
    await this.db.query("DELETE FROM source_requests WHERE created<$1", [
      Date.now() - 7 * 86400_000,
    ]);
    await this.db.query(
      "DELETE FROM query_snapshots WHERE expires_at<now(); DELETE FROM auth_challenges WHERE expires_at<now(); DELETE FROM browser_flows WHERE expires_at<now(); DELETE FROM browser_codes WHERE expires_at<now(); DELETE FROM auth_limits WHERE window_start<now()-interval '1 hour'; DELETE FROM mutations WHERE created_at<now()-interval '7 days'; DELETE FROM session_families WHERE expires_at<now();",
    );
  }
}
