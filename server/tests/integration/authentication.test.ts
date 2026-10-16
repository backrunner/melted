// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import test from "node:test";
import assert from "node:assert/strict";
import { connect } from "../../src/storage/postgres/connection.js";
import { migrate } from "../../src/storage/postgres/migrations.js";
import { PostgresRepository } from "../../src/storage/postgres/repository.js";
import { CloudRepository } from "../../src/storage/cloudflare/repository.js";
import type { CloudBindings } from "../../src/storage/cloudflare/bindings.js";
import { fixtureSchema } from "../../src/modules/content/schemas.js";
import { parse } from "../../src/shared/validation.js";
import fixture from "../../../contracts/fixtures/development-library.json" with { type: "json" };
import { createApp } from "../../src/http/app.js";
import { configSchema } from "../../src/config/schema.js";
import { hash, random } from "../../src/shared/crypto.js";
import { hashPassword } from "../../src/modules/identity/password.js";

for (const target of ["PostgreSQL", "Cloudflare workerd"] as const) {
  test(`${target}: negotiated credentials, isolation, disabled methods and session lifecycle`, async () => {
    if (
      !process.env.MELTED_TEST_DATABASE_URL ||
      process.env.MELTED_TEST_DATABASE_URL === process.env.DATABASE_URL
    )
      throw new Error("Dedicated test database required");
    const { database, pool } = connect(process.env.MELTED_TEST_DATABASE_URL);
    await migrate(database);
    const apiKey = "melted_" + random(),
      otherKey = "melted_" + random();
    const password = "password-for-integration-only";
    const policy = {
      methods: ["password", "api_key"],
      preferred: "password",
      accounts: [
        {
          subject: "alice",
          username: "alice",
          password_hash: await hashPassword(password),
          api_key_hashes: [await hash(apiKey)],
        },
        { subject: "bob", api_key_hashes: [await hash(otherKey)] },
      ],
    };
    const serverID = "credentials-" + random();
    const config = configSchema.parse({
      serverID,
      publicOrigin: "http://localhost",
      operator: "test",
      registration: "closed",
      authentication: policy,
    });
    const app = createApp(),
      repository = new PostgresRepository(database);
    const library = parse(fixtureSchema, fixture);
    const documents = library.documents;
    const seed = async (owner: string) => {
      const seeder = worker
        ? new CloudRepository(await worker.getBindings<CloudBindings>())
        : repository;
      await seeder.importDemo(owner, library);
    };
    const worker =
      target === "Cloudflare workerd"
        ? new Miniflare(
            convertV4MiniflareOptions({
              name: "credential-test",
              modules: true,
              scriptPath: ".wrangler/test-build/worker.js",
              compatibilityDate: "2026-10-14",
              compatibilityFlags: ["nodejs_compat"],
              durableObjects: {
                ACCOUNTS: { className: "AccountStore", useSQLite: true },
                CONTROL: { className: "ControlStore", useSQLite: true },
              },
              bindings: {
                MELTED_SERVER_ID: serverID,
                MELTED_OPERATOR: "test",
                PUBLIC_ORIGIN: "http://localhost",
                REGISTRATION_MODE: "closed",
                AUTH_CONFIG: JSON.stringify(policy),
              },
            }),
          )
        : undefined;
    const send = async (
      path: string,
      body?: unknown,
      token?: string,
      method?: string,
      ip = random(),
    ) => {
      const init = {
        method: method ?? (body ? "POST" : "GET"),
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": ip,
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      };
      const result = worker
        ? await worker.dispatchFetch("http://localhost" + path, init)
        : await app.request("http://localhost" + path, init, {
            repository,
            config,
            remoteIP: ip,
          });
      return {
        status: result.status,
        data: result.status === 204 ? {} : ((await result.json()) as any),
      };
    };
    try {
      const discovery = await send("/.well-known/melted");
      assert.deepEqual(discovery.data.auth, {
        version: 1,
        methods: ["password", "api_key"],
        preferred: "password",
      });
      assert(!JSON.stringify(discovery).includes("password_hash"));
      assert(!JSON.stringify(discovery).includes("alice"));
      for (const path of [
        "/v1/auth/key/challenges",
        "/v1/auth/key/sessions",
        "/v1/auth/browser/start",
        "/v1/auth/browser/exchange",
      ])
        assert.equal((await send(path, {})).status, 404);
      assert.equal(
        (
          await send("/v1/auth/password/sessions", {
            username: "alice",
            password: "incorrect",
          })
        ).data.code,
        "invalid_credentials",
      );
      assert.equal(
        (
          await send("/v1/auth/password/sessions", {
            username: "missing",
            password,
          })
        ).data.code,
        "invalid_credentials",
      );
      assert.equal(
        (
          await send("/v1/auth/password/sessions", {
            username: "alice",
            password,
            owner: "bob",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await send("/v1/auth/api-key/sessions", {
            api_key: "melted_" + random(),
          })
        ).status,
        401,
      );
      const passwordLogin = await send("/v1/auth/password/sessions", {
        username: "alice",
        password,
      });
      assert.equal(passwordLogin.status, 200);
      const keyLogin = await send("/v1/auth/api-key/sessions", {
        api_key: apiKey,
      });
      assert.equal(keyLogin.status, 200);
      assert.equal(passwordLogin.data.account_id, keyLogin.data.account_id);
      const other = await send("/v1/auth/api-key/sessions", {
        api_key: otherKey,
      });
      assert.notEqual(other.data.account_id, keyLogin.data.account_id);
      await seed(passwordLogin.data.account_id);
      const items = await send(
        "/v1/briefings",
        undefined,
        passwordLogin.data.access_token,
      );
      assert.equal(items.data.total, documents.length);
      assert.equal(
        (await send("/v1/briefings", undefined, other.data.access_token)).data
          .total,
        0,
      );
      assert.equal(
        (
          await send(
            "/v1/briefings/" + items.data.items[0].id,
            undefined,
            other.data.access_token,
          )
        ).status,
        404,
      );
      // Long-lived keys cannot bypass exchange and be used as session bearers.
      assert.equal(
        (await send("/v1/briefings", undefined, apiKey)).status,
        401,
      );
      const refreshed = await send("/v1/auth/refresh", {
        refresh_token: keyLogin.data.refresh_token,
      });
      assert.equal(refreshed.status, 200);
      assert.equal(
        (
          await send(
            "/v1/auth/sessions/current",
            undefined,
            refreshed.data.access_token,
            "DELETE",
          )
        ).status,
        204,
      );
      assert.equal(
        (await send("/v1/briefings", undefined, refreshed.data.access_token))
          .status,
        401,
      );
      assert.equal(
        (
          await send("/v1/auth/refresh", {
            refresh_token: refreshed.data.refresh_token,
          })
        ).status,
        401,
      );
      const limitedIP = random();
      for (let i = 0; i < 10; i++)
        assert.equal(
          (
            await send(
              "/v1/auth/api-key/sessions",
              { api_key: "melted_" + random() },
              undefined,
              undefined,
              limitedIP,
            )
          ).status,
          401,
        );
      assert.equal(
        (
          await send(
            "/v1/auth/api-key/sessions",
            { api_key: apiKey },
            undefined,
            undefined,
            limitedIP,
          )
        ).status,
        429,
      );
    } finally {
      await worker?.dispose();
      await pool.end();
    }
  });
}
