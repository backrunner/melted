// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { z } from "zod";
import {
  formSchema,
  identifier,
  configurationSchema,
  validateSettings,
} from "../plugins/dsl.js";
import { isPortableText } from "../../shared/text.js";
import { Problem } from "../../shared/problem.js";
import type { ProcessingConfig } from "../processing/config.js";
import { processingDisclosure } from "../processing/config.js";

import { credentialSectionSchema } from "./credentials-dsl.js";

const label = z.string().min(1).max(1000).refine(isPortableText);
// Settings descriptors cannot target authentication, other origins or arbitrary APIs.
const path = z
  .string()
  .regex(/^\/v1\/settings\/[a-z][a-z0-9_-]*(?:\/[a-z][a-z0-9_-]*)*(?![\s\S])/)
  .max(200);
export const settingsSectionSchema = z
  .object({
    id: identifier,
    schema_version: z.number().int().min(1),
    title: label,
    description: label,
    form: formSchema,
    load: z.object({ method: z.literal("GET"), path }).strict(),
    save: z
      .object({
        method: z.enum(["PUT", "POST", "PATCH"]),
        path,
        format: z.literal("versioned-values-v1"),
        max_bytes: z.number().int().min(1).max(32768),
        label,
      })
      .strict(),
    workflow: z
      .object({
        format: z.literal("processing-actions-v1"),
        fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
        status: z.object({ method: z.literal("GET"), path }).strict(),
        actions: z
          .array(
            z
              .object({
                id: z.enum(["compile", "activate", "reprocess"]),
                label,
                method: z.literal("POST"),
                path,
                enabled_phases: z
                  .array(
                    z.enum([
                      "stored",
                      "pending",
                      "ready",
                      "active",
                      "failed",
                      "consent_required",
                    ]),
                  )
                  .min(1)
                  .max(6),
                confirmation: label,
              })
              .strict(),
          )
          .max(3),
      })
      .strict()
      .optional(),
  })
  .strict();
export const settingsCatalogSchema = z
  .object({
    dsl_version: z.literal(1),
    sections: z.array(settingsSectionSchema).max(20),
    credentials: z.array(credentialSectionSchema).max(1).optional(),
  })
  .strict()
  .refine(
    (c) => new Set(c.sections.map((s) => s.id)).size === c.sections.length,
  );
export type SettingsSection = z.infer<typeof settingsSectionSchema>;
export const settingsCatalog = settingsCatalogSchema.parse({
  dsl_version: 1,
  sections: [
    {
      id: "preferences",
      schema_version: 1,
      title: "内容与输出偏好",
      description: "描述你希望看到的内容，以及分类和输出方式，留空表示不指定",
      form: {
        fields: [
          {
            id: "classification",
            type: "text",
            label: "分类与标签",
            placeholder:
              "例如：按文化、生活、工作分类，为提到的城市和人物添加标签",
            required: false,
            default: "",
            multiline: true,
            max_length: 4096,
          },
          {
            id: "content",
            type: "text",
            label: "想看到的内容",
            placeholder:
              "例如：关注本地文化活动、阅读和公共服务变化，少看重复推广",
            required: false,
            default: "",
            multiline: true,
            max_length: 4096,
          },
          {
            id: "preferences",
            type: "text",
            label: "个人偏好",
            placeholder:
              "例如：保留不同观点；信息不确定时明确说明，不替我推断立场",
            required: false,
            default: "",
            multiline: true,
            max_length: 4096,
          },
          {
            id: "output",
            type: "text",
            label: "输出偏好",
            placeholder:
              "例如：使用简体中文，先给摘要，再列关键事实和来源，语气简洁",
            required: false,
            default: "",
            multiline: true,
            max_length: 4096,
          },
        ],
      },
      load: { method: "GET", path: "/v1/settings/preferences" },
      save: {
        method: "PUT",
        path: "/v1/settings/preferences",
        format: "versioned-values-v1",
        max_bytes: 32768,
        label: "保存偏好",
      },
    },
  ],
});
export const settingsStateSchema = z
  .object({
    schema_version: z.number().int().min(1),
    version: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    values: configurationSchema,
    application: z.enum(["stored", "pending", "active"]),
  })
  .strict();
export const settingsMutationSchema = z
  .object({
    schema_version: z.number().int().min(1),
    expected_version: z
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER - 1),
    values: configurationSchema,
  })
  .strict();
export type SettingsState = z.infer<typeof settingsStateSchema>;
export type SettingsMutation = z.infer<typeof settingsMutationSchema>;
export function settingsSection(id: string) {
  const section = settingsCatalog.sections.find((s) => s.id === id);
  if (!section) throw new Problem(404, "settings_not_found");
  return section;
}
export function settingsInput(id: string, body: unknown): SettingsMutation {
  const section = settingsSection(id);
  const parsed = settingsMutationSchema.safeParse(body);
  if (!parsed.success) throw new Problem(400, "invalid_settings_input");
  if (parsed.data.schema_version !== section.schema_version)
    throw new Problem(409, "settings_schema_changed");
  return {
    ...parsed.data,
    values: validateSettings(section.form, parsed.data.values),
  };
}
export function emptySettings(id: string): SettingsState {
  const section = settingsSection(id);
  return {
    schema_version: section.schema_version,
    version: 0,
    values: validateSettings(section.form, {}),
    application: "stored",
  };
}
export async function settingsCatalogFor(processing?: ProcessingConfig) {
  const ai = await processingDisclosure(processing);
  if (!ai) return settingsCatalog;
  const section = settingsCatalog.sections[0]!;
  return settingsCatalogSchema.parse({
    ...settingsCatalog,
    sections: [
      {
        ...section,
        workflow: {
          format: "processing-actions-v1",
          fingerprint: ai.fingerprint,
          status: {
            method: "GET",
            path: "/v1/settings/preferences/processing",
          },
          actions: [
            {
              id: "compile",
              label: "生成整理规则",
              method: "POST",
              path: "/v1/settings/preferences/compile",
              enabled_phases: ["stored", "failed", "consent_required"],
              confirmation: `将本版偏好发送至 ${ai.destinations.join("、")} 生成整理规则并消耗模型额度。确认启用后，已采集的公开来源内容也将发送至这些服务用于分类、筛选、生成与材料检查。原始资料会保留`,
            },
            {
              id: "activate",
              label: "启用整理规则",
              method: "POST",
              path: "/v1/settings/preferences/activate",
              enabled_phases: ["ready"],
              confirmation:
                "按这些规则处理已采集及后续新增的公开来源内容，调用已声明的模型并消耗额度；旧版生成结果将由当前版本重新整理",
            },
            {
              id: "reprocess",
              label: "重试失败任务",
              method: "POST",
              path: "/v1/settings/preferences/reprocess",
              enabled_phases: ["active"],
              confirmation:
                "重新执行当前版本失败的整理任务，可能再次产生模型费用；已成功的任务不会重复处理",
            },
          ],
        },
      },
    ],
  });
}
