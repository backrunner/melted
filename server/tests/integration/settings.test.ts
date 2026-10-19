// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from "node:test";
import assert from "node:assert/strict";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { connect } from "../../src/storage/postgres/connection.js";
import { migrate } from "../../src/storage/postgres/migrations.js";
import { PostgresRepository } from "../../src/storage/postgres/repository.js";
import { CloudRepository } from "../../src/storage/cloudflare/repository.js";
import type { CloudBindings } from "../../src/storage/cloudflare/bindings.js";
import { createApp } from "../../src/http/app.js";
import { configSchema } from "../../src/config/schema.js";
import { hash, random } from "../../src/shared/crypto.js";
import type { SettingsState } from "../../src/modules/settings/dsl.js";

for (const target of ["Node/PostgreSQL", "workerd/SQLite DO"] as const) {
  test(`${target}: settings DSL transport, durable owner isolation, conflicts, history and idempotent retries`, async () => {
    const url = process.env.MELTED_TEST_DATABASE_URL;
    assert(url && url !== process.env.DATABASE_URL);
    const { database, pool } = connect(url);
    await migrate(database);
    const worker = target.startsWith("workerd")
      ? new Miniflare(
          convertV4MiniflareOptions({
            name: "settings-test",
            modules: true,
            scriptPath: ".wrangler/test-build/worker.js",
            compatibilityDate: "2026-10-14",
            compatibilityFlags: ["nodejs_compat"],
            durableObjects: {
              ACCOUNTS: { className: "AccountStore", useSQLite: true },
              CONTROL: { className: "ControlStore", useSQLite: true },
            },
            bindings: {
              MELTED_SERVER_ID: "settings-test",
              PUBLIC_ORIGIN: "http://localhost",
              REGISTRATION_MODE: "key",
            },
          }),
        )
      : undefined;
    try {
      const repo = worker
        ? new CloudRepository(await worker.getBindings<CloudBindings>())
        : new PostgresRepository(database);
      const owner = "acc_" + (await hash(random())),
        stranger = "acc_" + (await hash(random()));
      const session = await repo.managedSession(owner),
        other = await repo.managedSession(stranger);
      const app = createApp(),
        config = configSchema.parse({
          serverID: "settings-test",
          operator: "test",
          publicOrigin: "http://localhost",
        });
      const send = (
        path: string,
        method = "GET",
        body?: unknown,
        key?: string,
        token = session.access_token,
      ) => {
        const init = {
          method,
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/json",
            ...(key ? { "Idempotency-Key": key } : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        };
        return worker
          ? worker.dispatchFetch("http://localhost" + path, init)
          : app.request("http://localhost" + path, init, {
              repository: repo,
              config,
              remoteIP: owner,
            });
      };
      assert.equal(
        (await send("/v1/settings", "GET", undefined, undefined, "invalid"))
          .status,
        401,
      );
      const discovery = (await (await send("/.well-known/melted")).json()) as {
        capabilities: { server_settings: number };
      };
      assert.equal(discovery.capabilities.server_settings, 1);
      const catalog = (await (await send("/v1/settings")).json()) as {
        sections: {
          id: string;
          load: { path: string; method: string };
          save: { path: string; method: string; format: string };
        }[];
      };
      const section = catalog.sections[0]!;
      assert.equal(section.save.format, "versioned-values-v1");
      const initial = (await (
        await send(section.load.path, section.load.method)
      ).json()) as SettingsState;
      assert.equal(initial.version, 0);
      const input = {
        schema_version: 1,
        expected_version: 0,
        values: {
          ...initial.values,
          classification: "按生活、文化、工作分类",
          content: "关心本地活动",
          preferences: "保留不同观点",
          output: "简体中文\n先给摘要，再列来源",
        },
      };
      assert.equal(
        (await send(section.save.path, section.save.method, input)).status,
        400,
      );
      const key = random();
      const first = await send(
        section.save.path,
        section.save.method,
        input,
        key,
      );
      assert.equal(first.status, 200);
      const saved = (await first.json()) as SettingsState;
      assert.equal(saved.version, 1);
      assert.equal(saved.application, "stored");
      assert.deepEqual(saved.values, input.values);
      assert.deepEqual(
        await (
          await send(section.save.path, section.save.method, input, key)
        ).json(),
        saved,
      );
      assert.equal(
        (
          await send(
            section.save.path,
            section.save.method,
            { ...input, values: { ...input.values, output: "changed" } },
            key,
          )
        ).status,
        409,
      );
      assert.equal(
        (await send(section.save.path, section.save.method, input, random()))
          .status,
        409,
      );
      assert.equal(
        (
          await send(
            section.save.path,
            section.save.method,
            { ...input, schema_version: 2 },
            random(),
          )
        ).status,
        409,
      );
      for (const body of [
        { ...input, owner: stranger },
        { ...input, values: { ...input.values, unknown: "x" } },
        { ...input, values: { output: false } },
      ])
        assert.equal(
          (await send(section.save.path, section.save.method, body, random()))
            .status,
          400,
        );
      assert.equal((await send("/v1/settings/unknown")).status, 404);
      assert.equal((await send(section.save.path, "DELETE")).status, 404);
      const isolated = (await (
        await send(
          section.load.path,
          "GET",
          undefined,
          undefined,
          other.access_token,
        )
      ).json()) as SettingsState;
      assert.equal(isolated.version, 0);
      assert.equal(isolated.values.output, "");
      const writes = await Promise.all(
        ["A", "B"].map((output) =>
          send(
            section.save.path,
            section.save.method,
            {
              ...input,
              expected_version: 1,
              values: { ...input.values, output },
            },
            random(),
          ),
        ),
      );
      assert.deepEqual(writes.map((r) => r.status).sort(), [200, 409]);
      const latest = (await (
        await send(section.load.path)
      ).json()) as SettingsState;
      assert.equal(latest.version, 2);
      // An uncertain first response can be retried after another writer commits.
      assert.deepEqual(
        await (
          await send(section.save.path, section.save.method, input, key)
        ).json(),
        saved,
      );
      assert.deepEqual(await repo.settings(owner, section.id), latest);
      if (!worker) {
        assert.equal(
          (
            await database.query(
              "SELECT version FROM settings_versions WHERE owner=$1 ORDER BY version",
              [owner],
            )
          ).rows.length,
          2,
        );
        assert.deepEqual(
          await new PostgresRepository(database).settings(owner, section.id),
          latest,
        );
      }
      // Clearing explicit requirements is an ordinary versioned change, not deletion of history.
      const cleared = await send(
        section.save.path,
        section.save.method,
        { schema_version: 1, expected_version: 2, values: {} },
        random(),
      );
      assert.equal(cleared.status, 200);
      const empty = (await cleared.json()) as SettingsState;
      assert.equal(empty.version, 3);
      assert.deepEqual(empty.values, initial.values);
      if (!worker)
        await database.query("DELETE FROM accounts WHERE id=ANY($1::text[])", [
          [owner, stranger],
        ]);
    } finally {
      await worker?.dispose();
      await pool.end();
    }
  });
}
