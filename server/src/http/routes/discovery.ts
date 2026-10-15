// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import type { AppEnv } from "../context.js";
import { Hono } from "hono";
import { authentication } from "../../modules/identity/auth-policy.js";

export function registerDiscoveryRoutes(app: Hono<AppEnv>) {
  app.get("/healthz", async (c) => {
    await c.env.repository.health();
    return c.json({ status: "ok" });
  });
  app.get("/.well-known/melted", (c) =>
    c.json({
      protocol: { min: 1, max: 1 },
      server_id: c.env.config.serverID,
      api_base: "/v1",
      registration: c.env.config.registration,
      operator: { name: c.env.config.operator },
      auth: authentication(c.env.config),
      capabilities: {
        input: [],
        subject_pull: false,
        html_static: false,
        push: [],
        reading: true,
        taxonomy: true,
        changes: true,
        snapshot_sync: false,
        development_samples: c.env.developmentSamples,
      },
      processing_manifest_version: "local-v1",
    }),
  );
  app.get("/.well-known/melted/processing", (c) =>
    c.json({
      version: "local-v1",
      destinations: [],
      description: "此基础版本存储并展示已整理的内容，尚未连接外部处理服务",
    }),
  );
}
