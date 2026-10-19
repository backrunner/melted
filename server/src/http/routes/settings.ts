// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import type { Hono } from "hono";
import type { AppEnv } from "../context.js";
import {
  settingsInput,
  settingsSection,
  settingsCatalogFor,
} from "../../modules/settings/dsl.js";
import { z } from "zod";
import { processingDisclosure } from "../../modules/processing/config.js";
import { Problem } from "../../shared/problem.js";
import {
  processingActionSchema,
  type ProcessingStatus,
} from "../../modules/processing/types.js";
import { idempotencyKey } from "../../modules/sources/schemas.js";

import {
  effectiveProcessing,
  authorizeCredentials,
  credentialStatus,
  saveCredentials,
  refreshProcessingContext,
} from "../../modules/processing/credentials.js";
import { credentialSection } from "../../modules/settings/credentials-dsl.js";

export function registerSettingsRoutes(app: Hono<AppEnv>) {
  app.get("/v1/settings", async (c) => {
    const owner = c.get("principal").owner,
      processing = await effectiveProcessing(
        c.env.repository,
        c.env.config,
        owner,
      );
    const catalog = await settingsCatalogFor(processing),
      descriptor = credentialSection(c.env.config, owner);
    return c.json({
      ...catalog,
      ...(descriptor ? { credentials: [descriptor] } : {}),
    });
  });
  app.get("/v1/settings/credentials/:scope", async (c) => {
    const scope = authorizeCredentials(
      c.env.config,
      c.get("principal").owner,
      c.req.param("scope"),
    );
    return c.json(
      await credentialStatus(
        c.env.config,
        scope,
        await c.env.repository.credentials.read(scope),
      ),
    );
  });
  app.post("/v1/settings/credentials/:scope", async (c) => {
    const owner = c.get("principal").owner,
      scope = authorizeCredentials(c.env.config, owner, c.req.param("scope"));
    await c.env.repository.limit("credentials:" + owner, 10);
    const result = await saveCredentials(
      c.env.repository,
      c.env.config,
      owner,
      scope,
      await c.req.json(),
      idempotencyKey(c.req.header("Idempotency-Key")),
    );
    await refreshProcessingContext(c.env.repository, c.env.config, owner);
    return c.json(result);
  });
  app.get("/v1/settings/preferences/processing", async (c) => {
    const status = await c.env.repository.processing.status(
        c.get("principal").owner,
      ),
      ai = await processingDisclosure(
        await effectiveProcessing(
          c.env.repository,
          c.env.config,
          c.get("principal").owner,
        ),
      );
    const result: ProcessingStatus & {
      preview: { label: string; value: string }[];
    } = {
      ...status,
      configured: Boolean(ai),
      phase: !ai
        ? "unavailable"
        : status.fingerprint && status.fingerprint !== ai.fingerprint
          ? "consent_required"
          : status.phase,
      daily_call_limit: c.env.config.processing?.daily_call_limit,
      preview: [],
    };
    if (result.policy)
      result.preview = [
        {
          label: "分类",
          value:
            result.policy.categories
              .map((t) => `${t.name}：${t.rule}`)
              .join("\n") || "不指定分类",
        },
        {
          label: "标签",
          value:
            [
              ...result.policy.tags.map((t) => `${t.name}：${t.rule}`),
              ...result.policy.tag_rules,
            ].join("\n") || "不指定标签",
        },
        {
          label: "预期内容",
          value: result.policy.include.join("\n") || "不限制内容范围",
        },
        {
          label: "排除内容",
          value: result.policy.exclude.join("\n") || "无明确排除",
        },
        {
          label: "个人偏好",
          value: result.policy.preferences.join("\n") || "不指定",
        },
        {
          label: "输出",
          value: [
            `语言：${result.policy.output.language}`,
            `风格：${result.policy.output.style}`,
            `结构：${result.policy.output.structure}`,
            `篇幅：${result.policy.output.length}`,
          ].join("\n"),
        },
        ...(result.policy.warnings.length
          ? [{ label: "需要确认", value: result.policy.warnings.join("\n") }]
          : []),
      ];
    return c.json(result);
  });
  app.post("/v1/settings/preferences/:action", async (c) => {
    const action = z
      .enum(["compile", "activate", "reprocess"])
      .safeParse(c.req.param("action"));
    if (!action.success) throw new Problem(404, "not_found");
    const parsed = processingActionSchema.safeParse(await c.req.json());
    if (!parsed.success || parsed.data.action !== action.data)
      throw new Problem(400, "invalid_processing_action");
    const ai = await processingDisclosure(
      await effectiveProcessing(
        c.env.repository,
        c.env.config,
        c.get("principal").owner,
      ),
    );
    if (!ai) throw new Problem(503, "processing_not_configured");
    if (parsed.data.fingerprint !== ai.fingerprint)
      throw new Problem(409, "processing_configuration_changed");
    const owner = c.get("principal").owner;
    await c.env.repository.limit("processing-action:" + owner, 20);
    return c.json(
      await c.env.repository.processing.action(
        owner,
        parsed.data.expected_version,
        action.data,
        ai.fingerprint,
        idempotencyKey(c.req.header("Idempotency-Key")),
      ),
    );
  });
  app.get("/v1/processing/jobs", async (c) =>
    c.json({
      jobs: (await c.env.repository.processing.jobs(c.get("principal").owner))
        .slice(-50)
        .map((j) => ({
          id: j.id,
          kind: j.kind,
          version: j.version,
          raw_id: j.raw_id,
          raw_revision: j.raw_revision,
          state: j.state,
          outcome: j.outcome,
          error: j.error,
          attempts: j.attempts,
          fingerprint: j.fingerprint,
          pipeline_version: "organize-v1",
          usage: Object.entries(j.stages).map(([stage, value]) => ({
            stage,
            ...value.usage,
          })),
        })),
    }),
  );
  app.get("/v1/settings/:section", async (c) => {
    const section = settingsSection(c.req.param("section"));
    const state = await c.env.repository.settings(
      c.get("principal").owner,
      section.id,
    );
    if (section.id !== "preferences" || !c.env.config.processing)
      return c.json(state);
    const status = await c.env.repository.processing.status(
        c.get("principal").owner,
      ),
      ai = await processingDisclosure(
        await effectiveProcessing(
          c.env.repository,
          c.env.config,
          c.get("principal").owner,
        ),
      );
    return c.json({
      ...state,
      application:
        status.version === state.version &&
        status.fingerprint === ai?.fingerprint
          ? status.phase === "active"
            ? "active"
            : status.phase === "pending"
              ? "pending"
              : "stored"
          : "stored",
    });
  });
  app.put("/v1/settings/:section", async (c) => {
    const section = settingsSection(c.req.param("section"));
    const input = settingsInput(section.id, await c.req.json());
    const owner = c.get("principal").owner;
    await c.env.repository.limit("settings:" + owner, 60);
    return c.json(
      await c.env.repository.saveSettings(
        owner,
        section.id,
        input,
        idempotencyKey(c.req.header("Idempotency-Key")),
      ),
    );
  });
}
