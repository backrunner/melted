// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from "node:test";
import assert from "node:assert/strict";
import { RSSHubCollector } from "../../src/plugins/rsshub/plugin.js";
import { formSchema, validateSettings } from "../../src/modules/plugins/dsl.js";
import { hash } from "../../src/shared/crypto.js";
import metadata from "../../../contracts/fixtures/rsshub-namespace.json" with { type: "json" };
const operator = {
  base_url: "https://feeds.example.org",
  allowed_routes: ["/bbc", "/twitter/user", "/npm", "/test"],
  access_key: "private-key",
};
const query = { query: "", limit: 50 };
function configured(data: unknown = metadata, config = operator) {
  return new RSSHubCollector(async () => Response.json(data)).configure(config);
}
test("instance catalog exposes only open routes, uses declared parameters and reveals requirements without secrets", async () => {
  const plugin = configured(),
    provider = plugin.presets!;
  const page = await provider.list(query);
  assert.equal(page.total, 5);
  assert(page.presets.every((p) => p.allowed));
  const routeField = plugin.descriptor.form.fields[0]!;
  assert(routeField.type === "text");
  assert.equal(routeField.suggestions, undefined);
  assert(!JSON.stringify(page).includes(operator.access_key));
  const twitter = page.presets.find((p) =>
    p.summary.startsWith("/twitter/user"),
  )!;
  assert(twitter.allowed);
  assert(twitter.requirements.some((r) => r.includes("TWITTER_AUTH_TOKEN")));
  const resolved = await provider.resolve(twitter.id, { p2: "_RSSHub" });
  assert.equal(resolved.configuration.route, "/twitter/user/_RSSHub");
  await assert.rejects(provider.resolve(twitter.id, {}));
  for (const value of ["../home", "%2e%2e", "user?key=secret", "user#fragment"])
    await assert.rejects(provider.resolve(twitter.id, { p2: value }));
  assert(!page.presets.some((p) => p.summary === "/twitter/home"));
  assert.equal(
    (await provider.list({ ...query, query: "/twitter/home" })).total,
    0,
  );
  await assert.rejects(
    provider.resolve(await hash("/twitter/home"), {}),
    /route_not_allowed/,
  );
  assert(!page.presets.some((p) => p.summary.includes("api-only")));
});
test("regex metadata is never executed, path parameters and unsupported templates remain represented", async () => {
  const provider = configured().presets!,
    page = await provider.list(query);
  const npm = page.presets.find((p) => p.summary.startsWith("/npm/"))!;
  assert.equal(
    (await provider.resolve(npm.id, { p2: "@scope/package" })).configuration
      .route,
    "/npm/package/%40scope/package",
  );
  const complex = page.presets.find((p) => p.summary.includes("prefix-"))!;
  assert.equal(complex.input.fields[0]?.id, "route");
  assert.equal(
    (await provider.resolve(complex.id, { route: "/test/prefix-news" }))
      .configuration.route,
    "/test/prefix-news",
  );
  await assert.rejects(
    provider.resolve(complex.id, { route: "/twitter/home" }),
    /route_not_allowed/,
  );
  const optional = page.presets.find((p) => p.summary.includes(":first?"))!;
  await assert.rejects(
    provider.resolve(optional.id, { p2: "later" }),
    /preset_parameter_gap/,
  );
  const bbc = page.presets.find((p) => p.summary.startsWith("/bbc"))!;
  assert.equal(
    (await provider.resolve(bbc.id, { p1: "world news" })).configuration.route,
    "/bbc/world%20news",
  );
});
test("search, pagination and cache bind to query and authorization, coalescing concurrent metadata requests", async () => {
  let calls = 0;
  const plugin = new RSSHubCollector(async (url, options) => {
    calls++;
    assert.equal(new URL(String(url)).pathname, "/api/namespace");
    assert.equal(new URL(String(url)).searchParams.get("key"), "private-key");
    assert.equal(options?.redirect, "manual");
    return Response.json(metadata);
  });
  const provider = plugin.configure(operator).presets!;
  const [first, same] = await Promise.all([
    provider.list({ ...query, limit: 2 }),
    provider.list({ ...query, limit: 2 }),
  ]);
  assert.deepEqual(first, same);
  assert.equal(calls, 1);
  assert(first.next_cursor);
  const second = await provider.list({
    ...query,
    limit: 2,
    cursor: first.next_cursor,
  });
  assert(!first.presets.some((p) => second.presets.some((s) => s.id === p.id)));
  assert.equal((await provider.list({ ...query, query: "Twitter" })).total, 1);
  await assert.rejects(
    provider.list({
      ...query,
      limit: 2,
      query: "bbc",
      cursor: first.next_cursor,
    }),
    /preset_catalog_changed/,
  );
  await assert.rejects(
    plugin
      .configure({ ...operator, allowed_routes: ["/bbc"] })
      .presets!.list({ ...query, limit: 2, cursor: first.next_cursor }),
    /preset_catalog_changed/,
  );
});
test("malformed, oversized, redirecting and failed catalogs return a stable error and can retry", async () => {
  for (const response of [
    () => Response.json({}),
    () => new Response("x".repeat(8 * 1024 * 1024 + 1)),
    () =>
      new Response(null, {
        status: 302,
        headers: { Location: "https://evil.invalid" },
      }),
    () => {
      throw new Error("https://feeds.example.org?key=private-key");
    },
  ]) {
    let fail = true;
    const provider = new RSSHubCollector(async () =>
      fail ? response() : Response.json(metadata),
    ).configure(operator).presets!;
    await assert.rejects(
      provider.list(query),
      (error) =>
        error instanceof Error &&
        error.message === "preset_catalog_unavailable",
    );
    fail = false;
    assert.equal((await provider.list(query)).total, 5);
  }
});
test("DSL rejects ambiguous, wrongly typed and out-of-range suggestions without restricting custom input", () => {
  const field = {
    id: "count",
    type: "integer",
    label: "数量",
    minimum: 1,
    maximum: 9,
    step: 2,
  };
  for (const suggestions of [
    [
      { value: 3, label: "A" },
      { value: 3, label: "B" },
    ],
    [{ value: "3", label: "String" }],
    [{ value: 2, label: "Wrong step" }],
    [{ value: 11, label: "Out of range" }],
  ])
    assert.equal(
      formSchema.safeParse({ fields: [{ ...field, suggestions }] }).success,
      false,
    );
  const form = formSchema.parse({
    fields: [{ ...field, suggestions: [{ value: 3, label: "常用" }] }],
  });
  assert.deepEqual(validateSettings(form, { count: 7 }), { count: 7 });
});

test("nested namespaces, empty root aliases and unicode metadata stay usable", async () => {
  const provider = configured(
    {
      "gov/cn": { name: "政务", routes: { "": { name: "Root" } } },
      bbc: {
        name: "",
        routes: {
          "/": { name: "", parameters: {}, description: "😀".repeat(10000) },
        },
      },
    },
    { ...operator, allowed_routes: [...operator.allowed_routes, "/gov/cn"] },
  ).presets!;
  const page = await provider.list(query);
  assert.equal(page.total, 2);
  assert(page.presets.some((p) => p.summary === "/gov/cn"));
  assert(page.presets.every((p) => p.label && p.group));
  assert.equal(
    page.presets.find((p) => p.summary === "/bbc")!.description!.length,
    16000,
  );
});

test("a narrow authorization does not enable a different route sharing a parameterized namespace", async () => {
  const plugin = new RSSHubCollector(async () =>
    Response.json({
      douban: {
        name: "豆瓣",
        routes: {
          "/:id/discussion": { name: "Discussion" },
          "/book/latest/:type?": { name: "Books" },
        },
      },
    }),
  ).configure({ ...operator, allowed_routes: ["/douban/book/latest"] });
  const page = await plugin.presets!.list(query);
  assert.equal(page.total, 1);
  assert(!page.presets.some((p) => p.label === "Discussion"));
  assert.equal(page.presets.find((p) => p.label === "Books")!.allowed, true);
});
