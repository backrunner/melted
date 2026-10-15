// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import type { AppEnv } from "./context.js";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { id } from "../shared/crypto.js";
import { invalid, Problem } from "../shared/problem.js";

export function installMiddleware(app: Hono<AppEnv>) {
  app.use("*", async (c, next) => {
    const requestID = id("req");
    c.set("requestID", requestID);
    c.header("X-Request-ID", requestID);
    c.header("Cache-Control", "no-store");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
    await next();
  });
  app.use(
    "*",
    bodyLimit({
      maxSize: 32 * 1024,
      onError: (c) =>
        c.json(
          {
            code: "payload_too_large",
            request_id: c.get("requestID"),
            retryable: false,
          },
          413,
        ),
    }),
  );
  app.onError((error, c) => {
    if (error instanceof SyntaxError) error = invalid();
    const status = error instanceof Problem ? error.status : 500;
    if (status === 500)
      console.error(
        JSON.stringify({
          request_id: c.get("requestID"),
          error_type: "internal",
        }),
      );
    if (status === 429) c.header("Retry-After", "60");
    return c.json(
      {
        code: error instanceof Problem ? error.code : "internal_error",
        message: "请求暂时无法完成",
        request_id: c.get("requestID"),
        retryable: status >= 500 || status === 429,
      },
      status,
    );
  });
  app.notFound((c) =>
    c.json(
      { code: "not_found", request_id: c.get("requestID"), retryable: false },
      404,
    ),
  );
}
