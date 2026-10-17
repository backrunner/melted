// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import type { SettingSuggestion } from "../../modules/plugins/dsl.js";
import type { RSSHubConfig } from "./config.js";
import { authorizeRoute } from "./routes.js";

// Curated from upstream route metadata, not a claim of current upstream availability.
// References and runtime evidence are recorded in docs/rsshub.md.
const builtin: SettingSuggestion[] = [
  ...[
    ["", "BBC · 头条"],
    ["/world-asia", "BBC · 亚洲"],
    ["/world", "BBC · 世界"],
    ["/business", "BBC · 商业"],
    ["/technology", "BBC · 科技"],
    ["/chinese", "BBC · 中文"],
  ].map(([path, label]) => ({
    value: `/bbc${path}`,
    label: label!,
    group: "新闻",
    description: "栏目文章、摘要与原文链接",
  })),
  {
    value: "/abc",
    label: "ABC · 最新新闻",
    group: "新闻",
    description: "澳大利亚广播公司的最新报道",
  },
  ...[
    ["all", "全部"],
    ["fiction", "小说"],
    ["prose_poetry", "文学"],
    ["history", "历史文化"],
    ["biography", "社会纪实"],
    ["science", "科学新知"],
    ["art", "艺术设计"],
    ["business", "商业经管"],
    ["comics", "绘本漫画"],
  ].map(([type, title]) => ({
    value: `/douban/book/latest/${type}`,
    label: `豆瓣新书 · ${title}`,
    group: "文化生活",
    description: "新书介绍、作者与评分；来源可能不提供发布日期",
  })),
  ...[
    ["", "热门"],
    ["/newest", "最新"],
    ["/ask", "问答"],
    ["/show", "作品展示"],
    ["/jobs", "招聘"],
  ].map(([path, title]) => ({
    value: `/hackernews${path}`,
    label: `Hacker News · ${title}`,
    group: "社区",
    description: "社区提交的内容与讨论链接",
  })),
];

export function routeSuggestions(config: RSSHubConfig): SettingSuggestion[] {
  const values = new Map(builtin.map((entry) => [String(entry.value), entry]));
  for (const entry of config.route_suggestions ?? [])
    values.set(entry.value, entry);
  return [...values.values()].filter((entry) => {
    try {
      authorizeRoute(config, String(entry.value));
      return true;
    } catch {
      return false;
    }
  });
}
