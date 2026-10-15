// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import type { AppEnv } from "../context.js";
import { Hono } from "hono";
import { Problem } from "../../shared/problem.js";
import { parse } from "../../shared/validation.js";
import { fixtureSchema } from "../../modules/content/schemas.js";
import developmentLibrary from "../../../../contracts/fixtures/development-library.json" with { type: "json" };

export function registerDevelopmentRoutes(app: Hono<AppEnv>) {
  app.post("/v1/development/seed", async (c) => {
    if (!c.env.developmentSamples) throw new Problem(404, "not_found");
    await c.env.repository.importDemo(
      c.get("principal").owner,
      parse(fixtureSchema, developmentLibrary),
    );
    return c.body(null, 204);
  });
}
