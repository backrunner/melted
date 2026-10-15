// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import type { AppEnv } from "../context.js";
import { Hono } from "hono";
import {
  startBrowser,
  authorizeBrowser,
  browserCallback,
  exchangeBrowser,
} from "../../modules/identity/browser-login.js";

export function registerAuthRoutes(app: Hono<AppEnv>) {
  app.use("/v1/auth/*", async (c, next) => {
    await c.env.repository.limit("auth:" + c.env.remoteIP, 60);
    await next();
  });
  app.post("/v1/auth/key/challenges", async (c) =>
    c.json(await c.env.repository.challenge(c.env.config, await c.req.json())),
  );
  app.post("/v1/auth/key/sessions", async (c) =>
    c.json(await c.env.repository.keySession(c.env.config, await c.req.json())),
  );
  app.post("/v1/auth/refresh", async (c) =>
    c.json(await c.env.repository.refresh(await c.req.json())),
  );
  app.delete("/v1/auth/sessions/current", async (c) => {
    const p = await c.env.repository.authenticate(
      c.req.header("Authorization"),
    );
    await c.env.repository.logout(p);
    return c.body(null, 204);
  });
  app.post("/v1/auth/browser/start", async (c) =>
    c.json(
      await startBrowser(c.env.repository, c.env.config, await c.req.json()),
    ),
  );
  app.get("/v1/auth/browser/authorize", async (c) =>
    c.redirect(
      await authorizeBrowser(
        c.env.repository,
        c.env.config,
        c.req.query("request") ?? "",
      ),
    ),
  );
  app.get("/v1/auth/browser/callback", async (c) =>
    c.redirect(
      await browserCallback(
        c.env.repository,
        c.env.config,
        c.req.query("state") ?? "",
        c.req.query("code") ?? "",
      ),
    ),
  );
  app.post("/v1/auth/browser/exchange", async (c) =>
    c.json(await exchangeBrowser(c.env.repository, await c.req.json())),
  );
}
