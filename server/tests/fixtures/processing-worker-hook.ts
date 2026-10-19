// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Explicit test-process preload. Never imported by a production entrypoint.
import { FixtureModelTransport } from "./processing-model.js";
export const syntheticFeed = {
  version: "https://jsonfeed.org/version/1.1",
  title: "Synthetic authorized culture fixture",
  items: [
    {
      id: "runtime-culture",
      url: "https://example.org/culture",
      content_text:
        "新加坡图书馆将在2026年10月20日举办阅读活动，报名安排尚未确认",
    },
  ],
};
const fixture = new FixtureModelTransport(),
  nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  if (["generator.example", "decision.example"].includes(url.hostname))
    return fixture.fetch(input, init);
  if (url.hostname === "feed.example") return Response.json(syntheticFeed);
  return nativeFetch(input, init);
};
