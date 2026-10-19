// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Synthetic model responses test execution and transport, not model intelligence.
import type { Policy } from "../../src/modules/processing/types.js";
export const fixturePolicy: Policy = {
  categories: [
    { name: "文化", rule: "阅读、艺术与公共文化活动" },
    { name: "出行", rule: "交通和通勤安排" },
  ],
  tags: [],
  tag_rules: ["标注原文明确提到的城市"],
  include: ["本地文化活动或交通变化"],
  exclude: ["仅有商业推广"],
  preferences: ["保留日期和不确定性，保留原始来源"],
  output: {
    language: "简体中文",
    style: "简洁",
    structure: "先摘要，再列关键事实和来源",
    length: "短文",
  },
  warnings: [],
};
function choice(options: string[], selected: string) {
  return {
    type: "choice",
    choice: selected,
    confidence: 0.99,
    probabilities: Object.fromEntries(
      options.map((k) => [k, k === selected ? 1 : 0]),
    ),
  };
}
export class FixtureModelTransport {
  calls: { stage: string; body: any; key: string }[] = [];
  badCitation = false;
  inventedNumber = false;
  inventedPartialNumber = false;
  unsupported = false;
  malformed = false;
  readonly fetch: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)),
      key = new Headers(init?.headers).get("Idempotency-Key") ?? "";
    if (body.messages) {
      const system = String(body.messages[0].content),
        stage = /Stage: ([a-z]+)/.exec(system)![1]!;
      const state = JSON.parse(body.messages[1].content);
      this.calls.push({ stage, body, key });
      if (this.malformed) return Response.json({ choices: [] });
      let value: unknown;
      if (stage === "compile") value = fixturePolicy;
      else if (stage === "candidates")
        value = {
          tags: state.evidence.some((e: { text: string }) =>
            e.text.includes("新加坡"),
          )
            ? [{ name: "新加坡", evidence_ids: ["e1"] }]
            : [],
        };
      else {
        const transport = state.evidence[0].text.includes("公交"),
          title = transport ? "新加坡公交安排变化" : "新加坡图书馆阅读活动";
        const claim = transport
          ? "新加坡公交线路将于2026年10月20日调整，具体时刻尚未确认"
          : "新加坡图书馆将在2026年10月20日举办阅读活动，报名安排尚未确认";
        value = {
          title,
          summary: transport
            ? "公交线路计划调整，时刻尚未确认"
            : "图书馆计划举办阅读活动，报名安排尚未确认",
          sections: [
            {
              heading: "摘要",
              claims: [
                {
                  text: transport
                    ? "公交线路计划调整，时刻尚未确认"
                    : "图书馆计划举办阅读活动，报名安排尚未确认",
                  evidence_ids: ["e1"],
                },
              ],
            },
            {
              heading: "关键事实",
              claims: [
                {
                  text: this.inventedNumber
                    ? claim + "，预计有9999人参加"
                    : this.inventedPartialNumber
                      ? claim + "，预计有26人参加"
                      : claim,
                  evidence_ids: [this.badCitation ? "e99" : "e1"],
                },
              ],
            },
          ],
        };
      }
      return Response.json({
        model: "synthetic-generator",
        choices: [
          {
            finish_reason: "stop",
            message: { content: JSON.stringify(value) },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      });
    }
    const verify = Object.hasOwn(body.questions, "claim0");
    this.calls.push({ stage: verify ? "verify" : "decision", body, key });
    const source = JSON.stringify(body.state),
      excluded = source.includes("纯推广广告"),
      uncertain = source.includes("待复核边界");
    const answers = Object.fromEntries(
      Object.entries(body.questions as Record<string, any>).map(([id, q]) => [
        id,
        q.type === "noul"
          ? {
              type: "noul",
              noul:
                id === "excluded"
                  ? excluded
                    ? 0.99
                    : 0.01
                  : id === "relevant"
                    ? excluded
                      ? 0.01
                      : uncertain
                        ? 0.5
                        : 0.99
                    : 0.99,
            }
          : choice(
              Object.keys(q.criteria),
              verify
                ? this.unsupported
                  ? "unknown"
                  : "supported"
                : id === "nature"
                  ? "factual"
                  : source.includes("公交")
                    ? "c1"
                    : "c0",
            ),
      ]),
    );
    return Response.json({
      model: "synthetic-jev",
      answers,
      usage: { input_tokens: 50, output_tokens: 20 },
    });
  };
}
