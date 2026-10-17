// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import type { Hono } from "hono";
import type { AppEnv } from "../context.js";
import { parse } from "../../shared/validation.js";
import { Problem } from "../../shared/problem.js";
import {
  authorizeRoute,
  idempotencyKey,
  sourceInputSchema,
  sourcePatchSchema,
  pageLimit,
  sourceReference,
} from "../../modules/sources/schemas.js";
import { publicRun, publicSource } from "../../modules/sources/lifecycle.js";
import { collectorEnabled } from "../../modules/plugins/registry.js";

export function registerSourceRoutes(app: Hono<AppEnv>) {
  const enabled = () => {
    if (!collectorEnabled()) throw new Problem(503, "collector_unconfigured");
  };
  app.get("/v1/sources", async (c) =>
    c.json({
      sources: (
        await c.env.repository.sources.list(c.get("principal").owner)
      ).map(publicSource),
    }),
  );
  app.post("/v1/sources", async (c) => {
    enabled();
    const input = parse(sourceInputSchema, await c.req.json());
    authorizeRoute(c.env.config.rsshub, input.route);
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
    const input = parse(sourcePatchSchema, await c.req.json());
    if (input.route !== undefined || input.enabled === true) {
      enabled();
      const old = await c.env.repository.sources.get(
        c.get("principal").owner,
        sourceReference(c.req.param("id")),
      );
      authorizeRoute(c.env.config.rsshub, input.route ?? old.route);
    }
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
    enabled();
    const owner = c.get("principal").owner,
      source = await c.env.repository.sources.get(
        owner,
        sourceReference(c.req.param("id")),
      );
    authorizeRoute(c.env.config.rsshub, source.route);
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
