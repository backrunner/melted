// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
export function initializeAccount(sql: SqlStorage) {
  sql.exec(`CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS challenges(id TEXT PRIMARY KEY,public_key TEXT NOT NULL,message TEXT NOT NULL,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS families(id TEXT PRIMARY KEY,revoked INTEGER NOT NULL DEFAULT 0,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(refresh_hash TEXT PRIMARY KEY,access_hash TEXT NOT NULL UNIQUE,family TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,used INTEGER NOT NULL DEFAULT 0,access_expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS terms(id TEXT PRIMARY KEY,kind TEXT NOT NULL,name TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS briefings(id TEXT PRIMARY KEY,document TEXT NOT NULL,category_id TEXT,search_text TEXT NOT NULL,updated_at INTEGER NOT NULL,read INTEGER NOT NULL,saved INTEGER NOT NULL,hidden INTEGER NOT NULL,version INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS briefings_order ON briefings(updated_at DESC,id DESC);
      CREATE TABLE IF NOT EXISTS changes(sequence INTEGER PRIMARY KEY,entity_id TEXT NOT NULL,kind TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS mutations(id TEXT PRIMARY KEY,payload_hash TEXT NOT NULL,response TEXT NOT NULL,created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS snapshots(id TEXT PRIMARY KEY,query_hash TEXT NOT NULL,total INTEGER NOT NULL,expires INTEGER NOT NULL,created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS snapshot_items(snapshot TEXT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,ordinal INTEGER NOT NULL,document TEXT NOT NULL,PRIMARY KEY(snapshot,ordinal));`);
}
