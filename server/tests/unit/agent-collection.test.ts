// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  startGateway,
  type AgentRunner,
} from "../../src/agent-gateway/service.js";
import { ACPClient } from "../../src/agent-gateway/acp.js";
import { RunLedger } from "../../src/agent-gateway/ledger.js";
import { EvidenceStore } from "../../src/agent-gateway/evidence.js";
import {
  settingsSchema,
  policyHash,
} from "../../src/modules/agent-collection/protocol.js";
import { DeepSeekHarnessCollector } from "../../src/plugins/deepseek-harness/plugin.js";
import { collectionDisclosure } from "../../src/modules/collectors/disclosure.js";
import { pluginRegistry } from "../../src/plugins/index.js";
import { newSource } from "../../src/modules/sources/lifecycle.js";
import { hash } from "../../src/shared/crypto.js";

export const profile = {
  id: "public",
  label: "公开文化来源",
  allowed_origins: ["https://news.example.org"],
  model_origin: "https://api.deepseek.com",
};
export const settings = settingsSchema.parse({
  profile: "public",
  goal: "文化活动",
  start_url: "https://news.example.org/feed.json",
});
const token = "test-only-gateway-secret-".repeat(2);
const fixture = (text = "Original public source", invalid = false) =>
  new Response(
    JSON.stringify({
      version: "https://jsonfeed.org/version/1.1",
      title: "Culture",
      items: [
        {
          id: "event-1",
          url: "https://news.example.org/event-1",
          title: "Culture event",
          content_text: text,
        },
        ...(invalid ? [{}] : []),
      ],
    }),
    { headers: { "Content-Type": "application/feed+json" } },
  );
const source = (goal = settings.goal) =>
  newSource(
    {
      plugin: "deepseek-harness",
      config_version: 1,
      configuration: { ...settings, goal },
      name: "Agent",
      interval_seconds: 900,
      enabled: true,
    },
    Date.now(),
  );

test("agent configuration and disclosure expose operator profiles, never credentials, and reject arbitrary targets", async () => {
  const op = {
    gateway_origin: "https://gateway.example.org",
    access_token: token,
    profiles: [profile],
  };
  const p = new DeepSeekHarnessCollector(),
    configured = p.configure(op);
  assert.equal(configured.descriptor.form.fields[0]?.type, "select");
  assert(!JSON.stringify(configured.descriptor).includes(token));
  assert.throws(() =>
    configured.validate({
      ...settings,
      start_url: "https://evil.example.org/",
    }),
  );
  assert.throws(() => configured.validate({ ...settings, profile: "private" }));
  assert.throws(() =>
    configured.validate({ ...settings, timeout_seconds: 300 }),
  );
  assert(
    p.deploymentErrors({ ...op, allow_private: true }, "cloudflare").length,
  );
  const d = await collectionDisclosure(
    { "deepseek-harness": op },
    pluginRegistry,
  );
  assert(d.description.includes("发送给已声明的 ACP 网关和模型服务"));
  assert(
    d.destinations.some(
      (d) =>
        d.origin === profile.model_origin && d.purpose === "agent_collection",
    ),
  );
  assert(!JSON.stringify(d).includes(token));
});

test("evidence requires an actual fetch and only permits observed IDs, original content and bounded authorized requests", async () => {
  let calls = 0;
  const transport = (async () => {
    calls++;
    return fixture("Original", true);
  }) as typeof fetch;
  const evidence = new EvidenceStore(
    settings,
    profile,
    new AbortController().signal,
    transport,
  );
  assert.throws(() => evidence.select({ evidence_ids: [] }));
  await assert.rejects(evidence.fetch({ url: "http://169.254.169.254/" }));
  assert.equal(calls, 0);
  const data = (await evidence.fetch({ url: settings.start_url })) as {
    candidates: { evidence_id: string }[];
  };
  await evidence.fetch({ url: settings.start_url });
  assert.equal(calls, 1);
  assert.throws(() => evidence.select({ evidence_ids: ["0".repeat(64)] }));
  evidence.select({ evidence_ids: [data.candidates[0]!.evidence_id] });
  const result = await evidence.result();
  assert.equal(result.items[0]!.content.parts[0]!.text, "Original");
  assert.equal(result.items[0]!.content.published_at, null);
  assert(
    result.items[0]!.content.external_id.startsWith(
      `feed:${settings.start_url}#`,
    ),
  );
  assert.equal(result.warnings.length, 1);
  await assert.rejects(evidence.fetch({ url: settings.start_url }));
  assert.throws(() => evidence.select({ evidence_ids: [] }));
  const redirect = new EvidenceStore(
    settings,
    profile,
    new AbortController().signal,
    (async (_url, init) => {
      assert.equal(init?.redirect, "manual");
      return new Response(null, {
        status: 302,
        headers: { Location: "https://evil.example.org" },
      });
    }) as typeof fetch,
  );
  await assert.rejects(redirect.fetch({ url: settings.start_url }));
  assert.throws(() => redirect.select({ evidence_ids: [] }));
  const oversized = new EvidenceStore(
    settings,
    profile,
    new AbortController().signal,
    (async () => fixture("x".repeat(3 * 1024 * 1024))) as typeof fetch,
  );
  await assert.rejects(oversized.fetch({ url: settings.start_url }));
});

test("gateway drives real child-process ACP, isolates runs, persists replays and fails closed on permissions, incomplete turns and invented evidence", async () => {
  const directory = await mkdtemp(join(tmpdir(), "melted-acp-"));
  let calls = 0;
  const runner: AgentRunner = async (i) => {
    calls++;
    const client = new ACPClient(
      process.execPath,
      [resolve("tests/fixtures/acp-agent.mjs")],
      i.cwd,
      {},
      i.signal,
    );
    try {
      await client.run(i.cwd, i.mcp, i.prompt);
    } finally {
      await client.close();
    }
  };
  const config = {
    data_directory: directory,
    dsh_package_directory: "/test-only-runtime",
    port: 0,
    profiles: [profile],
  };
  const env = { MELTED_AGENT_GATEWAY_TOKEN: token };
  let gateway = await startGateway(config, env, {
    runner,
    transport: (async () => fixture()) as typeof fetch,
  });
  const poll = async (goal: string, execution: string) => {
    const plugin = new DeepSeekHarnessCollector().configure({
      gateway_origin: gateway.origin,
      allow_private: true,
      access_token: token,
      profiles: [profile],
    });
    return plugin.poll(source(goal), undefined, { id: await hash(execution) });
  };
  try {
    const [first, repeated] = await Promise.all([
      poll(settings.goal, "run-one"),
      poll(settings.goal, "run-one"),
    ]);
    assert.deepEqual(first, repeated);
    assert.equal(first.items.length, 1);
    assert.equal(calls, 1);
    assert(!JSON.stringify(first).includes("NOT FOR STORAGE"));
    await gateway.close();
    gateway = await startGateway(config, env, {
      runner,
      transport: (async () => fixture()) as typeof fetch,
    });
    assert.deepEqual(await poll(settings.goal, "run-one"), first);
    assert.equal(calls, 1);
    await assert.rejects(
      poll("changed", "run-one"),
      /agent_execution_conflict/,
    );
    for (const [goal, code] of [
      ["REQUEST_PERMISSION", "agent_permission_required"],
      ["FAKE_EVIDENCE", "agent_selection_missing"],
      ["MAX_TOKENS", "agent_turn_incomplete"],
      ["BAD_PROTOCOL", "agent_protocol_invalid"],
    ])
      await assert.rejects(poll(goal!, goal!), new RegExp(code!));
    const wrongToken = await fetch(gateway.origin + "/v1/collect", {
      method: "POST",
    });
    assert.equal(wrongToken.status, 401);
    await assert.rejects(
      startGateway(
        {
          ...config,
          data_directory: join(directory, "bind-failure"),
          port: Number(new URL(gateway.origin).port),
        },
        env,
        { runner },
      ),
      /agent_bind_failed/,
    );
    const mismatch = await fetch(gateway.origin + "/v1/collect", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        version: 1,
        execution_id: await hash("policy"),
        policy_hash: "0".repeat(64),
        configuration: settings,
      }),
    });
    assert.deepEqual(await mismatch.json(), { error: "agent_policy_mismatch" });
    assert.equal((await policyHash(profile)).length, 64);
  } finally {
    await gateway.close();
    await gateway.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("ledger preserves interrupted and conflicting admissions across restart and enforces daily budget", async () => {
  const directory = await mkdtemp(join(tmpdir(), "melted-ledger-"));
  try {
    let ledger = new RunLedger(join(directory, "runs.sqlite"));
    assert.equal(ledger.admit("one", "hash", 1).fresh, true);
    ledger.close();
    ledger = new RunLedger(join(directory, "runs.sqlite"));
    assert.deepEqual(ledger.admit("one", "hash", 1).value, {
      error: "agent_run_indeterminate",
    });
    assert.deepEqual(ledger.admit("one", "other", 1).value, {
      error: "agent_execution_conflict",
    });
    assert.deepEqual(ledger.admit("two", "hash", 1).value, {
      error: "agent_daily_limit",
    });
    ledger.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("ACP cancellation terminates an unfinished child and rejects the turn", async () => {
  const controller = new AbortController();
  const client = new ACPClient(
    process.execPath,
    [resolve("tests/fixtures/acp-agent.mjs")],
    tmpdir(),
    {},
    controller.signal,
  );
  const promise = client.run(
    tmpdir(),
    { url: "http://127.0.0.1/unused", token },
    "WAIT_FOREVER",
  );
  const timer = setTimeout(() => controller.abort(), 200);
  try {
    await assert.rejects(promise, /agent_cancelled/);
  } finally {
    clearTimeout(timer);
    await client.close();
  }
});
