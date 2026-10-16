// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { serve } from "@hono/node-server";
import { createApp } from "../http/app.js";
import { configFromEnv } from "../config/schema.js";
import { Problem } from "../shared/problem.js";
import { connect } from "../storage/postgres/connection.js";
import { PostgresRepository } from "../storage/postgres/repository.js";
import { nodeEnvironment } from "../config/node-loader.js";

// Compose and Apple Container use environment variables; YAML is optional.
// Explicit environment values take precedence over a local configuration file.
Object.assign(process.env, nodeEnvironment());

const config = configFromEnv(process.env);
const { database, pool } = connect();
const repository = new PostgresRepository(database);
await repository.health();
const app = createApp();
const server = serve(
  {
    port: Number(process.env.PORT ?? 8421),
    hostname: process.env.HOST ?? "0.0.0.0",
    fetch: async (request, context) => {
      // Forwarded headers are deliberately not trusted. Terminating proxies should
      // enforce their own edge rate limits; the application uses the socket peer.
      const remoteIP = context.incoming.socket.remoteAddress ?? "unknown";
      try {
        await repository.limit("request:" + remoteIP, 600);
      } catch (error) {
        if (error instanceof Problem)
          return Response.json(
            { code: error.code, retryable: true },
            { status: error.status, headers: { "Retry-After": "60" } },
          );
        throw error;
      }
      return app.fetch(request, { repository, config, remoteIP });
    },
  },
  () => console.log("Melted API ready"),
);
const maintenance = setInterval(() => {
  void repository
    .maintenance()
    .catch(() => console.error("Maintenance unavailable"));
}, 60_000);
maintenance.unref();
let closing = false;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    if (closing) return;
    closing = true;
    clearInterval(maintenance);
    const deadline = setTimeout(() => process.exit(1), 15000);
    deadline.unref();
    server.close(() => {
      void pool.end().then(() => {
        clearTimeout(deadline);
        process.exit(0);
      });
    });
  });
