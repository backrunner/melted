// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from "node:test";
import assert from "node:assert/strict";
import {
  descriptorSchema,
  formSchema,
  validateSettings,
} from "../../src/modules/plugins/dsl.js";
import { PluginRegistry } from "../../src/modules/plugins/registry.js";
import { manifestSchema } from "../../src/modules/plugins/compatibility.js";
import { PluginService } from "../../src/modules/plugins/service.js";
import type { CollectorPlugin } from "../../src/modules/plugins/definition.js";
import {
  newSource,
  newRun,
  patchSource,
} from "../../src/modules/sources/lifecycle.js";
import { executeClaim } from "../../src/modules/jobs/execute.js";
import type {
  PollResult,
  SourceRepository,
} from "../../src/modules/sources/types.js";
import { normalizeFeed } from "../../src/plugins/rsshub/json-feed.js";
import { validateResult } from "../../src/modules/ingest/result.js";
import fixture from "../../../contracts/fixtures/rsshub-feed.json" with { type: "json" };

const plugin: CollectorPlugin = {
  manifest: manifestSchema.parse({
    id: "example.culture",
    version: "2.0.0",
    runtime: "builtin",
    targets: ["node", "cloudflare"],
    capabilities: [],
  }),
  descriptor: descriptorSchema.parse({
    dsl_version: 1,
    id: "example.culture",
    version: "2.0.0",
    config_version: 1,
    kind: "collector",
    capabilities: ["collector.poll"],
    collection: {
      layout: "list",
      title: "主题",
      columns: [
        { scope: "configuration", field: "topic", label: "文化主题" },
        { scope: "source", field: "enabled", label: "启停" },
      ],
      add_from_suggestions: { field: "topic", maximum: 10 },
    },
    title: "文化资料",
    description: "A separate collector with no RSSHub route",
    form: {
      fields: [
        { id: "topic", label: "主题", type: "text", max_length: 100 },
        {
          id: "count",
          label: "数量",
          type: "integer",
          minimum: 1,
          maximum: 10,
          default: 3,
        },
        { id: "include_notes", label: "说明", type: "boolean", default: false },
        {
          id: "region",
          label: "地区",
          type: "select",
          options: [{ value: "all", label: "全部" }],
          default: "all",
        },
      ],
    },
    actions: [
      {
        id: "refresh",
        label: "获取",
        description: "Collect",
        effect: "collect",
        input: { fields: [] },
      },
    ],
  }),
  configure() {
    return {
      descriptor: this.descriptor,
      destination: {
        id: this.descriptor.id,
        origin: "https://culture.example.org",
        purpose: "public_feed_collection",
        data_categories: ["topic"],
      },
      validate: (value) => validateSettings(this.descriptor.form, value),
      poll: async () => normalizeFeed(fixture),
    };
  },
  deploymentErrors: () => [],
};
const registry = new PluginRegistry([plugin], {
  plugins: [{ enabled: true, manifest: plugin.manifest }],
});
const operator = { "example.culture": {} };

test("a separately registered collector validates and executes without an RSSHub branch", async () => {
  const service = new PluginService(registry, operator);
  const input = service.create({
    plugin: plugin.manifest.id,
    config_version: 1,
    name: "Culture",
    configuration: { topic: "architecture" },
  });
  assert.equal(input.configuration.count, 3);
  assert.equal("route" in input, false);
  assert.equal(registry.catalog(operator).plugins[0]!.available, true);
  const source = newSource(input, Date.now()),
    run = newRun(source, "manual", "test", Date.now());
  let result: PollResult | undefined;
  const repository = {
    complete: async (_claim, value) => {
      result = value;
      return true;
    },
    fail: async () => {
      assert.fail("unexpected plugin failure");
    },
  } as Pick<SourceRepository, "complete" | "fail">;
  await executeClaim(
    repository as SourceRepository,
    { source, run, owner: "owner" },
    registry,
    operator,
  );
  assert.equal(result?.items.length, 3);
  assert.equal(result?.items[0]?.content.external_id, "culture-1");
});

test("DSL rejects execution directives, duplicate fields, unsupported controls and invalid scalar settings", () => {
  assert.equal(
    descriptorSchema.safeParse({
      ...plugin.descriptor,
      actions: [
        { ...plugin.descriptor.actions[0], input: plugin.descriptor.form },
      ],
    }).success,
    false,
  );
  assert.equal(
    formSchema.safeParse({
      fields: [
        { id: "script", type: "javascript", label: "Run", code: "fetch()" },
      ],
    }).success,
    false,
  );
  assert.equal(
    descriptorSchema.safeParse({
      ...plugin.descriptor,
      endpoint: "https://evil.invalid",
    }).success,
    false,
  );
  assert.equal(
    formSchema.safeParse({
      fields: [
        plugin.descriptor.form.fields[0],
        plugin.descriptor.form.fields[0],
      ],
    }).success,
    false,
  );
  assert.throws(
    () =>
      validateSettings(plugin.descriptor.form, { topic: "x", unknown: true }),
    /unknown_plugin_field/,
  );
  assert.throws(
    () => validateSettings(plugin.descriptor.form, { topic: "x", count: 99 }),
    /invalid_plugin_field/,
  );
  assert.throws(
    () =>
      validateSettings(plugin.descriptor.form, { topic: "x", region: "other" }),
    /invalid_plugin_field/,
  );
  assert.throws(
    () => validateSettings(plugin.descriptor.form, { topic: { nested: true } }),
    /invalid_plugin_settings/,
  );
  assert.throws(
    () => new PluginRegistry([plugin, plugin], { plugins: [] }),
    /identity/,
  );
});

test("collection DSL validates row references and batch controls without executing expressions", () => {
  assert.ok(descriptorSchema.safeParse(plugin.descriptor).success);
  const column = { scope: "source", field: "name", label: "名称" };
  for (const collection of [
    { layout: "html", title: "Items", columns: [column] },
    { layout: "table", title: "Items", columns: [column, column] },
    {
      layout: "table",
      title: "Items",
      columns: [{ scope: "configuration", field: "missing", label: "Missing" }],
    },
    {
      layout: "table",
      title: "Items",
      columns: [{ ...column, endpoint: "https://evil.invalid" }],
    },
    {
      layout: "table",
      title: "Items",
      columns: [column],
      add_from_suggestions: { field: "count", maximum: 10 },
    },
    {
      layout: "table",
      title: "Items",
      columns: [column],
      add_from_suggestions: { field: "topic", maximum: 1000 },
    },
  ])
    assert.equal(
      descriptorSchema.safeParse({ ...plugin.descriptor, collection }).success,
      false,
    );
});

test("actions reject stale descriptors, unknown operations and configuration versions", async () => {
  const service = new PluginService(registry, operator);
  const source = newSource(
    service.create({
      plugin: plugin.manifest.id,
      config_version: 1,
      name: "Culture",
      configuration: { topic: "a" },
    }),
    Date.now(),
  );
  const repository = {} as SourceRepository;
  await assert.rejects(
    service.action(
      repository,
      "owner",
      source,
      "refresh",
      { expected_version: 1, plugin_version: "old", input: {} },
      "key",
    ),
    /plugin_version_mismatch/,
  );
  await assert.rejects(
    service.action(
      repository,
      "owner",
      source,
      "unknown",
      { expected_version: 1, plugin_version: "2.0.0", input: {} },
      "key",
    ),
    /plugin_action_not_found/,
  );
  assert.throws(
    () =>
      service.create({
        plugin: plugin.manifest.id,
        config_version: 2,
        name: "Culture",
        configuration: { topic: "a" },
      }),
    /plugin_config_version_mismatch/,
  );
  assert.deepEqual(
    patchSource(
      source,
      {
        expected_version: 1,
        configuration: Object.fromEntries(
          Object.entries(source.configuration).reverse(),
        ),
      },
      Date.now(),
    ).checkpoint,
    source.checkpoint,
  );
});

test("unavailable plugins retain descriptors but cannot execute and never disclose operator secrets", () => {
  const catalog = registry.catalog({});
  assert.equal(catalog.plugins[0]!.available, false);
  assert.throws(
    () => registry.resolve(plugin.manifest.id, {}),
    /collector_unconfigured/,
  );
  assert.equal(
    JSON.stringify(
      registry.catalog({ "example.culture": { token: "secret-value" } }),
    ).includes("secret-value"),
    false,
  );
});

test("configured modules cannot change identity, disclose credential URLs or persist undeclared settings", () => {
  for (const change of [
    { descriptor: { ...plugin.descriptor, id: "another.plugin" } },
    { descriptor: { ...plugin.descriptor, version: "3.0.0" } },
    {
      destination: {
        ...plugin.configure({}).destination,
        origin: "https://user:secret@culture.example.org",
      },
    },
    {
      destination: {
        ...plugin.configure({}).destination,
        origin: "https://culture.example.org/?key=secret",
      },
    },
  ]) {
    const invalid: CollectorPlugin = {
      ...plugin,
      configure: () => ({ ...plugin.configure({}), ...change }),
    };
    const host = new PluginRegistry([invalid], {
      plugins: [{ enabled: true, manifest: plugin.manifest }],
    });
    assert.throws(
      () => host.resolve(plugin.manifest.id, operator),
      /plugin_configuration_invalid/,
    );
    assert.equal(
      JSON.stringify(host.catalog(operator)).includes("secret"),
      false,
    );
  }
  const invalid: CollectorPlugin = {
    ...plugin,
    configure: () => ({
      ...plugin.configure({}),
      validate: (value) => ({ ...value, unexpected: true }),
    }),
  };
  const host = new PluginRegistry([invalid], {
    plugins: [{ enabled: true, manifest: plugin.manifest }],
  });
  assert.throws(
    () =>
      new PluginService(host, operator).create({
        plugin: plugin.manifest.id,
        config_version: 1,
        name: "Culture",
        configuration: { topic: "a" },
      }),
    /unknown_plugin_field/,
  );
});

test("host rejects malformed output and recomputes storage identity supplied by a plugin", async () => {
  const output = await normalizeFeed(fixture);
  output.items[0]!.external_key = "forged-owner-key";
  output.items[0]!.content_hash = "forged-hash";
  const result = await validateResult(output);
  assert.notEqual(result.items[0]!.external_key, "forged-owner-key");
  assert.notEqual(result.items[0]!.content_hash, "forged-hash");
  await assert.rejects(
    validateResult({ ...output, owner: "another-account" }),
    /invalid_plugin_output/,
  );
  await assert.rejects(
    validateResult({ ...output, received: 999 }),
    /invalid_plugin_counts/,
  );
});

test("published plugin fixture and DSL schema match the installed registry", async () => {
  const { readFile } = await import("node:fs/promises");
  const { z } = await import("zod");
  const { catalogSchema } = await import("../../src/modules/plugins/dsl.js");
  const { pluginRegistry } = await import("../../src/plugins/index.js");
  const read = async (file: string) =>
    JSON.parse(
      await readFile(
        new URL("../../../contracts/" + file, import.meta.url),
        "utf8",
      ),
    );
  assert.deepEqual(
    await read("plugin-settings.schema.json"),
    z.toJSONSchema(catalogSchema),
  );
  const expected = pluginRegistry.catalog({
    rsshub: {
      base_url: "https://feeds.example.org",
      allowed_routes: ["/bbc", "/douban/book/latest"],
    },
  });
  assert.deepEqual(await read("fixtures/plugin-settings.json"), expected);
  assert.deepEqual(catalogSchema.parse(expected), expected);
});
