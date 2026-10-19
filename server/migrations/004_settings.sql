-- SPDX-FileCopyrightText: 2026 Melted contributors
-- SPDX-License-Identifier: GPL-3.0-or-later
CREATE TABLE account_settings (
  owner text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  section text NOT NULL,
  version bigint NOT NULL,
  document jsonb NOT NULL,
  PRIMARY KEY(owner, section)
);
CREATE TABLE settings_versions (
  owner text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  section text NOT NULL,
  version bigint NOT NULL,
  document jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner, section, version)
);
CREATE TABLE settings_requests (
  owner text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  section text NOT NULL,
  id text NOT NULL,
  payload_hash text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner, section, id)
);
