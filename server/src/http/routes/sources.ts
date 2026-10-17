// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import type { Hono } from "hono";
import type { AppEnv } from "../context.js";
import { Problem } from "../../shared/problem.js";
import {
  idempotencyKey,
  pageLimit,
  sourceReference,
} from "../../modules/sources/schemas.js";
import { publicRun, publicSource } from "../../modules/sources/lifecycle.js";
import type { PluginRegistry } from "../../modules/plugins/registry.js";
import { pluginConfiguration } from "../../plugins/index.js";
import { PluginService } from "../../modules/plugins/service.js";

export function registerSourceRoutes(
  app: Hono<AppEnv>,
  registry: PluginRegistry,
) {
  app.get("/v1/plugins", (c) =>
    c.json(registry.catalog(pluginConfiguration(c.env.config))),
  );
  app.get("/v1/plugins/:id", (c) => {
    const plugin = registry
      .catalog(pluginConfiguration(c.env.config))
      .plugins.find((p) => p.id === c.req.param("id"));
    if (!plugin) throw new Problem(404, "plugin_not_found");
    return c.json(plugin);
  });
  app.get("/v1/sources", async (c) =>
    c.json({
      sources: (
        await c.env.repository.sources.list(c.get("principal").owner)
      ).map(publicSource),
    }),
  );
  app.post("/v1/sources", async (c) => {
    const value = await c.req.json();
    const input = new PluginService(
      registry,
      pluginConfiguration(c.env.config),
    ).create(value);
    const source = await c.env.repository.sources.create(
      c.get("principal").owner,
      input,
      idempotencyKey(c.req.header("Idempotency-Key")),
    );
    return c.json(publicSource(source), 201);
  });
  app.get("/v1/sources/:id", async (c) => {
    const source = await c.env.repository.sources.get(
      c.get("principal").owner,
      sourceReference(c.req.param("id")),
    );
    c.header("ETag", `"${source.version}"`);
    return c.json(publicSource(source));
  });
  app.patch("/v1/sources/:id", async (c) => {
    const old = await c.env.repository.sources.get(
      c.get("principal").owner,
      sourceReference(c.req.param("id")),
    );
    const input = new PluginService(
      registry,
      pluginConfiguration(c.env.config),
    ).patch(old, await c.req.json());
    return c.json(
      publicSource(
        await c.env.repository.sources.patch(
          c.get("principal").owner,
          sourceReference(c.req.param("id")),
          input,
        ),
      ),
    );
  });
  app.delete("/v1/sources/:id", async (c) => {
    const match = c.req.header("If-Match");
    if (
      !match ||
      !/^"[1-9][0-9]*"$/.test(match) ||
      !Number.isSafeInteger(Number(match.slice(1, -1)))
    )
      throw new Problem(400, "expected_version_required");
    await c.env.repository.sources.remove(
      c.get("principal").owner,
      sourceReference(c.req.param("id")),
      Number(match.slice(1, -1)),
    );
    return c.body(null, 204);
  });
  app.post("/v1/sources/:id/sync", async (c) => {
    const owner = c.get("principal").owner,
      source = await c.env.repository.sources.get(
        owner,
        sourceReference(c.req.param("id")),
      );
    const plugin = new PluginService(
      registry,
      pluginConfiguration(c.env.config),
    ).resolve(source);
    plugin.validate(source.configuration);
    await c.env.repository.limit("source-sync:" + owner, 60);
    const run = await c.env.repository.sources.sync(
      owner,
      source.id,
      idempotencyKey(c.req.header("Idempotency-Key")),
    );
    return c.json(
      {
        receipt_id: run.id,
        status_url: `/v1/receipts/${run.id}`,
        status: run.state,
      },
      202,
    );
  });
  app.post("/v1/sources/:id/actions/:action", async (c) => {
    const owner = c.get("principal").owner;
    const source = await c.env.repository.sources.get(
      owner,
      sourceReference(c.req.param("id")),
    );
    await c.env.repository.limit("source-action:" + owner, 60);
    const result = await new PluginService(
      registry,
      pluginConfiguration(c.env.config),
    ).action(
      c.env.repository.sources,
      owner,
      source,
      sourceReference(c.req.param("action")),
      await c.req.json(),
      idempotencyKey(c.req.header("Idempotency-Key")),
    );
    return c.json(result, result.status === "accepted" ? 202 : 200);
  });
  app.get("/v1/receipts/:id", async (c) =>
    c.json(
      publicRun(
        await c.env.repository.sources.receipt(
          c.get("principal").owner,
          sourceReference(c.req.param("id")),
        ),
      ),
    ),
  );
  app.get("/v1/sources/:id/items", async (c) => {
    const page = await c.env.repository.sources.items(
      c.get("principal").owner,
      sourceReference(c.req.param("id")),
      c.req.query("cursor") === undefined
        ? null
        : sourceReference(c.req.query("cursor")!),
      pageLimit(Number(c.req.query("limit") ?? 30)),
    );
    return c.json({
      items: page.items,
      next_cursor: page.next_cursor,
    });
  });
  app.get("/v1/raw-items/:id", async (c) => {
    const v = c.req.query("revision"),
      revision = v === undefined ? undefined : Number(v);
    if (
      revision !== undefined &&
      (!Number.isSafeInteger(revision) || revision < 1)
    )
      throw new Problem(400, "invalid_revision");
    return c.json(
      await c.env.repository.sources.raw(
        c.get("principal").owner,
        sourceReference(c.req.param("id")),
        revision,
      ),
    );
  });
}
