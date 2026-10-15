// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { Database } from "./database.js";
import { hash } from "../../shared/crypto.js";
import { Problem } from "../../shared/problem.js";

export async function rateLimit(
  db: Database,
  key: string,
  limit: number,
): Promise<void> {
  const result = await db.query<{ count: number }>(
    `INSERT INTO auth_limits(key,window_start,count) VALUES($1,date_trunc('minute',now()),1)
    ON CONFLICT(key) DO UPDATE SET window_start=excluded.window_start,
    count=CASE WHEN auth_limits.window_start=excluded.window_start THEN auth_limits.count+1 ELSE 1 END RETURNING count`,
    [await hash(key)],
  );
  if (result.rows[0]!.count > limit) throw new Problem(429, "rate_limited");
}
