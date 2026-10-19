-- SPDX-FileCopyrightText: 2026 Melted contributors
-- SPDX-License-Identifier: GPL-3.0-or-later
ALTER TABLE briefings ADD COLUMN processing_visible boolean NOT NULL DEFAULT true;
CREATE TABLE processing_state(owner text PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE, document jsonb NOT NULL);
CREATE TABLE processing_jobs(owner text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,id text NOT NULL,document jsonb NOT NULL,state text NOT NULL,available bigint NOT NULL,lease_until bigint NOT NULL,PRIMARY KEY(owner,id));
CREATE INDEX processing_due ON processing_jobs(available,owner) WHERE state IN ('queued','running');
CREATE TABLE processing_budget(owner text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,day text NOT NULL,reserved integer NOT NULL,PRIMARY KEY(owner,day));
CREATE TABLE processing_actions(owner text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,id text NOT NULL,payload_hash text NOT NULL,response jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(owner,id));
CREATE TABLE processing_results(owner text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,raw_id text NOT NULL,source_id text NOT NULL,briefing_id text NOT NULL,document jsonb NOT NULL,PRIMARY KEY(owner,raw_id));

CREATE INDEX processing_item_identity ON processing_jobs(owner,(document->>'raw_id'),(document->>'version'),(document->>'fingerprint'),(document->>'raw_revision'),(document->>'source_generation'));
