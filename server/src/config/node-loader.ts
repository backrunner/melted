// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "js-yaml";

export interface ServerConfig {
  authentication?: unknown;
  plugins?: unknown;
  server: {
    id: string;
    operator: string;
    public_origin: string;
    host: string;
    port: number;
  };
  registration: {
    mode: "key" | "closed";
  };
  database: {
    url: string;
    pool?: {
      min: number;
      max: number;
    };
  };
  development?: {
    debug?: boolean;
  };
  oidc?: {
    issuer: string;
    client_id: string;
    client_secret: string;
  };
  rate_limit?: {
    requests_per_minute: number;
    burst: number;
  };
}

/**
 * Load configuration from YAML file
 * Looks for config.yaml in the following locations:
 * 1. CONFIG_PATH environment variable
 * 2. ./config.local.yaml (local override)
 * 3. ./config.yaml (current directory)
 * Without a file, the deployment can use environment variables alone.
 */
export function loadConfig(
  env: Record<string, string | undefined> = process.env,
  cwd = process.cwd(),
): ServerConfig | undefined {
  const configPaths = env.CONFIG_PATH
    ? [resolve(cwd, env.CONFIG_PATH)]
    : [resolve(cwd, "config.local.yaml"), resolve(cwd, "config.yaml")];
  if (env.CONFIG_PATH && !existsSync(resolve(cwd, env.CONFIG_PATH))) {
    throw new Error("The configured CONFIG_PATH file does not exist");
  }

  for (const configPath of configPaths) {
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, "utf8");
        const config = load(content) as ServerConfig;

        // Validate required fields
        validateConfig(config, configPath);

        if (config.development?.debug) {
          console.log(`Loaded configuration from: ${configPath}`);
        }

        return config;
      } catch {
        // YAML parser errors may include source excerpts containing credential hashes.
        throw new Error(
          `Unable to load server configuration from ${configPath}; check syntax and required fields`,
        );
      }
    }
  }

  return undefined;
}

export function nodeEnvironment(
  env: Record<string, string | undefined> = process.env,
  cwd = process.cwd(),
): Record<string, string | undefined> {
  const config = loadConfig(env, cwd);
  return { ...(config ? configToEnv(config) : {}), ...env };
}

function validateConfig(
  config: any,
  path: string,
): asserts config is ServerConfig {
  const required = [
    "server.id",
    "server.operator",
    "server.public_origin",
    "server.host",
    "server.port",
    "registration.mode",
    "database.url",
  ];

  for (const field of required) {
    const parts = field.split(".");
    let value: any = config;
    for (const part of parts) {
      value = value?.[part];
    }

    if (value === undefined || value === null || value === "") {
      throw new Error(
        `Missing required configuration field '${field}' in ${path}`,
      );
    }
  }

  // Validate public_origin format
  try {
    const url = new URL(config.server.public_origin);
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("public_origin must use http:// or https://");
    }
  } catch (error) {
    throw new Error(
      `Invalid server.public_origin: ${config.server.public_origin} - ${error}`,
    );
  }

  // Validate registration mode
  if (!["key", "closed"].includes(config.registration.mode)) {
    throw new Error(
      `Invalid registration.mode: ${config.registration.mode} (must be 'key' or 'closed')`,
    );
  }

  // Validate database URL format
  if (!/^postgres(?:ql)?:\/\//.test(config.database.url)) {
    throw new Error(
      "Invalid database.url: must start with postgres:// or postgresql://",
    );
  }
}

/**
 * Normalize YAML and environment configuration through one validation path.
 */
export function configToEnv(config: ServerConfig): Record<string, string> {
  return {
    MELTED_SERVER_ID: config.server.id,
    MELTED_OPERATOR: config.server.operator,
    PUBLIC_ORIGIN: config.server.public_origin,
    HOST: config.server.host,
    PORT: config.server.port.toString(),
    REGISTRATION_MODE: config.registration.mode,
    DATABASE_URL: config.database.url,
    ...(config.plugins !== undefined
      ? { PLUGIN_CONFIG: JSON.stringify(config.plugins) }
      : {}),
    ...(config.authentication !== undefined
      ? { AUTH_CONFIG: JSON.stringify(config.authentication) }
      : {}),
    ...(config.oidc && {
      OIDC_ISSUER: config.oidc.issuer,
      OIDC_CLIENT_ID: config.oidc.client_id,
      OIDC_CLIENT_SECRET: config.oidc.client_secret,
    }),
  };
}
