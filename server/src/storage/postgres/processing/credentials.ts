// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import type { Database } from "../database.js";
import type {
  CredentialRepository,
  CredentialRecord,
} from "../../../modules/processing/credentials.js";
import { Problem } from "../../../shared/problem.js";
export class PostgresCredentials implements CredentialRepository {
  constructor(private db: Database) {}
  async read(scope: string) {
    return (
      (
        await this.db.query<{ document: CredentialRecord | null }>(
          "SELECT document FROM processing_credentials WHERE scope=$1",
          [scope],
        )
      ).rows[0]?.document ?? null
    );
  }
  async save(
    scope: string,
    owner: string | null,
    expected: number,
    key: string,
    digest: string,
    record: CredentialRecord,
  ) {
    return this.db.transaction(async (c) => {
      await c.query(
        "INSERT INTO processing_credentials(scope,owner) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [scope, owner],
      );
      const current = (
        await c.query<{ document: CredentialRecord | null }>(
          "SELECT document FROM processing_credentials WHERE scope=$1 FOR UPDATE",
          [scope],
        )
      ).rows[0]!.document;
      const replay = (
        await c.query<{ digest: string; document: CredentialRecord }>(
          "SELECT digest,document FROM processing_credential_requests WHERE scope=$1 AND id=$2",
          [scope, key],
        )
      ).rows[0];
      if (replay) {
        if (replay.digest !== digest)
          throw new Problem(409, "idempotency_conflict");
        return replay.document;
      }
      if ((current?.version ?? 0) !== expected)
        throw new Problem(409, "credentials_conflict");
      await c.query(
        "UPDATE processing_credentials SET document=$2 WHERE scope=$1",
        [scope, record],
      );
      await c.query(
        "INSERT INTO processing_credential_requests(scope,id,digest,document) VALUES($1,$2,$3,$4)",
        [scope, key, digest, record],
      );
      return record;
    });
  }
}
