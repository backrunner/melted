// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { WebSocketServer } from "ws";
import { requestRelay } from "../../src/plugins/nostr/relay.js";
import { CollectorError } from "../../src/modules/plugins/sdk/index.js";
test("bounded NIP-01 transport handles EOSE, truncation, invalid frames, cancellation and handshake policies", async () => {
  let mode = "empty",
    closed = 0;
  const server = createServer(),
    relay = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    if (mode === "http") {
      socket.end(
        "HTTP/1.1 429 Too Many Requests\r\nRetry-After: 90\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
      );
      return;
    }
    relay.handleUpgrade(req, socket, head, (ws) =>
      relay.emit("connection", ws),
    );
  });
  relay.on("connection", (ws) => {
    ws.on("close", () => closed++);
    ws.on("message", (raw) => {
      const [type, id] = JSON.parse(raw.toString());
      if (type !== "REQ") return;
      if (mode === "incomplete") return ws.close();
      if (mode === "malformed") return ws.send("bad JSON");
      if (mode === "oversized") return ws.send("x".repeat(512 * 1024));
      if (mode === "limit") {
        ws.send(JSON.stringify(["EVENT", id, {}]));
        ws.send(JSON.stringify(["EVENT", id, {}]));
        return;
      }
      if (mode === "cancel") return;
      ws.send(JSON.stringify(["EVENT", "wrong-subscription", {}]));
      ws.send(JSON.stringify(["EOSE", id]));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  const url = `ws://127.0.0.1:${address.port}`;
  const request = (signal?: AbortSignal) =>
    requestRelay(url, { kinds: [1], limit: 1 }, signal);
  try {
    assert.deepEqual(await request(), []);
    for (const [scenario, code] of [
      ["incomplete", "relay_incomplete"],
      ["malformed", "invalid_relay_message"],
      ["oversized", "invalid_relay_message"],
      ["limit", "relay_limit_exceeded"],
    ]) {
      mode = scenario!;
      await assert.rejects(request(), new RegExp(code!));
    }
    mode = "http";
    await assert.rejects(request(), (e: unknown) => {
      assert(e instanceof CollectorError);
      assert.equal(e.failure.retry_after_ms, 90000);
      assert.equal(e.failure.retryable, true);
      return true;
    });
    mode = "cancel";
    await assert.rejects(
      request(AbortSignal.timeout(25)),
      /collector_cancelled/,
    );
    assert(closed >= 5);
  } finally {
    for (const ws of relay.clients) ws.terminate();
    relay.close();
    server.closeAllConnections();
    server.close();
  }
});
