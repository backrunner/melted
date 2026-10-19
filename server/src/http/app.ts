// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { registerSourceRoutes } from "./routes/sources.js";
import { Hono } from "hono";
import type { AppEnv } from "./context.js";
import { installMiddleware } from "./middleware.js";
import { registerDiscoveryRoutes } from "./routes/discovery.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerContentRoutes } from "./routes/content.js";
import { registerSyncRoutes } from "./routes/sync.js";
import { pluginRegistry } from "../plugins/index.js";
import type { PluginRegistry } from "../modules/plugins/registry.js";
import { registerSettingsRoutes } from "./routes/settings.js";

import { refreshProcessingContext } from "../modules/processing/credentials.js";

export function createApp(registry: PluginRegistry = pluginRegistry) {
  const app = new Hono<AppEnv>();
  installMiddleware(app);
  registerDiscoveryRoutes(app, registry);
  registerAuthRoutes(app);
  app.use("/v1/*", async (c, next) => {
    c.set(
      "principal",
      await c.env.repository.authenticate(c.req.header("Authorization")),
    );
    await refreshProcessingContext(
      c.env.repository,
      c.env.config,
      c.get("principal").owner,
    );
    await next();
  });
  registerSourceRoutes(app, registry);
  registerSettingsRoutes(app);
  registerContentRoutes(app);
  registerSyncRoutes(app);
  return app;
}
