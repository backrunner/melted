// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from "node:test";
import assert from "node:assert/strict";
import {
  HTTPProcessingModels,
  ProcessingError,
} from "../../src/modules/processing/provider.js";
import {
  processingConfigSchema,
  processingDisclosure,
} from "../../src/modules/processing/config.js";
import {
  settingsCatalogFor,
  settingsCatalogSchema,
} from "../../src/modules/settings/dsl.js";
import {
  FixtureModelTransport,
  fixturePolicy,
} from "../fixtures/processing-model.js";
import { policySchema } from "../../src/modules/processing/types.js";
import { configSchema } from "../../src/config/schema.js";
import { credentialMutationSchema } from "../../src/modules/processing/credentials.js";
import { credentialSection } from "../../src/modules/settings/credentials-dsl.js";

test("client credentials need an explicit mode, sealing key and server-controlled shared administrators", () => {
  const owner = "acc_" + "1".repeat(64),
    other = "acc_" + "2".repeat(64);
  const base = {
    serverID: "test",
    operator: "test",
    publicOrigin: "https://melted.example",
    processing: {
      generator: {
        endpoint: "https://generator.example/v1/chat/completions",
        model: "test",
      },
      decision: {},
      credentials: { mode: "byok" },
    },
  };
  assert(!configSchema.safeParse(base).success);
  const byok = configSchema.parse({
    ...base,
    processingSealKey: "a".repeat(64),
  });
  assert.equal(credentialSection(byok, owner)!.scope, "account");
  assert.equal(credentialSection(byok, other)!.scope, "account");
  assert(
    !configSchema.safeParse({
      ...byok,
      processing: {
        ...byok.processing,
        credentials: { mode: "shared", administrators: [] },
      },
    }).success,
  );
  const shared = configSchema.parse({
    ...byok,
    processing: {
      ...byok.processing,
      credentials: { mode: "shared", administrators: [owner] },
    },
  });
  assert.equal(credentialSection(shared, owner)!.scope, "server");
  assert.equal(credentialSection(shared, other), undefined);
  assert(
    !configSchema.safeParse({
      ...byok,
      processing: {
        ...byok.processing,
        generator: { ...byok.processing!.generator, api_key: "fallback" },
      },
    }).success,
  );
});
test("write-only credential mutations reject scope injection, empty changes, header injection and unsupported keys", () => {
  assert(
    credentialMutationSchema.safeParse({
      expected_version: 1,
      changes: { decision_key: null },
    }).success,
  );
  for (const input of [
    { expected_version: 0, changes: {} },
    { owner: "other", expected_version: 0, changes: { generator_key: "key" } },
    { expected_version: 0, changes: { role: "admin" } },
    { expected_version: 0, changes: { generator_key: "bad\nheader" } },
    { expected_version: 0, changes: { generator_key: "" } },
    { expected_version: 0, changes: { generator_key: "x".repeat(4097) } },
  ])
    assert(!credentialMutationSchema.safeParse(input).success);
});

export const modelConfig = processingConfigSchema.parse({
  generator: {
    endpoint: "https://generator.example/v1/chat/completions",
    model: "test",
    api_key: "generator-secret",
  },
  decision: { api_key: "jev-secret" },
});
test("processing config, public disclosure and workflow never disclose credentials or permit arbitrary endpoints", async () => {
  const disclosure = await processingDisclosure(modelConfig),
    catalog = await settingsCatalogFor(modelConfig);
  assert(disclosure);
  assert(settingsCatalogSchema.safeParse(catalog).success);
  const serialized = JSON.stringify([disclosure, catalog]);
  assert(!serialized.includes("generator-secret"));
  assert(!serialized.includes("jev-secret"));
  assert.equal(catalog.sections[0]!.workflow!.actions.length, 3);
  assert.equal(
    (await processingDisclosure({
      ...modelConfig,
      generator: { ...modelConfig.generator, api_key: "rotated" },
    }))!.fingerprint,
    disclosure.fingerprint,
  );
  assert.notEqual(
    (await processingDisclosure({
      ...modelConfig,
      generator: { ...modelConfig.generator, model: "new" },
    }))!.fingerprint,
    disclosure.fingerprint,
  );
  for (const endpoint of [
    "http://host/v1",
    "https://user:secret@example/v1",
    "https://example/v1?key=secret",
    "https://example/v1#fragment",
  ])
    assert(
      !processingConfigSchema.safeParse({
        ...modelConfig,
        generator: { ...modelConfig.generator, endpoint },
      }).success,
    );
});
test("bounded model transport validates structured output, exact questions and distributions without leaking upstream errors", async () => {
  const fixture = new FixtureModelTransport(),
    models = new HTTPProcessingModels(modelConfig, fixture.fetch);
  const generated = await models.generate(
    "compile",
    "Compile explicit preferences.",
    { preferences: {} },
    policySchema,
    "compile-key",
  );
  assert.deepEqual(generated.value, fixturePolicy);
  assert.equal(generated.usage.model, "synthetic-generator");
  assert.match(fixture.calls[0]!.key, /^[a-f0-9]{64}$/);
  const q = {
    excluded: {
      type: "noul" as const,
      instructions: "Is there an explicit exclusion?",
    },
  };
  for (const response of [
    () =>
      new Response(null, {
        status: 302,
        headers: { Location: "https://evil.invalid" },
      }),
    () =>
      Response.json({
        model: "jev",
        answers: { excluded: { type: "noul", noul: 2 } },
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    () =>
      Response.json({
        model: "jev",
        answers: { extra: { type: "noul", noul: 0 } },
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    () => new Response("not JSON"),
    () => new Response("x".repeat(1024 * 1024 + 1)),
  ])
    await assert.rejects(
      new HTTPProcessingModels(modelConfig, async (_, init) => {
        assert.equal(init?.redirect, "manual");
        return response();
      }).judge({}, q, "key"),
      (e) => e instanceof ProcessingError && !e.message.includes("secret"),
    );
  await assert.rejects(
    new HTTPProcessingModels(
      modelConfig,
      async () => new Response("secret upstream body", { status: 429 }),
    ).judge({}, q, "key"),
    (e: unknown) =>
      e instanceof ProcessingError &&
      e.retryable &&
      e.code === "model_http_429",
  );
});
