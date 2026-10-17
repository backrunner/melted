// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { CollectorError } from "../definition.js";

export function retryAfter(value: string | null, now = Date.now()) {
  if (!value) return undefined;
  const delay = /^\d+$/.test(value)
    ? Number(value) * 1000
    : Date.parse(value) - now;
  return Number.isFinite(delay)
    ? Math.max(0, Math.min(delay, 8.64e15 - now))
    : undefined;
}
export type JSONResponse =
  | { status: 200; data: unknown; headers: Headers }
  | { status: 304; headers: Headers };
/** Target must first be authorized by the plugin's operator policy. Never follows redirects. */
export async function requestJSON(
  target: URL,
  options: {
    headers?: HeadersInit;
    signal?: AbortSignal;
    transport?: typeof fetch;
    timeoutMs?: number;
    maxBytes?: number;
  } = {},
): Promise<JSONResponse> {
  for (const value of [options.timeoutMs, options.maxBytes])
    if (value !== undefined && (!Number.isFinite(value) || value <= 0))
      throw new RangeError("Request limits must be positive finite numbers");
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    Math.min(30_000, Math.max(1, options.timeoutMs ?? 30_000)),
  );
  const deadline = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal;
  const maxBytes = Math.min(
    4 * 1024 * 1024,
    Math.max(1, options.maxBytes ?? 4 * 1024 * 1024),
  );
  try {
    deadline.throwIfAborted();
    const response = await (options.transport ?? fetch)(target, {
      headers: options.headers,
      redirect: "manual",
      signal: deadline,
    });
    if (response.status === 304) {
      await response.body?.cancel();
      return { status: 304, headers: response.headers };
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new CollectorError({
        code: `upstream_http_${response.status}`,
        retryable: response.status === 429 || response.status >= 500,
        retry_after_ms: retryAfter(response.headers.get("Retry-After")),
        blocked:
          response.status >= 300 &&
          response.status < 500 &&
          response.status !== 429,
      });
    }
    if (!response.body)
      throw new CollectorError({ code: "empty_response", retryable: true });
    const reader = response.body.getReader(),
      chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > maxBytes)
          throw new CollectorError({
            code: "response_too_large",
            retryable: false,
          });
        chunks.push(part.value);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    try {
      return {
        status: 200,
        data: JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(bytes),
        ),
        headers: response.headers,
      };
    } catch {
      throw new CollectorError({ code: "invalid_feed", retryable: false });
    }
  } catch (error) {
    if (error instanceof CollectorError) throw error;
    // Fetch errors may contain credential-bearing URLs. Only stable codes leave this boundary.
    throw new CollectorError({
      code: deadline.aborted ? "collector_timeout" : "upstream_unavailable",
      retryable: true,
    });
  } finally {
    clearTimeout(timer);
  }
}
