// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import {
  settingsCatalog,
  settingsCatalogFor,
  settingsCatalogSchema,
  settingsMutationSchema,
  settingsStateSchema,
  emptySettings,
} from "../src/modules/settings/dsl.js";

import {
  processingStatusSchema,
  processingActionSchema,
  processingJobsSchema,
} from "../src/modules/processing/types.js";
import { processingConfigSchema } from "../src/modules/processing/config.js";

import { configSchema } from "../src/config/schema.js";
import { credentialSection } from "../src/modules/settings/credentials-dsl.js";
import {
  credentialMutationSchema,
  credentialStatusSchema,
} from "../src/modules/processing/credentials.js";

const root = new URL("../../contracts/", import.meta.url);
const save = (name: string, value: unknown) =>
  writeFile(new URL(name, root), JSON.stringify(value, null, 2) + "\n");
await save("fixtures/server-settings.json", settingsCatalog);
await save(
  "fixtures/server-settings-processing.json",
  await settingsCatalogFor(
    processingConfigSchema.parse({
      generator: {
        endpoint: "https://generator.example/v1/chat/completions",
        model: "example-model",
        api_key: "not-in-fixture",
      },
      decision: { api_key: "not-in-fixture" },
    }),
  ),
);
await save("fixtures/server-processing-status.json", {
  configured: true,
  version: 1,
  phase: "ready",
  preview: [
    { label: "分类", value: "文化：阅读、艺术与公共文化活动" },
    { label: "输出", value: "简体中文，简洁短文，保留来源和不确定性" },
  ],
  jobs: {
    queued: 0,
    running: 0,
    failed: 0,
    published: 0,
    filtered: 0,
    held: 0,
  },
  reserved_calls: 1,
  daily_call_limit: 60,
});
await save("fixtures/server-settings-state.json", emptySettings("preferences"));
await save(
  "server-settings.schema.json",
  z.toJSONSchema(settingsCatalogSchema),
);
for (const mode of ["byok", "shared"] as const) {
  const config = configSchema.parse({
    serverID: "example",
    operator: "Example",
    publicOrigin: "https://melted.example",
    processingSealKey: "1".repeat(64),
    processing: {
      generator: {
        endpoint: "https://generator.example/v1/chat/completions",
        model: "example-model",
      },
      decision: {},
      credentials: { mode, administrators: ["acc_" + "1".repeat(64)] },
    },
  });
  await save("fixtures/server-settings-credentials-" + mode + ".json", {
    ...settingsCatalog,
    credentials: [credentialSection(config, "acc_" + "1".repeat(64))],
  });
}
const api = JSON.parse(await readFile(new URL("openapi.json", root), "utf8"));
api.info.description =
  "Implemented development subset of protocol v1: identity, reading, trusted collector plugins and raw ingestion; optional explicit preference compilation, classification/tagging, filtering and source-faithful text generation after confirmation. Server-controlled operator/BYOK/admin-shared credential modes use a finite write-only settings DSL. Public general ingest, multimodal processing, external corroboration, learning and full snapshot sync remain unimplemented. List bodies/evidence are empty; fetch detail. Times are UTC RFC3339. Search is literal substring.";
const schemas = api.components.schemas;
for (const [name, schema] of Object.entries({
  ServerSettingsCatalog: settingsCatalogSchema,
  ServerSettingsState: settingsStateSchema,
  ServerSettingsMutation: settingsMutationSchema,
  ProcessingStatus: processingStatusSchema,
  ProcessingAction: processingActionSchema,
  ProcessingJobs: processingJobsSchema,
  CredentialMutation: credentialMutationSchema,
  CredentialStatus: credentialStatusSchema,
})) {
  const { $schema: _, ...value } = z.toJSONSchema(schema);
  schemas[name] = value;
}
schemas.Discovery.properties.capabilities.properties.server_settings = {
  type: "integer",
  const: 1,
  description: "Finite server-owned settings DSL; absent means unavailable.",
};
const response = (name: string) => ({
  description: "Success",
  content: {
    "application/json": { schema: { $ref: "#/components/schemas/" + name } },
  },
});
const error = {
  description: "Structured error",
  content: {
    "application/json": { schema: { $ref: "#/components/schemas/Error" } },
  },
};
api.paths["/v1/settings"] = {
  get: {
    operationId: "getServerSettingsCatalog",
    summary: "Read versioned native forms and finite request descriptors",
    responses: { "200": response("ServerSettingsCatalog"), default: error },
  },
};
api.paths["/v1/settings/{section}"] = {
  parameters: [
    {
      name: "section",
      in: "path",
      required: true,
      schema: {
        type: "string",
        enum: settingsCatalog.sections.map((s) => s.id),
      },
    },
  ],
  get: {
    operationId: "getServerSettings",
    summary: "Read owner-scoped settings and revision",
    responses: { "200": response("ServerSettingsState"), default: error },
  },
  put: {
    operationId: "saveServerSettings",
    summary:
      "Store explicit preferences with optimistic versioning and idempotency; no automatic processing",
    parameters: [
      {
        name: "Idempotency-Key",
        in: "header",
        required: true,
        schema: { type: "string", pattern: "^[A-Za-z0-9._:-]{1,128}$" },
      },
    ],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ServerSettingsMutation" },
        },
      },
    },
    responses: { "200": response("ServerSettingsState"), default: error },
  },
};
api.paths["/v1/settings/preferences/processing"] = {
  get: {
    operationId: "getPreferenceProcessing",
    summary: "Read compiled draft, activation, job counts and reserved budget",
    responses: { "200": response("ProcessingStatus"), default: error },
  },
};
api.paths["/v1/settings/preferences/{action}"] = {
  parameters: [
    {
      name: "action",
      in: "path",
      required: true,
      schema: { type: "string", enum: ["compile", "activate", "reprocess"] },
    },
  ],
  post: {
    operationId: "actOnPreferenceProcessing",
    summary:
      "Explicitly consent to compilation, activate a draft or retry failed items",
    parameters: api.paths["/v1/settings/{section}"].put.parameters,
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ProcessingAction" },
        },
      },
    },
    responses: { "200": response("ProcessingStatus"), default: error },
  },
};
api.paths["/v1/processing/jobs"] = {
  get: {
    operationId: "listProcessingJobs",
    summary:
      "Read at most 50 recent owner-scoped processing jobs and model usage",
    responses: { "200": response("ProcessingJobs"), default: error },
  },
};
schemas.Discovery.properties.capabilities.properties.automatic_organization = {
  type: "integer",
  const: 1,
  description:
    "Optional configured processing model capability; explicit activation required.",
};
api.paths["/v1/settings/credentials/{scope}"] = {
  parameters: [
    {
      name: "scope",
      in: "path",
      required: true,
      schema: { type: "string", enum: ["account", "server"] },
    },
  ],
  get: {
    operationId: "getCredentialStatus",
    summary:
      "Read configured flags only; BYOK owner or explicit server administrator required",
    responses: { "200": response("CredentialStatus"), default: error },
  },
  post: {
    operationId: "saveModelCredentials",
    summary:
      "Versioned write-only secrets: absent keeps, null clears, string replaces; server decides permitted scope",
    parameters: api.paths["/v1/settings/{section}"].put.parameters,
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/CredentialMutation" },
        },
      },
    },
    responses: { "200": response("CredentialStatus"), default: error },
  },
};
await save("openapi.json", api);
const briefing = JSON.parse(
  await readFile(new URL("briefing.schema.json", root), "utf8"),
);
briefing.components.schemas.Discovery = schemas.Discovery;
await save("briefing.schema.json", briefing);
