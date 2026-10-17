// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { writeFile, readFile } from "node:fs/promises";
import { z } from "zod";
import {
  catalogSchema,
  publicDescriptorSchema,
  configurationSchema,
} from "../src/modules/plugins/dsl.js";
import { actionRequestSchema } from "../src/modules/plugins/service.js";
import {
  sourceInputSchema,
  sourcePatchSchema,
} from "../src/modules/sources/schemas.js";
import { pluginRegistry } from "../src/plugins/index.js";
const root = new URL("../../contracts/", import.meta.url);
const save = (path: string, value: unknown) =>
  writeFile(new URL(path, root), JSON.stringify(value, null, 2) + "\n");
const catalog = pluginRegistry.catalog({
  rsshub: {
    base_url: "https://feeds.example.org",
    allowed_routes: ["/bbc", "/douban/book/latest"],
  },
});
await save("plugin-settings.schema.json", z.toJSONSchema(catalogSchema));
await save("fixtures/plugin-settings.json", catalog);
const source = {
  id: "src_example",
  plugin: "rsshub",
  config_version: 1,
  configuration: { route: "/bbc/world-asia" },
  name: "世界新闻",
  enabled: true,
  interval_seconds: 900,
  version: 1,
  blocked: false,
  last_success_at: null,
  last_run_id: null,
  last_error: null,
};
await save("fixtures/plugin-source.json", source);
const openapi = JSON.parse(
  await readFile(new URL("openapi.json", root), "utf8"),
);
const schemas = openapi.components.schemas;
const jsonSchema = (schema: z.ZodType) => {
  const { $schema: _, ...rest } = z.toJSONSchema(schema);
  return rest;
};
schemas.PluginCatalog = jsonSchema(catalogSchema);
schemas.PluginDescriptor = jsonSchema(publicDescriptorSchema);
schemas.PluginConfiguration = jsonSchema(configurationSchema);
schemas.PluginActionRequest = jsonSchema(actionRequestSchema);
schemas.PluginActionResult = {
  oneOf: [
    {
      type: "object",
      properties: {
        status: { const: "accepted" },
        receipt_id: { type: "string" },
      },
      required: ["status", "receipt_id"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        status: { const: "complete" },
        message: { type: "string" },
      },
      required: ["status", "message"],
      additionalProperties: false,
    },
  ],
};
schemas.SourceInput = z.toJSONSchema(sourceInputSchema, { io: "input" });
schemas.SourcePatch = z.toJSONSchema(sourcePatchSchema, { io: "input" });
schemas.Discovery.properties.capabilities.properties.plugin_settings = {
  type: "integer",
  const: 1,
  description:
    "Versioned native plugin settings catalog available after authentication.",
};
schemas.Discovery.properties.auth.required = ["version", "methods"];
schemas.Discovery.properties.auth.properties.version.description =
  "Authentication contract version; unknown versions must not submit credentials.";
const error = {
  description: "Structured error",
  content: {
    "application/json": { schema: { $ref: "#/components/schemas/Error" } },
  },
};
const response = (name: string) => ({
  description: "Success",
  content: {
    "application/json": { schema: { $ref: "#/components/schemas/" + name } },
  },
});
const path = (name: string) => ({
  name,
  in: "path",
  required: true,
  schema: { type: "string", maxLength: 128 },
});
openapi.paths["/v1/plugins"] = {
  get: {
    operationId: "listPlugins",
    summary:
      "List installed plugins and finite settings DSL; no operator secrets",
    responses: { "200": response("PluginCatalog"), default: error },
  },
};
openapi.paths["/v1/plugins/{id}"] = {
  get: {
    operationId: "getPlugin",
    summary: "Read one installed plugin descriptor and availability",
    parameters: [path("id")],
    responses: { "200": response("PluginDescriptor"), default: error },
  },
};
openapi.paths["/v1/sources/{id}/actions/{action}"] = {
  post: {
    operationId: "performSourceAction",
    summary:
      "Invoke a declared action with plugin/source version checks; collect actions return a durable receipt",
    parameters: [
      path("id"),
      path("action"),
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
          schema: { $ref: "#/components/schemas/PluginActionRequest" },
        },
      },
    },
    responses: {
      "200": response("PluginActionResult"),
      "202": response("PluginActionResult"),
      default: error,
    },
  },
};
await save("openapi.json", openapi);
const briefing = JSON.parse(
  await readFile(new URL("briefing.schema.json", root), "utf8"),
);
briefing.components.schemas.Discovery = schemas.Discovery;
await save("briefing.schema.json", briefing);
