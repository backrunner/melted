// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  briefingSchema,
  fixtureSchema,
} from "../../src/modules/content/schemas.js";
import { filters } from "../../src/modules/content/filters.js";

test("published schemas stay aligned and shared Apple fixtures satisfy the server contract", async () => {
  const read = async (name: string) =>
    JSON.parse(
      await readFile(
        new URL(`../../../contracts/${name}`, import.meta.url),
        "utf8",
      ),
    );
  const [schema, api, briefing, library, filter, media] = await Promise.all([
    read("briefing.schema.json"),
    read("openapi.json"),
    read("fixtures/briefing.json"),
    read("fixtures/development-library.json"),
    read("fixtures/filter.json"),
    read("fixtures/embedded-media.json"),
  ]);
  assert.deepEqual(
    schema.components.securitySchemes,
    api.components.securitySchemes,
  );
  for (const [name, value] of Object.entries(schema.components.schemas)) {
    assert.deepEqual(value, api.components.schemas[name]);
  }
  assert.deepEqual(briefingSchema.parse(briefing), briefing);
  assert.deepEqual(briefingSchema.parse(media), media);
  assert.deepEqual(fixtureSchema.parse(library), library);
  for (const field of api.components.schemas.Briefing.required) {
    const incomplete = { ...briefing };
    delete incomplete[field];
    assert.equal(
      briefingSchema.safeParse(incomplete).success,
      false,
      `missing ${field}`,
    );
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filter)) {
    if (Array.isArray(value))
      for (const item of value) params.append(key, String(item));
    else if (value !== null) params.set(key, String(value));
  }
  assert.deepEqual(filters(params), { from: null, to: null, ...filter });
});
