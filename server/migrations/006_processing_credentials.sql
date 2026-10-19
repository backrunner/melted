-- SPDX-FileCopyrightText: 2026 Melted contributors
-- SPDX-License-Identifier: GPL-3.0-or-later
CREATE TABLE processing_credentials (
    scope text PRIMARY KEY,
    owner text REFERENCES accounts(id) ON DELETE CASCADE,
    document jsonb
);
CREATE TABLE processing_credential_requests (
    scope text NOT NULL REFERENCES processing_credentials(scope) ON DELETE CASCADE,
    id text NOT NULL,
    digest text NOT NULL,
    document jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(scope,id)
);
