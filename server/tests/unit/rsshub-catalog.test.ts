// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from "node:test";
import assert from "node:assert/strict";
import { rsshubPlugin } from "../../src/plugins/rsshub/plugin.js";
import { formSchema, validateSettings } from "../../src/modules/plugins/dsl.js";

const operator = {
  base_url: "https://feeds.example.org",
  allowed_routes: ["/bbc", "/abc", "/douban/book/latest", "/hackernews"],
};
const suggestions = (config: unknown) => {
  const field = rsshubPlugin.configure(config).descriptor.form.fields[0]!;
  assert.equal(field.type, "text");
  return field.type === "text" ? field.suggestions! : [];
};

test("route catalog is finite, grouped and restricted by the same authorization as collection", () => {
  const routes = suggestions(operator);
  assert.equal(routes.length, 21);
  assert.deepEqual(
    new Set(routes.map((r) => r.group)),
    new Set(["新闻", "文化生活", "社区"]),
  );
  for (const route of routes)
    rsshubPlugin.configure(operator).validate({ route: route.value });
  assert.deepEqual(
    suggestions({ ...operator, allowed_routes: ["/bbc/world"] }).map(
      (r) => r.value,
    ),
    ["/bbc/world"],
  );
  assert.equal(suggestions({ ...operator, allowed_routes: ["/bb"] }).length, 0);
});

test("operator suggestions extend or rename routes but never grant authorization", () => {
  const routes = suggestions({
    ...operator,
    allowed_routes: ["/bbc", "/douban/event/hot"],
    route_suggestions: [
      { value: "/bbc", label: "每日头条", group: "新闻" },
      {
        value: "/douban/event/hot/118172",
        label: "同城活动",
        group: "文化生活",
      },
      { value: "/hackernews", label: "未授权" },
    ],
  });
  assert.equal(routes.filter((r) => r.value === "/bbc").length, 1);
  assert.equal(routes.find((r) => r.value === "/bbc")?.label, "每日头条");
  assert.ok(routes.some((r) => r.value === "/douban/event/hot/118172"));
  assert.ok(!routes.some((r) => r.value === "/hackernews"));
  assert.throws(() =>
    rsshubPlugin.configure({
      ...operator,
      route_suggestions: [{ value: "https://evil.invalid", label: "Bad" }],
    }),
  );
  assert.throws(
    () => rsshubPlugin.configure(operator).validate({ route: "/bbc-other" }),
    /route_not_allowed/,
  );
  // Suggestions are conveniences, not a closed enum or an authorization list.
  assert.deepEqual(
    rsshubPlugin
      .configure(operator)
      .validate({ route: "/bbc/science_and_environment" }),
    { route: "/bbc/science_and_environment" },
  );
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
