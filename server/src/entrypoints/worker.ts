// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { consumeCollections } from "../storage/cloudflare/sources/queue.js";
import { createApp } from "../http/app.js";
import { CloudRepository } from "../storage/cloudflare/repository.js";
import { type CloudBindings } from "../storage/cloudflare/bindings.js";
import { configFromEnv } from "../config/schema.js";
import { Problem } from "../shared/problem.js";

export { AccountStore } from "../storage/cloudflare/account-store.js";
export { ControlStore } from "../storage/cloudflare/control-store.js";
const app = createApp();
export default {
  queue: consumeCollections,
  async fetch(request: Request, env: CloudBindings): Promise<Response> {
    const config = configFromEnv({
      RSSHUB_CONFIG: env.RSSHUB_CONFIG,
      RSSHUB_ACCESS_KEY: env.RSSHUB_ACCESS_KEY,
      MELTED_SERVER_ID: env.MELTED_SERVER_ID,
      MELTED_OPERATOR: env.MELTED_OPERATOR,
      PUBLIC_ORIGIN: env.PUBLIC_ORIGIN,
      REGISTRATION_MODE: env.REGISTRATION_MODE,
      AUTH_CONFIG: env.AUTH_CONFIG,
      OIDC_ISSUER: env.OIDC_ISSUER,
      OIDC_CLIENT_ID: env.OIDC_CLIENT_ID,
      OIDC_CLIENT_SECRET: env.OIDC_CLIENT_SECRET,
    });
    const repository = new CloudRepository(env);
    try {
      await repository.limit(
        "request:" + (request.headers.get("CF-Connecting-IP") ?? "local"),
        600,
      );
    } catch (error) {
      if (error instanceof Problem)
        return Response.json(
          { code: error.code, retryable: true },
          { status: error.status },
        );
      throw error;
    }
    return app.fetch(request, {
      repository,
      config,
      remoteIP: request.headers.get("CF-Connecting-IP") ?? "local",
    });
  },
};
