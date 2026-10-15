// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import type { AppEnv } from "../context.js";
import { Hono } from "hono";
import { parse } from "../../shared/validation.js";
import { mutationSchema } from "../../modules/content/schemas.js";
import { filters } from "../../modules/content/filters.js";

export function registerContentRoutes(app: Hono<AppEnv>) {
  app.get("/v1/taxonomy", async (c) =>
    c.json({
      terms: await c.env.repository.taxonomy(c.get("principal").owner),
    }),
  );
  app.get("/v1/briefings", async (c) => {
    const params = new URL(c.req.url).searchParams;
    return c.json(
      await c.env.repository.list(
        c.get("principal").owner,
        filters(params),
        params.get("cursor"),
        Number(params.get("limit") ?? 30),
      ),
    );
  });
  app.get("/v1/briefings/:id", async (c) => {
    const doc = await c.env.repository.detail(
      c.get("principal").owner,
      c.req.param("id"),
    );
    c.header("ETag", `"${doc.id}-${doc.revision}-${doc.state.version}"`);
    return c.json(doc);
  });
  app.put("/v1/briefings/:id/state", async (c) =>
    c.json(
      await c.env.repository.setState(
        c.get("principal").owner,
        c.req.param("id"),
        parse(mutationSchema, await c.req.json()),
      ),
    ),
  );
}
