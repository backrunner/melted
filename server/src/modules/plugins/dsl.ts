// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { z } from "zod";
import { isPortableText } from "../../shared/text.js";
import { Problem } from "../../shared/problem.js";

export const identifier = z
  .string()
  .regex(/^[a-z][a-z0-9_.-]{0,99}$/)
  .refine((v) => !["__proto__", "constructor", "prototype"].includes(v));
const label = z.string().min(1).max(1000).refine(isPortableText);
export const settingValue = z.union([
  z.string().max(4096).refine(isPortableText),
  z.number().finite(),
  z.boolean(),
]);
export const configurationSchema = z
  .record(identifier, settingValue)
  .refine((v) => Object.keys(v).length <= 40);
export type Configuration = z.infer<typeof configurationSchema>;
const base = {
  id: identifier,
  label,
  help: label.optional(),
  required: z.boolean().default(true),
};
export const fieldSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...base,
      type: z.literal("text"),
      default: z.string().optional(),
      placeholder: label.optional(),
      max_length: z.number().int().min(1).max(4096),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("integer"),
      default: z.number().int().optional(),
      minimum: z.number().int(),
      maximum: z.number().int(),
      step: z.number().int().positive().default(1),
      unit: label.optional(),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("boolean"),
      default: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("select"),
      default: z.string().optional(),
      options: z
        .array(z.object({ value: z.string().max(200), label }).strict())
        .min(1)
        .max(100),
    })
    .strict(),
]);
export const formSchema = z
  .object({ fields: z.array(fieldSchema).max(40) })
  .strict()
  .superRefine((form, ctx) => {
    const ids = new Set<string>();
    for (const field of form.fields) {
      if (ids.has(field.id))
        ctx.addIssue({ code: "custom", message: "Duplicate field" });
      ids.add(field.id);
      if (field.type === "integer" && field.minimum > field.maximum)
        ctx.addIssue({ code: "custom", message: "Invalid range" });
      if (
        field.type === "select" &&
        new Set(field.options.map((o) => o.value)).size !== field.options.length
      )
        ctx.addIssue({ code: "custom", message: "Duplicate option" });
    }
  });
export type SettingsForm = z.infer<typeof formSchema>;
export const descriptorSchema = z
  .object({
    dsl_version: z.literal(1),
    id: identifier,
    version: z.string().min(1).max(100),
    title: label,
    description: label,
    kind: z.literal("collector"),
    config_version: z.literal(1),
    capabilities: z.array(z.literal("collector.poll")).length(1),
    form: formSchema,
    actions: z
      .array(
        z
          .object({
            id: identifier,
            label,
            description: label,
            effect: z.enum(["collect", "validate"]),
            input: formSchema.safeExtend({
              fields: z.array(fieldSchema).max(0),
            }),
            confirmation: label.optional(),
          })
          .strict(),
      )
      .max(10),
  })
  .strict()
  .refine(
    (d) => new Set(d.actions.map((a) => a.id)).size === d.actions.length,
    "Duplicate action",
  );
export type PluginDescriptor = z.infer<typeof descriptorSchema>;
export const publicDescriptorSchema = descriptorSchema.safeExtend({
  available: z.boolean(),
  unavailable_reason: z.string().nullable(),
});
export const catalogSchema = z
  .object({
    dsl_version: z.literal(1),
    source_form: formSchema,
    plugins: z.array(publicDescriptorSchema).max(100),
  })
  .strict();

/** The same finite form vocabulary validates both settings and action inputs. */
export function validateSettings(
  form: SettingsForm,
  value: unknown,
): Configuration {
  const parsed = configurationSchema.safeParse(value);
  if (!parsed.success) throw new Problem(400, "invalid_plugin_settings");
  const result: Configuration = {};
  if (
    Object.keys(parsed.data).some(
      (key) => !form.fields.some((f) => f.id === key),
    )
  )
    throw new Problem(400, "unknown_plugin_field");
  for (const field of form.fields) {
    const v = parsed.data[field.id] ?? field.default;
    if (v === undefined) {
      if (field.required) throw new Problem(400, "missing_plugin_field");
      continue;
    }
    let valid = false;
    switch (field.type) {
      case "text":
        valid =
          typeof v === "string" &&
          v.length <= field.max_length &&
          (!field.required || v.trim().length > 0);
        break;
      case "integer":
        valid =
          typeof v === "number" &&
          Number.isSafeInteger(v) &&
          v >= field.minimum &&
          v <= field.maximum &&
          (v - field.minimum) % field.step === 0;
        break;
      case "boolean":
        valid = typeof v === "boolean";
        break;
      case "select":
        valid =
          typeof v === "string" && field.options.some((o) => o.value === v);
        break;
    }
    if (!valid) throw new Problem(400, "invalid_plugin_field");
    result[field.id] = v;
  }
  return result;
}

export const sourceForm = formSchema.parse({
  fields: [
    { id: "name", type: "text", label: "名称", max_length: 200 },
    { id: "enabled", type: "boolean", label: "自动采集", default: true },
    {
      id: "interval_seconds",
      type: "integer",
      label: "采集间隔",
      minimum: 300,
      maximum: 86400,
      step: 1,
      unit: "秒",
      default: 900,
    },
  ],
});
