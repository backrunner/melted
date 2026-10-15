import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { connect } from "../../src/storage/postgres/connection.js";
import { migrate } from "../../src/storage/postgres/migrations.js";
import { createApp } from "../../src/http/app.js";
import { PostgresRepository } from "../../src/storage/postgres/repository.js";
import { b64, random } from "../../src/shared/crypto.js";
import { configSchema } from "../../src/config/schema.js";
import { parse } from "../../src/shared/validation.js";
import { fixtureSchema } from "../../src/modules/content/schemas.js";
import type { Session } from "../../src/modules/identity/types.js";
import fixture from "../../../contracts/fixtures/development-library.json" with { type: "json" };

if (
  !process.env.MELTED_TEST_DATABASE_URL ||
  process.env.MELTED_TEST_DATABASE_URL === process.env.DATABASE_URL
)
  throw new Error(
    "Set a dedicated MELTED_TEST_DATABASE_URL distinct from DATABASE_URL",
  );
const { database, pool } = connect(process.env.MELTED_TEST_DATABASE_URL);
const worker = new Miniflare(
  convertV4MiniflareOptions({
    name: "melted-parity-test",
    modules: true,
    scriptPath: ".wrangler/test-build/worker.js",
    compatibilityDate: "2026-10-14",
    compatibilityFlags: ["nodejs_compat"],
    durableObjects: {
      ACCOUNTS: { className: "AccountStore", useSQLite: true },
      CONTROL: { className: "ControlStore", useSQLite: true },
    },
    bindings: {
      MELTED_SERVER_ID: "test-cloud",
      MELTED_OPERATOR: "test",
      PUBLIC_ORIGIN: "http://localhost",
      REGISTRATION_MODE: "key",
      DEVELOPMENT_SAMPLES: "true",
    },
  }),
);
after(() => worker.dispose());
const remoteIP = random();
after(() => pool.end());
const config = parse(configSchema, {
  serverID: "test-server",
  operator: "test",
  publicOrigin: "http://localhost",
  registration: "key",
});
const repo = new PostgresRepository(database);
const app = createApp();
type Send = (
  path: string,
  body?: unknown,
  token?: string,
  method?: string,
) => Promise<Response>;
const targets: { name: string; send: Send }[] = [
  {
    name: "PostgreSQL",
    send: async (path, body, token, method) =>
      app.request(
        "http://localhost" + path,
        {
          method: method ?? (body ? "POST" : "GET"),
          headers: {
            ...(token ? { Authorization: "Bearer " + token } : {}),
            ...(body ? { "Content-Type": "application/json" } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        },
        {
          repository: repo,
          config,
          remoteIP,
          developmentSamples: true,
        },
      ),
  },
  {
    name: "Cloudflare workerd + SQLite DO",
    send: async (path, body, token, method) => {
      const response = await worker.dispatchFetch("http://localhost" + path, {
        method: method ?? (body ? "POST" : "GET"),
        headers: {
          ...(token ? { Authorization: "Bearer " + token } : {}),
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      return new Response(response.body as unknown as BodyInit, {
        status: response.status,
        headers: response.headers as unknown as Headers,
      });
    },
  },
];

test("migrations serialize and can be reapplied", async () => {
  await Promise.all([migrate(database), migrate(database)]);
});
for (const { name, send } of targets)
  test(name, async (t) => {
    const json = async (
      path: string,
      body?: unknown,
      token?: string,
      method?: string,
      status = 200,
    ) => {
      const response = await send(path, body, token, method);
      assert.equal(response.status, status, `${path}: ${response.status}`);
      return response.status === 204 ? {} : ((await response.json()) as any);
    };
    const key = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    const publicKey = b64(await crypto.subtle.exportKey("raw", key.publicKey));
    const proof = async () => {
      const c = await json("/v1/auth/key/challenges", {
        public_key: publicKey,
      });
      return {
        challenge_id: c.challenge_id,
        signature: b64(
          await crypto.subtle.sign(
            { name: "ECDSA", hash: "SHA-256" },
            key.privateKey,
            new TextEncoder().encode(c.message),
          ),
        ),
      };
    };
    let a: Session, b: Session;
    await t.test(
      "key possession, one-time challenge, stable owner, separate users",
      async () => {
        await json("/v1/briefings", undefined, undefined, undefined, 401);
        const signed = await proof();
        await json(
          "/v1/auth/key/sessions",
          { ...signed, signature: "A".repeat(86) },
          undefined,
          undefined,
          401,
        );
        a = await json("/v1/auth/key/sessions", signed);
        await json("/v1/auth/key/sessions", signed, undefined, undefined, 401);
        assert.equal(
          (await json("/v1/auth/key/sessions", await proof())).account_id,
          a.account_id,
        );
        const other = await crypto.subtle.generateKey(
          { name: "ECDSA", namedCurve: "P-256" },
          true,
          ["sign", "verify"],
        );
        const c = await json("/v1/auth/key/challenges", {
          public_key: b64(
            await crypto.subtle.exportKey("raw", other.publicKey),
          ),
        });
        b = await json("/v1/auth/key/sessions", {
          challenge_id: c.challenge_id,
          signature: b64(
            await crypto.subtle.sign(
              { name: "ECDSA", hash: "SHA-256" },
              other.privateKey,
              new TextEncoder().encode(c.message),
            ),
          ),
        });
        assert.notEqual(a.account_id, b.account_id);
      },
    );
    const documents = parse(fixtureSchema, fixture).documents;
    let page: any;
    await t.test(
      "owner isolation, seeded fixture, literal query and combined filters",
      async () => {
        await json("/v1/development/seed", {}, a.access_token, undefined, 204);
        page = await json("/v1/briefings?limit=2", undefined, a.access_token);
        assert.equal(page.total, documents.length);
        assert.equal(page.items.length, 2);
        assert.equal(page.items[0].markdown, "");
        assert.equal(
          (await json("/v1/briefings", undefined, b.access_token)).total,
          0,
        );
        assert.deepEqual(
          (await json("/v1/taxonomy", undefined, b.access_token)).terms,
          [],
        );
        await json(
          "/v1/briefings/" + page.items[0].id,
          undefined,
          b.access_token,
          undefined,
          404,
        );
        await json(
          "/v1/briefings?cursor=" + page.next_cursor + "&limit=2",
          undefined,
          b.access_token,
          undefined,
          410,
        );
        assert.equal(
          (await json("/v1/sync/changes", undefined, b.access_token)).changes
            .length,
          0,
        );
        assert.equal(
          (await json("/v1/briefings?q=%25", undefined, a.access_token)).total,
          0,
        );
        const d = documents.find((d) => d.category_id && d.tag_ids.length)!;
        const params = new URLSearchParams({
          category_ids: d.category_id!,
          tag_ids: d.tag_ids[0]!,
          q: d.title,
          from: "2020-01-01T00:00:00Z",
          to: "2030-01-01T00:00:00Z",
        });
        assert.equal(
          (await json("/v1/briefings?" + params, undefined, a.access_token))
            .total,
          1,
        );
        params.set("tag_ids", d.category_id!);
        assert.equal(
          (await json("/v1/briefings?" + params, undefined, a.access_token))
            .total,
          0,
        );
        await json(
          "/v1/briefings?view=all&view=saved",
          undefined,
          a.access_token,
          undefined,
          400,
        );
        await json(
          "/v1/briefings?limit=101",
          undefined,
          a.access_token,
          undefined,
          400,
        );
        await json(
          "/v1/briefings?from=2030-01-01T00:00:00Z&to=2020-01-01T00:00:00Z",
          undefined,
          a.access_token,
          undefined,
          400,
        );
        await json(
          "/v1/briefings?q=changed&cursor=" + page.next_cursor,
          undefined,
          a.access_token,
          undefined,
          410,
        );
      },
    );
    await t.test(
      "atomic state updates, replay, version races and visibility during pagination",
      async () => {
        const d = page.items[0];
        const mutation = {
          read: true,
          saved: true,
          hidden: false,
          expected_version: d.state.version,
          mutation_id: random(),
        };
        await json(
          "/v1/briefings/" + d.id + "/state",
          mutation,
          b.access_token,
          "PUT",
          404,
        );
        const state = await json(
          "/v1/briefings/" + d.id + "/state",
          mutation,
          a.access_token,
          "PUT",
        );
        assert.equal(state.version, 2);
        assert.deepEqual(
          await json(
            "/v1/briefings/" + d.id + "/state",
            mutation,
            a.access_token,
            "PUT",
          ),
          state,
        );
        await json(
          "/v1/briefings/" + d.id + "/state",
          { ...mutation, saved: false },
          a.access_token,
          "PUT",
          409,
        );
        const results = await Promise.all(
          [true, false].map((saved) =>
            send(
              "/v1/briefings/" + d.id + "/state",
              {
                ...mutation,
                expected_version: 2,
                saved,
                mutation_id: random(),
              },
              a.access_token,
              "PUT",
            ),
          ),
        );
        assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
        const next = await json(
          "/v1/briefings?cursor=" + page.next_cursor + "&limit=2",
          undefined,
          a.access_token,
        );
        const hidden = next.items[0];
        await json(
          "/v1/briefings/" + hidden.id + "/state",
          {
            read: false,
            saved: false,
            hidden: true,
            expected_version: 1,
            mutation_id: random(),
          },
          a.access_token,
          "PUT",
        );
        const still = await json(
          "/v1/briefings?cursor=" + page.next_cursor + "&limit=2",
          undefined,
          a.access_token,
        );
        assert(!still.items.some((x: any) => x.id === hidden.id));
        await json(
          "/v1/briefings/" + hidden.id,
          undefined,
          a.access_token,
          undefined,
          404,
        );
        const changes = await json(
          "/v1/sync/changes",
          undefined,
          a.access_token,
        );
        assert.equal(changes.changes.length, documents.length + 3);
        assert.deepEqual(
          changes.changes.map((x: any) => x.sequence),
          Array.from({ length: documents.length + 3 }, (_, i) => i + 1),
        );
        assert.equal(
          (await json("/v1/briefings/" + d.id, undefined, a.access_token)).state
            .version,
          3,
        );
        assert.equal(
          (
            await json(
              "/v1/briefings?cursor=" + page.next_cursor + "&limit=2",
              undefined,
              a.access_token,
            )
          ).total,
          documents.length,
        );
      },
    );
    await t.test(
      "refresh rotation and family revocation survive replay",
      async () => {
        const rotated = await json("/v1/auth/refresh", {
          refresh_token: a.refresh_token,
        });
        await json("/v1/taxonomy", undefined, a.access_token, undefined, 401);
        await json("/v1/taxonomy", undefined, rotated.access_token);
        await json(
          "/v1/auth/refresh",
          { refresh_token: a.refresh_token },
          undefined,
          undefined,
          401,
        );
        await json(
          "/v1/taxonomy",
          undefined,
          rotated.access_token,
          undefined,
          401,
        );
        await json(
          "/v1/auth/sessions/current",
          undefined,
          b.access_token,
          "DELETE",
          204,
        );
        await json("/v1/taxonomy", undefined, b.access_token, undefined, 401);
        await json("/v1/auth/browser/start", {}, undefined, undefined, 404);
      },
    );
  });
