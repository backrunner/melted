// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { CollectorError } from "../definition.js";
import { retryAfter } from "./http.js";

function handshakeFailure(status: number, retry: string | null) {
  return new CollectorError({
    code: `upstream_http_${status}`,
    retryable: status === 429 || status >= 500,
    blocked: status >= 300 && status < 500 && status !== 429,
    retry_after_ms: retryAfter(retry),
  });
}
/** The caller must authorize the exact relay. Runtime adapters never follow redirects. */
export async function openWebSocket(
  url: string,
  signal: AbortSignal,
): Promise<WebSocket> {
  try {
    signal.throwIfAborted();
    if ("WebSocketPair" in globalThis) {
      const target = new URL(url);
      target.protocol = target.protocol === "wss:" ? "https:" : "http:";
      const response = await fetch(target, {
        headers: { Upgrade: "websocket" },
        redirect: "manual",
        signal,
      });
      if (response.status !== 101) {
        await response.body?.cancel();
        throw handshakeFailure(
          response.status,
          response.headers.get("Retry-After"),
        );
      }
      const socket = (
        response as unknown as { webSocket?: WebSocket & { accept(): void } }
      ).webSocket;
      if (!socket)
        throw new CollectorError({
          code: "invalid_relay_handshake",
          retryable: false,
        });
      socket.accept();
      if (signal.aborted) {
        socket.close();
        signal.throwIfAborted();
      }
      return socket;
    }
    // This import's browser export is excluded from the active Worker path; no TCP/node APIs run there.
    const { WebSocket: NodeSocket } = await import("ws");
    signal.throwIfAborted();
    return await new Promise<WebSocket>((resolve, reject) => {
      const socket = new NodeSocket(url, {
        followRedirects: false,
        maxPayload: 512 * 1024,
        handshakeTimeout: 30_000,
        perMessageDeflate: false,
      });
      let finished = false;
      const finish = (error?: Error) => {
        if (finished) return;
        finished = true;
        signal.removeEventListener("abort", abort);
        if (error) {
          socket.terminate();
          reject(error);
        } else resolve(socket as unknown as WebSocket);
      };
      const abort = () =>
        finish(
          new CollectorError({ code: "collector_cancelled", retryable: true }),
        );
      signal.addEventListener("abort", abort, { once: true });
      socket.on("error", () =>
        finish(
          new CollectorError({
            code: "relay_connection_failed",
            retryable: true,
          }),
        ),
      );
      socket.on("open", () => finish());
      socket.on("unexpected-response", (request, response) => {
        const value = response.headers["retry-after"];
        const error = handshakeFailure(
          response.statusCode ?? 502,
          typeof value === "string" ? value : null,
        );
        response.destroy();
        request.destroy();
        finish(error);
      });
    });
  } catch (error) {
    if (error instanceof CollectorError) throw error;
    throw new CollectorError({
      code: signal.aborted ? "collector_cancelled" : "relay_connection_failed",
      retryable: true,
    });
  }
}
