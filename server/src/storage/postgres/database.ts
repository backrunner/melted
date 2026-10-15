// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import type { QueryResult, QueryResultRow } from "pg";

export interface Connection {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<R>>;
}
export interface Lease {
  connection: Connection;
  release(): Promise<void> | void;
}
export class Database {
  constructor(private acquire: () => Promise<Lease>) {}
  async query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values: unknown[] = [],
  ): Promise<QueryResult<R>> {
    const lease = await this.acquire();
    try {
      return await lease.connection.query<R>(text, values);
    } finally {
      await lease.release();
    }
  }
  async transaction<T>(
    work: (connection: Connection) => Promise<T>,
  ): Promise<T> {
    const lease = await this.acquire();
    try {
      await lease.connection.query("BEGIN");
      await lease.connection.query(
        "SET LOCAL statement_timeout='10s'; SET LOCAL lock_timeout='5s'",
      );
      const result = await work(lease.connection);
      await lease.connection.query("COMMIT");
      return result;
    } catch (error) {
      await lease.connection.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      await lease.release();
    }
  }
}
