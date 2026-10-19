// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import type {
  CredentialRecord,
  CredentialRepository,
} from "../../../modules/processing/credentials.js";
import { Problem } from "../../../shared/problem.js";
import { call } from "../rpc.js";
export function initializeCredentials(storage: DurableObjectStorage) {
  storage.sql.exec(
    "CREATE TABLE IF NOT EXISTS model_credentials(id INTEGER PRIMARY KEY,document TEXT NOT NULL); CREATE TABLE IF NOT EXISTS model_credential_requests(id TEXT PRIMARY KEY,digest TEXT NOT NULL,document TEXT NOT NULL,created INTEGER NOT NULL)",
  );
}
export function dispatchCredentials(
  storage: DurableObjectStorage,
  op: string,
  p: Record<string, unknown>,
) {
  initializeCredentials(storage);
  return storage.transactionSync(() => {
    const sql = storage.sql,
      current = sql
        .exec<{ document: string }>(
          "SELECT document FROM model_credentials WHERE id=1",
        )
        .toArray()[0];
    if (op === "credentials.read")
      return current
        ? (JSON.parse(current.document) as CredentialRecord)
        : null;
    if (op !== "credentials.save") throw new Problem(404, "not_found");
    const replay = sql
      .exec<{ digest: string; document: string }>(
        "SELECT digest,document FROM model_credential_requests WHERE id=?",
        p.key as string,
      )
      .toArray()[0];
    if (replay) {
      if (replay.digest !== p.digest)
        throw new Problem(409, "idempotency_conflict");
      return JSON.parse(replay.document) as CredentialRecord;
    }
    if (
      (current
        ? (JSON.parse(current.document) as CredentialRecord).version
        : 0) !== p.expected
    )
      throw new Problem(409, "credentials_conflict");
    sql.exec(
      "INSERT INTO model_credentials(id,document) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document",
      JSON.stringify(p.record),
    );
    sql.exec(
      "INSERT INTO model_credential_requests(id,digest,document,created) VALUES(?,?,?,?)",
      p.key as string,
      p.digest as string,
      JSON.stringify(p.record),
      Date.now(),
    );
    sql.exec(
      "DELETE FROM model_credential_requests WHERE created<?",
      Date.now() - 7 * 86400_000,
    );
    return p.record;
  });
}
export class CloudCredentials implements CredentialRepository {
  constructor(
    private accounts: DurableObjectNamespace,
    private control: DurableObjectNamespace,
  ) {}
  private request<T>(scope: string, op: string, payload: unknown) {
    return scope === "server"
      ? call<T>(this.control, "processing-server-credentials", op, payload)
      : call<T>(this.accounts, scope.slice("account:".length), op, payload);
  }
  read(scope: string) {
    return this.request<CredentialRecord | null>(scope, "credentials.read", {});
  }
  save(
    scope: string,
    _owner: string | null,
    expected: number,
    key: string,
    digest: string,
    record: CredentialRecord,
  ) {
    return this.request<CredentialRecord>(scope, "credentials.save", {
      expected,
      key,
      digest,
      record,
    });
  }
}
