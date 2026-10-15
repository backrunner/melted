import pg from "pg";
import { Database } from "./database.js";

export function connect(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const pool = new pg.Pool({
    connectionString,
    max: 20,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });
  pool.on("error", () => console.error("Database connection unavailable"));
  const database = new Database(async () => {
    const client = await pool.connect();
    return { connection: client, release: () => client.release() };
  });
  return { database, pool };
}
