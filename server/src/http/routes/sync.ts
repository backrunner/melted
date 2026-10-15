// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import type { AppEnv } from "../context.js";
import { Hono } from "hono";
import { invalid } from "../../shared/problem.js";

export function registerSyncRoutes(app: Hono<AppEnv>) {
  app.get("/v1/sync/changes", async (c) => {
    const after = Number(c.req.query("after") ?? 0);
    if (!Number.isSafeInteger(after) || after < 0) throw invalid();
    const rows = await c.env.repository.changes(
      c.get("principal").owner,
      after,
    );
    const changes = rows.slice(0, 100);
    return c.json({
      changes,
      next_cursor: changes.at(-1)?.sequence ?? after,
      has_more: rows.length > 100,
    });
  });
}
