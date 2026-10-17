// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import type { AccountDatabase } from "../sqlite.js";

export function initializeSources(db: AccountDatabase) {
  if (db.meta("source_schema") === "2") return;
  db.transaction(() => {
    db.sql
      .exec(`CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY,document TEXT NOT NULL,enabled INTEGER NOT NULL,blocked INTEGER NOT NULL,deleted INTEGER NOT NULL,next_poll INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS sources_due ON sources(next_poll) WHERE enabled=1 AND blocked=0 AND deleted=0;
      CREATE TABLE IF NOT EXISTS source_runs(id TEXT PRIMARY KEY,source_id TEXT NOT NULL REFERENCES sources(id),slot TEXT NOT NULL,document TEXT NOT NULL,state TEXT NOT NULL,available INTEGER NOT NULL,lease_until INTEGER NOT NULL,UNIQUE(source_id,slot));
      CREATE INDEX IF NOT EXISTS source_runs_due ON source_runs(state,available);
      CREATE TABLE IF NOT EXISTS raw_items(id TEXT PRIMARY KEY,source_id TEXT NOT NULL REFERENCES sources(id),external_key TEXT NOT NULL,document TEXT NOT NULL,UNIQUE(source_id,external_key));
      CREATE TABLE IF NOT EXISTS raw_item_revisions(item_id TEXT NOT NULL REFERENCES raw_items(id) ON DELETE CASCADE,revision INTEGER NOT NULL,document TEXT NOT NULL,PRIMARY KEY(item_id,revision));
      CREATE TABLE IF NOT EXISTS source_requests(operation TEXT NOT NULL,key TEXT NOT NULL,payload_hash TEXT NOT NULL,response TEXT NOT NULL,created INTEGER NOT NULL,PRIMARY KEY(operation,key));
      CREATE TABLE IF NOT EXISTS source_outbox(run_id TEXT PRIMARY KEY REFERENCES source_runs(id),token TEXT NOT NULL,due INTEGER NOT NULL);`);
    db.sql.exec(`UPDATE sources SET document = json_remove(json_set(document,
      '$.config_version',1,'$.configuration',json_object('route',json_extract(document,'$.route'))),'$.route')
      WHERE json_extract(document,'$.plugin')='rsshub' AND json_type(document,'$.configuration') IS NULL`);
    db.sql
      .exec(`UPDATE source_requests SET response = json_remove(json_set(response,
      '$.config_version',1,'$.configuration',json_object('route',json_extract(response,'$.route'))),'$.route')
      WHERE operation='create' AND json_extract(response,'$.plugin')='rsshub' AND json_type(response,'$.configuration') IS NULL`);
    db.setMeta("source_schema", "2");
  });
}
