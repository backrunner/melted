// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startGateway } from "../../src/agent-gateway/service.js";
import { writeProfile } from "../../src/agent-gateway/profile.js";
import { ACPClient } from "../../src/agent-gateway/acp.js";
import {
  settingsSchema,
  policyHash,
} from "../../src/modules/agent-collection/protocol.js";
import { hash } from "../../src/shared/crypto.js";

test("pinned real DeepSeek Harness boots isolated ACP profile, calls collection MCP and selects fetched evidence (synthetic model)", async () => {
  const directory = await mkdtemp(join(tmpdir(), "melted-real-dsh-"));
  let steps = 0;
  const observed: string[][] = [];
  const model = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const input = JSON.parse(Buffer.concat(chunks).toString());
    assert(req.url?.endsWith("/messages"));
    const names = input.tools.map((t: { name: string }) => t.name) as string[];
    observed.push(names);
    assert.equal(names.length, 2); // No bash, filesystem, plugin manager, subagents or arbitrary network tool.
    steps++;
    const text = JSON.stringify(input.messages);
    const ids = [
      ...text.matchAll(/evidence_id\\?"\s*:\s*\\?"([a-f0-9]{64})/g),
    ].map((m) => m[1]);
    const name = names.find((n) =>
      n.endsWith(steps === 1 ? "collect_url" : "submit_collection"),
    )!;
    const args =
      steps === 1
        ? { url: "https://news.example.org/feed.json" }
        : { evidence_ids: ids.slice(0, 1) };
    if (steps === 2)
      assert.equal(ids.length, 1, "model sees the fetched evidence id");
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    const emit = (type: string, body: object) =>
      res.write(
        `event: ${type}\ndata: ${JSON.stringify({ type, ...body })}\n\n`,
      );
    emit("message_start", {
      message: {
        id: `msg_${steps}`,
        type: "message",
        role: "assistant",
        content: [],
        model: "deepseek-v4-flash",
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 30, output_tokens: 0 },
      },
    });
    if (steps <= 2) {
      emit("content_block_start", {
        index: 0,
        content_block: {
          type: "tool_use",
          id: `call_${steps}`,
          name,
          input: {},
        },
      });
      emit("content_block_delta", {
        index: 0,
        delta: { type: "input_json_delta", partial_json: JSON.stringify(args) },
      });
    } else {
      emit("content_block_start", {
        index: 0,
        content_block: { type: "text", text: "" },
      });
      emit("content_block_delta", {
        index: 0,
        delta: { type: "text_delta", text: "Collection complete" },
      });
    }
    emit("content_block_stop", { index: 0 });
    emit("message_delta", {
      delta: {
        stop_reason: steps <= 2 ? "tool_use" : "end_turn",
        stop_sequence: null,
      },
      usage: { output_tokens: 30 },
    });
    emit("message_stop", {});
    res.end();
  });
  model.listen(0, "127.0.0.1");
  await once(model, "listening");
  const address = model.address();
  assert(address && typeof address !== "string");
  const profile = {
    id: "public",
    label: "Public",
    allowed_origins: ["https://news.example.org"],
    model_origin: "https://api.deepseek.com",
  };
  const token = "test-only-real-runtime-".repeat(2);
  const runtime = resolve("agent-runtime/node_modules/@deepseek-ai/dsh");
  const gateway = await startGateway(
    {
      data_directory: directory,
      dsh_package_directory: runtime,
      port: 0,
      profiles: [profile],
    },
    { MELTED_AGENT_GATEWAY_TOKEN: token },
    {
      transport: (async () =>
        new Response(
          JSON.stringify({
            version: "https://jsonfeed.org/version/1.1",
            title: "Culture",
            items: [
              {
                id: "a",
                title: "Concert",
                content_text: "Original concert announcement",
              },
            ],
          }),
          { headers: { "Content-Type": "application/feed+json" } },
        )) as typeof fetch,
      runner: async (i) => {
        // Only this test substitutes the public provider with a local scripted model.
        await writeProfile(i.home, {
          ...i.profile,
          model_base_url: `http://127.0.0.1:${address.port}`,
        });
        const client = new ACPClient(
          process.execPath,
          [join(runtime, "lib/bin.js"), "--profile", "melted"],
          i.cwd,
          {
            PATH: "/usr/local/bin:/usr/bin:/bin",
            DSH_HOME: i.home,
            DSH_TELEMETRY_DISABLED: "1",
            MELTED_DSH_MODEL_KEY: "synthetic-key",
          },
          i.signal,
        );
        try {
          await client.run(i.cwd, i.mcp, i.prompt);
        } finally {
          await client.close();
        }
      },
    },
  );
  try {
    const response = await fetch(gateway.origin + "/v1/collect", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        version: 1,
        execution_id: await hash("real-harness"),
        policy_hash: await policyHash(profile),
        configuration: settingsSchema.parse({
          profile: "public",
          goal: "Concerts",
          start_url: "https://news.example.org/feed.json",
          timeout_seconds: 30,
        }),
      }),
    });
    const result = (await response.json()) as any;
    assert.equal(result.error, undefined, JSON.stringify(result));
    assert.equal(
      result.items[0].content.parts[0].text,
      "Original concert announcement",
    );
    assert.equal(steps, 3);
    assert.equal(observed.length, 3);
  } finally {
    await gateway.close();
    model.closeAllConnections();
    model.close();
    await rm(directory, { recursive: true, force: true });
  }
});
