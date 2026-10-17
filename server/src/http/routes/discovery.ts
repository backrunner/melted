// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import type { AppEnv } from "../context.js";
import { pluginConfiguration } from "../../plugins/index.js";
import { Hono } from "hono";
import type { PluginRegistry } from "../../modules/plugins/registry.js";
import { authentication } from "../../modules/identity/auth-policy.js";
import { collectionDisclosure } from "../../modules/collectors/disclosure.js";

export function registerDiscoveryRoutes(
  app: Hono<AppEnv>,
  registry: PluginRegistry,
) {
  app.get("/healthz", async (c) => {
    await c.env.repository.health();
    return c.json({ status: "ok" });
  });
  app.get("/.well-known/melted", async (c) => {
    const manifest = await collectionDisclosure(
      pluginConfiguration(c.env.config),
      registry,
    );
    return c.json({
      protocol: { min: 1, max: 1 },
      server_id: c.env.config.serverID,
      api_base: "/v1",
      registration: c.env.config.registration,
      operator: { name: c.env.config.operator },
      auth: authentication(c.env.config),
      capabilities: {
        input: [],
        plugin_settings: 1,
        collectors: manifest.destinations.map((d) => d.id),
        subject_pull: false,
        html_static: false,
        push: [],
        reading: true,
        taxonomy: true,
        changes: true,
        snapshot_sync: false,
      },
      processing_manifest_version: manifest.version,
    });
  });
  app.get("/.well-known/melted/processing", async (c) =>
    c.json(
      await collectionDisclosure(pluginConfiguration(c.env.config), registry),
    ),
  );
}
