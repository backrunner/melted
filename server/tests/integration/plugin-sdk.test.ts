// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

test("collector boilerplate bundles and runs through the plugin host in real workerd", async () => {
  const directory = await mkdtemp(join(tmpdir(), "melted-sdk-worker-"));
  let worker: Miniflare | undefined;
  try {
    const config = join(directory, "wrangler.json");
    await writeFile(
      config,
      JSON.stringify({
        name: "melted-sdk-test",
        main: resolve("tests/fixtures/plugin-sdk-worker.ts"),
        compatibility_date: "2026-10-14",
      }),
    );
    execFileSync(
      process.execPath,
      [
        "node_modules/wrangler/bin/wrangler.js",
        "deploy",
        "--config",
        config,
        "--dry-run",
        "--outdir",
        directory,
      ],
      { stdio: "pipe" },
    );
    worker = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        modulesRoot: directory,
        scriptPath: join(directory, "plugin-sdk-worker.js"),
        compatibilityDate: "2026-10-14",
      }),
    );
    const response = await worker.dispatchFetch("https://sdk.test");
    assert.equal(response.status, 200);
    const result = (await response.json()) as {
      items: { content: { external_id: string }; content_hash: string }[];
      received: number;
      warnings: unknown[];
    };
    assert.equal(result.items[0]!.content.external_id, "one");
    assert(result.items[0]!.content_hash.length > 20);
    assert.equal(result.received, 2);
    assert.equal(result.warnings.length, 1);
  } finally {
    await worker?.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});
