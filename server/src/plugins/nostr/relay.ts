// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import {
  CollectorError,
  openWebSocket,
} from "../../modules/plugins/sdk/index.js";

export type RelayFilter = {
  kinds: number[];
  limit: number;
  authors?: string[];
  "#t"?: string[];
};
export type RelayRequest = (
  url: string,
  filter: RelayFilter,
  signal?: AbortSignal,
) => Promise<unknown[]>;
/** A finite NIP-01 query, never a persistent connection or a publishing client.
 * Handshake and frame transports are adapted to Node and workerd without following redirects.
 */
export const requestRelay: RelayRequest = (url, filter, signal) =>
  new Promise((resolve, reject) => {
    let socket: WebSocket | undefined,
      finished = false,
      bytes = 0,
      frames = 0;
    const controller = new AbortController();
    const events: unknown[] = [],
      subscription = crypto.randomUUID();
    const finish = (error?: CollectorError) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      if (!socket) controller.abort();
      if (socket) {
        socket.removeEventListener("message", message);
        try {
          if (socket.readyState === 1)
            socket.send(JSON.stringify(["CLOSE", subscription]));
          socket.close();
        } catch {
          /* A failed handshake is already closed. */
        }
      }
      if (error) reject(error);
      else resolve(events);
    };
    const failure = (code: string, retryable: boolean, blocked = false) =>
      finish(new CollectorError({ code, retryable, blocked }));
    const cancel = () => failure("collector_cancelled", true);
    const timer = setTimeout(() => failure("collector_timeout", true), 30_000);
    const message = (event: MessageEvent) => {
      if (finished) return;
      if (typeof event.data !== "string")
        return failure("invalid_relay_message", false);
      bytes += new TextEncoder().encode(event.data).length;
      if (
        ++frames > 1000 ||
        bytes > 4 * 1024 * 1024 ||
        event.data.length > 512 * 1024
      )
        return failure("response_too_large", false);
      let data: unknown;
      try {
        data = JSON.parse(event.data);
      } catch {
        return failure("invalid_relay_message", false);
      }
      if (!Array.isArray(data)) return failure("invalid_relay_message", false);
      if (data[0] === "EOSE" && data[1] === subscription) return finish();
      if (data[0] === "CLOSED" && data[1] === subscription) {
        const reason = typeof data[2] === "string" ? data[2] : "";
        if (/^(auth-required|restricted|blocked):/.test(reason))
          return failure("relay_access_required", false, true);
        if (reason.startsWith("rate-limited:"))
          return failure("relay_rate_limited", true);
        return failure("relay_subscription_closed", true);
      }
      if (data[0] === "EVENT" && data[1] === subscription) {
        if (events.length >= filter.limit)
          return failure("relay_limit_exceeded", false);
        events.push(data[2]);
      }
      // AUTH challenges do not necessarily require authentication for public reads.
      // No key is supplied, no AUTH/EVENT is ever sent, and relay messages are not logged.
    };
    if (signal?.aborted) return cancel();
    signal?.addEventListener("abort", cancel, { once: true });
    void openWebSocket(url, controller.signal)
      .then((connected) => {
        socket = connected;
        if (finished) {
          socket.close();
          return;
        }
        socket.addEventListener("message", message);
        socket.addEventListener("error", () =>
          failure("relay_connection_failed", true),
        );
        socket.addEventListener("close", () => {
          if (!finished) failure("relay_incomplete", true);
        });
        try {
          socket.send(JSON.stringify(["REQ", subscription, filter]));
        } catch {
          failure("upstream_unavailable", true);
        }
      })
      .catch((error: unknown) =>
        finish(
          error instanceof CollectorError
            ? error
            : new CollectorError({
                code: "relay_connection_failed",
                retryable: true,
              }),
        ),
      );
  });
