/** All writes inside transaction() are synchronous; prepare crypto/IO before entering. */
export class AccountDatabase {
  readonly sql: SqlStorage;
  constructor(private storage: DurableObjectStorage) {
    this.sql = storage.sql;
  }
  first<T extends Record<string, SqlStorageValue>>(
    query: string,
    ...args: SqlStorageValue[]
  ): T | undefined {
    return this.sql.exec<T>(query, ...args).toArray()[0];
  }
  meta(key: string) {
    return this.first<{ value: string }>(
      "SELECT value FROM meta WHERE key=?",
      key,
    )?.value;
  }
  setMeta(key: string, value: string) {
    this.sql.exec(
      "INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      key,
      value,
    );
  }
  transaction<T>(work: () => T) {
    return this.storage.transactionSync(work);
  }
}
