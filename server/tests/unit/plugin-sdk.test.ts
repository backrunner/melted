// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, cp, symlink, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { scaffoldPlugin } from "../../scripts/new-plugin.js";
import { ExampleCollector } from "../../templates/collector/plugin.js";
import type { Operator, Settings } from "../../templates/collector/config.js";
import type { CollectorContext } from "../../src/modules/plugins/sdk/index.js";
import { PluginRegistry } from "../../src/modules/plugins/registry.js";
import { PluginService } from "../../src/modules/plugins/service.js";
import { newSource } from "../../src/modules/sources/lifecycle.js";
import {
  requestJSON,
  CollectorError,
} from "../../src/modules/plugins/sdk/index.js";

test("boilerplate generator is usable, validates IDs and never overwrites existing work", async () => {
  const root = await mkdtemp(join(tmpdir(), "melted-plugin-"));
  try {
    await mkdir(join(root, "src/plugins"), { recursive: true });
    await mkdir(join(root, "tests/unit"), { recursive: true });
    await cp("templates", join(root, "templates"), { recursive: true });
    await symlink(resolve("src/modules"), join(root, "src/modules"));
    await symlink(resolve("node_modules"), join(root, "node_modules"));
    const generated = await scaffoldPlugin("culture-notes", root);
    const module = await import(
      pathToFileURL(join(generated.directory, "plugin.ts")).href
    );
    assert.equal(module.examplePlugin.descriptor.id, "culture-notes");
    const original = await readFile(
      join(generated.directory, "plugin.ts"),
      "utf8",
    );
    await assert.rejects(scaffoldPlugin("culture-notes", root), /exists/);
    assert.equal(
      await readFile(join(generated.directory, "plugin.ts"), "utf8"),
      original,
    );
    for (const id of ["../escape", "a/b", "constructor", "A", ""])
      await assert.rejects(scaffoldPlugin(id, root));
    assert(
      (await readFile(generated.testFile, "utf8")).includes(
        "../../src/plugins/culture-notes/plugin.js",
      ),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("base collector participates in host validation without exposing source identity or operator secrets", async () => {
  let calls = 0;
  class ProbeCollector extends ExampleCollector {
    protected override collect(
      context: CollectorContext<Settings>,
      operator: Operator,
    ) {
      assert.deepEqual(Object.keys(context).sort(), [
        "checkpoint",
        "configuration",
        "signal",
      ]);
      assert(Object.isFrozen(context.configuration));
      assert(Object.isFrozen(context.checkpoint));
      return super.collect(context, operator);
    }
  }
  const plugin = new ProbeCollector(async () => {
    calls++;
    return Response.json({ items: [] });
  });
  const host = new PluginRegistry([plugin], {
    plugins: [{ enabled: true, manifest: plugin.manifest }],
  });
  const operator = {
    [plugin.descriptor.id]: {
      base_url: "https://feeds.example.org",
      allowed_topics: ["culture"],
      token: "private",
    },
  };
  const service = new PluginService(host, operator);
  assert.throws(
    () =>
      service.create({
        plugin: plugin.descriptor.id,
        config_version: 1,
        name: "No",
        configuration: { topic: "unknown" },
      }),
    /topic_not_allowed/,
  );
  assert.equal(calls, 0);
  const source = newSource(
    service.create({
      plugin: plugin.descriptor.id,
      config_version: 1,
      name: "Notes",
      configuration: { topic: "culture" },
    }),
    Date.now(),
  );
  const collector = host.resolve(plugin.descriptor.id, operator);
  const output = await collector.poll(source);
  assert.equal(output.received, 0);
  assert.equal(output.not_modified, false);
  await assert.rejects(
    collector.poll({ ...source, plugin: "different" }),
    /plugin_config_version_mismatch/,
  );
  await assert.rejects(
    collector.poll({ ...source, config_version: 2 }),
    /plugin_config_version_mismatch/,
  );
  assert.equal(calls, 1);
  assert(!JSON.stringify(host.catalog(operator)).includes("private"));
});

test("SDK request transport bounds data, redacts failures and classifies redirect/rate-limit errors", async () => {
  const target = new URL("https://feeds.example.org/?key=private");
  await assert.rejects(requestJSON(target, { maxBytes: NaN }), RangeError);
  await assert.rejects(
    requestJSON(target, { timeoutMs: Infinity }),
    RangeError,
  );
  await assert.rejects(
    requestJSON(target, {
      maxBytes: 2,
      transport: async () => Response.json({ large: true }),
    }),
    /response_too_large/,
  );
  await assert.rejects(
    requestJSON(target, {
      transport: async () => {
        throw new Error(target.href);
      },
    }),
    (error: unknown) =>
      error instanceof CollectorError &&
      error.message === "upstream_unavailable",
  );
  for (const status of [302, 401, 403, 429, 503]) {
    await assert.rejects(
      requestJSON(target, {
        transport: async (_url, options) => {
          assert.equal(options?.redirect, "manual");
          return new Response("", { status, headers: { "Retry-After": "7" } });
        },
      }),
      (error: unknown) =>
        error instanceof CollectorError &&
        error.failure.retryable === (status === 429 || status >= 500) &&
        error.failure.retry_after_ms === 7000,
    );
  }
});
