// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { Hono } from "hono";
import type { AppEnv } from "./context.js";
import { installMiddleware } from "./middleware.js";
import { registerDiscoveryRoutes } from "./routes/discovery.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerContentRoutes } from "./routes/content.js";
import { registerSyncRoutes } from "./routes/sync.js";
import { registerDevelopmentRoutes } from "./routes/development.js";

export function createApp() {
  const app = new Hono<AppEnv>();
  installMiddleware(app);
  registerDiscoveryRoutes(app);
  registerAuthRoutes(app);
  app.use("/v1/*", async (c, next) => {
    c.set(
      "principal",
      await c.env.repository.authenticate(c.req.header("Authorization")),
    );
    await next();
  });
  registerContentRoutes(app);
  registerSyncRoutes(app);
  registerDevelopmentRoutes(app);
  return app;
}
