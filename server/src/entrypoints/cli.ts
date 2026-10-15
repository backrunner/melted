import { readFile } from "node:fs/promises";
import { connect } from "../storage/postgres/connection.js";
import { migrate } from "../storage/postgres/migrations.js";
import { PostgresRepository } from "../storage/postgres/repository.js";
import { fixtureSchema } from "../modules/content/schemas.js";
import { hash } from "../shared/crypto.js";
import { parse } from "../shared/validation.js";

const { database, pool } = connect();
try {
  switch (process.argv[2]) {
    case "migrate":
      await migrate(database);
      console.log("Database migrations applied");
      break;
    case "bind-key": {
      const [owner, publicKey] = process.argv.slice(3);
      if (!owner || !publicKey || !/^[A-Za-z0-9_-]{87}$/.test(publicKey))
        throw new Error("Usage: bind-key ACCOUNT_ID P256_PUBLIC_KEY_BASE64URL");
      await crypto.subtle.importKey(
        "raw",
        Buffer.from(publicKey, "base64url"),
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["verify"],
      );
      await database.transaction(async (connection) => {
        if (
          !(
            await connection.query(
              "SELECT id FROM accounts WHERE id=$1 FOR UPDATE",
              [owner],
            )
          ).rowCount
        )
          throw new Error("Account not found");
        await connection.query(
          "INSERT INTO credentials(fingerprint,owner,public_key) VALUES($1,$2,$3)",
          [await hash(publicKey), owner, publicKey],
        );
      });
      console.log("Public credential linked to existing account");
      break;
    }
    case "import-demo": {
      const [owner, file] = process.argv.slice(3);
      if (!owner || !file)
        throw new Error("Usage: import-demo ACCOUNT_ID FILE");
      await new PostgresRepository(database).importDemo(
        owner,
        parse(fixtureSchema, JSON.parse(await readFile(file, "utf8"))),
      );
      console.log("Development samples imported");
      break;
    }
    default:
      throw new Error(
        "Usage: migrate | import-demo ACCOUNT_ID FILE | bind-key ACCOUNT_ID PUBLIC_KEY",
      );
  }
} finally {
  await pool.end();
}
