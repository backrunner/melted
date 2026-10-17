// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { nodeEnvironment } from "../../src/config/node-loader.js";
import { configFromEnv } from "../../src/config/schema.js";
import {
  pluginConfiguration,
  pluginRegistry,
} from "../../src/plugins/index.js";

test("plugin configuration keeps the RSSHub secret on the server", () => {
  const configured = configFromEnv({
    MELTED_SERVER_ID: "test",
    PUBLIC_ORIGIN: "https://melted.example.com",
    PLUGIN_CONFIG: JSON.stringify({
      rsshub: { base_url: "https://new.example.com", allowed_routes: ["/bbc"] },
    }),
    RSSHUB_ACCESS_KEY: "server-only-secret",
  });
  const operator = pluginConfiguration(configured);
  assert.equal(
    (operator.rsshub as { access_key: string }).access_key,
    "server-only-secret",
  );
  assert.equal(
    pluginRegistry.resolve("rsshub", operator).destination.origin,
    "https://new.example.com",
  );
  assert.equal(
    JSON.stringify(pluginRegistry.catalog(operator)).includes(
      "server-only-secret",
    ),
    false,
  );
});

test("clean deployments run from environment without an untracked YAML file", () => {
  const cwd = mkdtempSync(join(tmpdir(), "melted-env-"));
  try {
    const env = {
      MELTED_SERVER_ID: "clean",
      PUBLIC_ORIGIN: "https://melted.example.com",
      DATABASE_URL: "postgres://test:example@localhost/test",
    };
    assert.deepEqual(nodeEnvironment(env, cwd), env);
    assert.equal(configFromEnv(nodeEnvironment(env, cwd)).serverID, "clean");
    assert.throws(
      () => nodeEnvironment({ ...env, CONFIG_PATH: "missing.yaml" }, cwd),
      /CONFIG_PATH/,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("deployment environment overrides YAML defaults and local file wins over base file", () => {
  const cwd = mkdtempSync(join(tmpdir(), "melted-yaml-"));
  const config = (id: string) =>
    JSON.stringify({
      server: {
        id,
        operator: "Example",
        public_origin: "https://melted.example.com",
        host: "127.0.0.1",
        port: 8421,
      },
      registration: { mode: "closed" },
      database: { url: "postgres://test:example@localhost/test" },
      development: { debug: true },
    });
  try {
    writeFileSync(join(cwd, "config.yaml"), config("base"));
    writeFileSync(join(cwd, "config.local.yaml"), config("local"));
    assert.equal(nodeEnvironment({}, cwd).MELTED_SERVER_ID, "local");
    const result = nodeEnvironment(
      {
        MELTED_SERVER_ID: "deployment",
        HOST: "0.0.0.0",
        PORT: "9000",
        MELTED_OPERATOR: "Deployment",
      },
      cwd,
    );
    assert.equal(result.MELTED_SERVER_ID, "deployment");
    assert.equal(result.HOST, "0.0.0.0");
    assert.equal(result.PORT, "9000");
    assert.equal(result.MELTED_OPERATOR, "Deployment");
    assert.equal(result.REGISTRATION_MODE, "closed");
    assert.equal(
      nodeEnvironment({ CONFIG_PATH: "config.yaml" }, cwd).MELTED_SERVER_ID,
      "base",
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("authentication policy rejects unavailable methods and ambiguous identities", () => {
  const base = {
    MELTED_SERVER_ID: "test",
    PUBLIC_ORIGIN: "https://melted.example.com",
  };
  for (const policy of [
    { methods: [] },
    { methods: ["future"] },
    { methods: ["key", "key"] },
    { methods: ["password"] },
    { methods: ["api_key"] },
    { methods: ["browser"] },
    { methods: ["key"], preferred: "password" },
    { methods: ["key"], accounts: [{ subject: "a", username: "alice" }] },
    {
      methods: ["api_key"],
      accounts: [
        { subject: "a", api_key_hashes: ["a".repeat(64)] },
        { subject: "b", api_key_hashes: ["a".repeat(64)] },
      ],
    },
  ])
    assert.throws(() =>
      configFromEnv({ ...base, AUTH_CONFIG: JSON.stringify(policy) }),
    );
  assert.throws(
    () => configFromEnv({ ...base, AUTH_CONFIG: "secret-not-json" }),
    (error) =>
      error instanceof Error && !error.message.includes("secret-not-json"),
  );
  assert.throws(() => configFromEnv({ ...base, AUTH_CONFIG: "" }));
  const configured = configFromEnv({
    ...base,
    AUTH_CONFIG: JSON.stringify({
      methods: ["api_key"],
      accounts: [{ subject: "alice", api_key_hashes: ["a".repeat(64)] }],
    }),
  });
  assert.deepEqual(configured.authentication?.methods, ["api_key"]);
});
