// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { mkdir, readFile, writeFile, access, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";

export async function scaffoldPlugin(
  id: string,
  root = fileURLToPath(new URL("../", import.meta.url)),
) {
  if (
    !/^[a-z][a-z0-9-]{2,49}$/.test(id) ||
    ["constructor", "prototype"].includes(id)
  )
    throw new Error(
      "Use a lowercase plugin ID of 3–50 letters, digits or hyphens",
    );
  const directory = join(root, "src/plugins", id),
    testFile = join(root, "tests/unit", `${id}-plugin.test.ts`);
  const exists = async (path: string) => {
    try {
      await access(path);
      return true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw e;
    }
  };
  if ((await exists(directory)) || (await exists(testFile)))
    throw new Error(
      "Plugin directory or test already exists; nothing was overwritten",
    );
  await mkdir(directory); // Exclusive: a concurrent scaffold cannot replace another plugin.
  let createdTest = false;
  try {
    for (const name of [
      "config.ts",
      "descriptor.ts",
      "plugin.ts",
      "plugin.test.ts",
    ]) {
      let content = (
        await readFile(join(root, "templates/collector", name), "utf8")
      ).replaceAll("example.articles", id);
      if (name === "plugin.test.ts") {
        content = content.replace(
          '"./plugin.js"',
          `"../../src/plugins/${id}/plugin.js"`,
        );
        await writeFile(testFile, content, { flag: "wx" });
        createdTest = true;
      } else {
        content = content.replaceAll('"../../src/modules/', '"../../modules/');
        await writeFile(join(directory, name), content, { flag: "wx" });
      }
    }
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    if (createdTest) await rm(testFile);
    throw error;
  }
  return { directory, testFile };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const id = process.argv[2] ?? "";
  const output = await scaffoldPlugin(id);
  console.log(
    `Created ${output.directory} and ${output.testFile}\nNext: register examplePlugin in src/plugins/index.ts, add its manifest to plugins.json, and configure PLUGIN_CONFIG.${id}. See docs/plugin-development.md.`,
  );
}
