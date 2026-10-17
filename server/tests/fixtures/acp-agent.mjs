// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// A synthetic ACP peer. It does not call a model or make external requests.
import readline from "node:readline";
const send = (m) =>
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...m }) + "\n");
let endpoint,
  headers,
  sequence = 0;
const rpc = async (method, params) =>
  (
    await (
      await fetch(endpoint, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: ++sequence,
          method,
          params,
        }),
      })
    ).json()
  ).result;
readline.createInterface({ input: process.stdin }).on("line", async (line) => {
  const m = JSON.parse(line);
  if (m.method === "initialize")
    send({
      id: m.id,
      result: {
        protocolVersion: 1,
        agentCapabilities: { mcpCapabilities: { http: true } },
      },
    });
  else if (m.method === "session/new") {
    endpoint = m.params.mcpServers[0].url;
    headers = Object.fromEntries(
      m.params.mcpServers[0].headers.map((h) => [h.name, h.value]),
    );
    send({ id: m.id, result: { sessionId: "fixture-session" } });
  } else if (m.method === "session/prompt") {
    const prompt = m.params.prompt[0].text;
    if (prompt.includes("REQUEST_PERMISSION")) {
      send({
        id: "permission-1",
        method: "session/request_permission",
        params: {
          sessionId: "fixture-session",
          options: [{ optionId: "allow", kind: "allow_once" }],
        },
      });
      return;
    }
    if (prompt.includes("WAIT_FOREVER")) return;
    if (prompt.includes("BAD_PROTOCOL")) {
      process.stdout.write("not json\n");
      return;
    }
    const result = await rpc("tools/call", {
      name: "collect_url",
      arguments: { url: "https://news.example.org/feed.json" },
    });
    const evidence = JSON.parse(result.content[0].text);
    await rpc("tools/call", {
      name: "submit_collection",
      arguments: {
        evidence_ids: prompt.includes("FAKE_EVIDENCE")
          ? ["0".repeat(64)]
          : evidence.candidates.slice(0, 1).map((c) => c.evidence_id),
      },
    });
    send({
      method: "session/update",
      params: {
        sessionId: "fixture-session",
        update: {
          sessionUpdate: "agent_thought_chunk",
          content: { type: "text", text: "NOT FOR STORAGE" },
        },
      },
    });
    send({
      id: m.id,
      result: {
        stopReason: prompt.includes("MAX_TOKENS") ? "max_tokens" : "end_turn",
      },
    });
  } else if (m.method === "session/close") send({ id: m.id, result: {} });
});
