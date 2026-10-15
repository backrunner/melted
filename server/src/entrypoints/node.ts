import { serve } from "@hono/node-server";
import { createApp } from "../http/app.js";
import { configFromEnv } from "../config/schema.js";
import { Problem } from "../shared/problem.js";
import { connect } from "../storage/postgres/connection.js";
import { PostgresRepository } from "../storage/postgres/repository.js";
import { loadConfig, configToEnv } from "../config/node-loader.js";

// Load configuration from YAML file
const yamlConfig = loadConfig();
const envVars = configToEnv(yamlConfig);

// Merge with process.env for backward compatibility
Object.assign(process.env, envVars);

const config = configFromEnv(process.env);
const { database, pool } = connect();
const repository = new PostgresRepository(database);
await repository.health();
const app = createApp();
const server = serve(
  {
    port: yamlConfig.server.port,
    hostname: yamlConfig.server.host,
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
      return app.fetch(request, {
        repository,
        config,
        remoteIP,
        developmentSamples:
          yamlConfig.development?.samples === true &&
          new URL(config.publicOrigin).protocol === "http:",
      });
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
