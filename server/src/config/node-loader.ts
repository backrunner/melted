import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "js-yaml";

export interface ServerConfig {
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
    samples?: boolean;
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
 * 2. ./config.yaml (current directory)
 * 3. ./config.local.yaml (local override)
 */
export function loadConfig(): ServerConfig {
  const configPaths = [
    process.env.CONFIG_PATH,
    resolve(process.cwd(), "config.local.yaml"),
    resolve(process.cwd(), "config.yaml"),
  ].filter((p): p is string => !!p);

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
      } catch (error) {
        console.error(`Failed to load config from ${configPath}:`, error);
        throw error;
      }
    }
  }

  throw new Error(
    "No configuration file found. Please create config.yaml or set CONFIG_PATH environment variable.",
  );
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
  if (!config.database.url.startsWith("postgresql://")) {
    throw new Error(
      `Invalid database.url: must start with postgresql:// (got: ${config.database.url})`,
    );
  }
}

/**
 * Convert YAML config to environment variables format (for backward compatibility)
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
    DEVELOPMENT_SAMPLES: config.development?.samples ? "true" : "false",
    ...(config.oidc && {
      OIDC_ISSUER: config.oidc.issuer,
      OIDC_CLIENT_ID: config.oidc.client_id,
      OIDC_CLIENT_SECRET: config.oidc.client_secret,
    }),
  };
}
