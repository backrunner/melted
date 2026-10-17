// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { hash } from "../../shared/crypto.js";
import { Problem } from "../../shared/problem.js";
import { formSchema, validateSettings } from "../../modules/plugins/dsl.js";
import type {
  PluginPreset,
  PresetProvider,
} from "../../modules/plugins/presets.js";
import { requestJSON } from "../../modules/plugins/sdk/http.js";
import type { RSSHubConfig } from "./config.js";
import { authorizeRoute, validRoute } from "./routes.js";

type Segment =
  { literal: string } | { name: string; optional: boolean; path: boolean };
type Entry = {
  preset: Omit<PluginPreset, "allowed">;
  prefix: string;
  segments: Segment[] | null;
};
type Snapshot = { revision: string; entries: Entry[]; expires: number };
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const text = (v: unknown, max: number, fallback = ""): string => {
  const value =
    typeof v === "string" && v.trim()
      ? v
          .replace(/[\ud800-\udfff]/gu, "\ufffd")
          .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ")
      : fallback;
  let result = "";
  for (const char of value) {
    if (result.length + char.length > max) break;
    result += char;
  }
  return result;
};

// Parse path metadata as data. Never compile or execute an upstream regular expression.
function segments(template: string): Segment[] | null {
  const parts: string[] = [];
  let part = "",
    depth = 0;
  for (const char of template.slice(1)) {
    if (char === "/" && depth === 0) {
      parts.push(part);
      part = "";
      continue;
    }
    part += char;
    if (char === "{") depth++;
    if (char === "}") depth--;
    if (depth < 0) return null;
  }
  if (depth !== 0) return null;
  if (part) parts.push(part);
  const result: Segment[] = [];
  for (const part of parts) {
    if (part === "*") {
      result.push({ name: "path", optional: false, path: true });
      continue;
    }
    const param = /^:([A-Za-z0-9_]+)(?:\{(.*)\})?(\?)?$/.exec(part);
    if (param)
      result.push({
        name: param[1]!,
        optional: Boolean(param[3]),
        path: Boolean(param[2]),
      });
    else if (/^[A-Za-z0-9_.~!$&'()+,;=@%-]+$/.test(part))
      result.push({ literal: part });
    else return null;
  }
  return result.filter((s) => ("literal" in s ? s.literal.length > 0 : true));
}
function permitted(config: RSSHubConfig, entry: Entry): boolean {
  return config.allowed_routes.some((prefix) => {
    if (!entry.segments)
      return (
        entry.prefix === prefix ||
        entry.prefix.startsWith(prefix + "/") ||
        prefix.startsWith(entry.prefix + "/")
      );
    const parts = prefix.slice(1).split("/");
    const tokens = entry.segments;
    const seen = new Map<string, boolean>();
    const match = (index: number, position: number): boolean => {
      if (position >= parts.length) return true;
      if (index >= tokens.length) return false;
      const key = index + ":" + position;
      if (seen.has(key)) return seen.get(key)!;
      const token = tokens[index]!;
      let result: boolean;
      if ("literal" in token)
        result =
          token.literal === parts[position] && match(index + 1, position + 1);
      else
        result =
          (token.optional && match(index + 1, position)) ||
          (token.path
            ? parts
                .slice(position)
                .some((_, offset) => match(index + 1, position + offset + 1))
            : match(index + 1, position + 1));
      seen.set(key, result);
      return result;
    };
    return match(0, 0);
  });
}
export async function normalizeRSSHubCatalog(data: unknown): Promise<Entry[]> {
  const namespaces = Object.entries(object(data));
  if (!namespaces.length || namespaces.length > 10000)
    throw new Error("Invalid namespace catalog");
  const entries: Entry[] = [];
  for (const [namespace, value] of namespaces) {
    if (
      !/^[A-Za-z0-9][A-Za-z0-9_.-]*(?:\/[A-Za-z0-9][A-Za-z0-9_.-]*)*$/.test(
        namespace,
      )
    )
      throw new Error("Invalid namespace");
    const info = object(value);
    for (const [path, metadata] of Object.entries(object(info.routes))) {
      if (
        (path !== "" && !path.startsWith("/")) ||
        path.length > 1800 ||
        entries.length >= 20000
      )
        throw new Error("Invalid route metadata");
      const route = object(metadata),
        features = object(route.features);
      const template = "/" + namespace + (path === "/" ? "" : path);
      let tokens = segments(template);
      if (tokens && tokens.filter((s) => !("literal" in s)).length > 20)
        tokens = null;
      const parameters = object(route.parameters);
      const requirements: string[] = [];
      if (Array.isArray(features.requireConfig))
        for (const item of features.requireConfig) {
          const name = text(object(item).name, 160);
          if (name)
            requirements.push(
              name +
                (object(item).optional === true ? "（可选）" : "（实例配置）"),
            );
        }
      else if (features.requireConfig) requirements.push("需要实例配置");
      if (features.requirePuppeteer) requirements.push("需要浏览器支持");
      if (features.antiCrawler) requirements.push("可能受上游反爬限制");
      const example = text(route.example, 2048);
      const input = formSchema.parse({
        fields: tokens
          ? tokens.flatMap((token, index) =>
              "literal" in token
                ? []
                : [
                    {
                      id: "p" + index,
                      type: "text",
                      label: token.name,
                      required: !token.optional,
                      max_length: 1000,
                      ...(text(parameters[token.name], 1000)
                        ? { help: text(parameters[token.name], 1000) }
                        : {}),
                    },
                  ],
            )
          : [
              {
                id: "route",
                type: "text",
                label: "订阅路由",
                required: true,
                max_length: 2048,
                help: "按上方路由格式填写完整相对路径",
                ...(validRoute(example) ? { default: example } : {}),
              },
            ],
      });
      let prefix = "/" + namespace;
      if (tokens) {
        const literals: string[] = [];
        for (const token of tokens) {
          if (!("literal" in token)) break;
          literals.push(token.literal);
        }
        prefix = "/" + literals.join("/");
      }
      const group = text(info.name, 200, namespace);
      entries.push({
        prefix,
        segments: tokens,
        preset: {
          id: await hash(template),
          label: text(route.name, 300, path || namespace),
          group,
          summary: template,
          description:
            text(
              [route.description, info.description]
                .filter((v) => typeof v === "string" && v.trim())
                .join("\n\n"),
              16000,
            ) || undefined,
          requirements: requirements.slice(0, 40),
          input,
        },
      });
    }
  }
  if (!entries.length) throw new Error("Empty namespace catalog");
  return entries.sort((a, b) =>
    a.preset.summary.localeCompare(b.preset.summary, "en"),
  );
}

/** The actual operator instance supplies the complete directory, not a client/bundled route list. */
export class RSSHubCatalog {
  private readonly cache = new Map<string, Snapshot>();
  private readonly pending = new Map<string, Promise<Snapshot>>();
  constructor(private readonly transport: typeof fetch = fetch) {}
  private async snapshot(config: RSSHubConfig): Promise<Snapshot> {
    const target = new URL("/api/namespace", config.base_url);
    if (config.access_key) target.searchParams.set("key", config.access_key);
    const key = await hash(target.href);
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) return cached;
    const pending = this.pending.get(key);
    if (pending) return pending;
    const task = (async () => {
      try {
        const response = await requestJSON(target, {
          transport: this.transport,
          timeoutMs: 15000,
          maxBytes: 8 * 1024 * 1024,
          headers: { Accept: "application/json" },
        });
        if (response.status !== 200) throw new Error("No catalog");
        const result = {
          revision: await hash(JSON.stringify(response.data)),
          entries: await normalizeRSSHubCatalog(response.data),
          expires: Date.now() + 300000,
        };
        // The directory may be several MiB. Keep the isolate cache bounded.
        if (this.cache.size >= 2)
          this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(key, result);
        return result;
      } catch {
        throw new Problem(503, "preset_catalog_unavailable");
      } finally {
        this.pending.delete(key);
      }
    })();
    this.pending.set(key, task);
    return task;
  }
  provider(config: RSSHubConfig): PresetProvider {
    return {
      list: async (query) => {
        const snapshot = await this.snapshot(config);
        const needle = query.query.trim().toLocaleLowerCase();
        const binding = await hash(
          JSON.stringify([needle, query.limit, config.allowed_routes]),
        );
        const prefix = snapshot.revision + "." + binding + ".";
        let offset = 0;
        if (query.cursor) {
          if (
            !query.cursor.startsWith(prefix) ||
            !/^\d+$/.test(query.cursor.slice(prefix.length))
          )
            throw new Problem(409, "preset_catalog_changed");
          offset = Number(query.cursor.slice(prefix.length));
        }
        const filtered = snapshot.entries.filter(
          ({ preset }) =>
            !needle ||
            [
              preset.group,
              preset.label,
              preset.summary,
              preset.description ?? "",
            ].some((s) => s.toLocaleLowerCase().includes(needle)),
        );
        if (
          !Number.isSafeInteger(offset) ||
          offset < 0 ||
          offset > filtered.length
        )
          throw new Problem(400, "invalid_preset_cursor");
        filtered.sort(
          (a, b) =>
            Number(permitted(config, b)) - Number(permitted(config, a)) ||
            a.preset.summary.localeCompare(b.preset.summary, "en"),
        );
        const page = filtered.slice(offset, offset + query.limit);
        return {
          presets: page.map((e) => ({
            ...e.preset,
            allowed: permitted(config, e),
          })),
          total: filtered.length,
          next_cursor:
            offset + page.length < filtered.length
              ? prefix + (offset + page.length)
              : null,
        };
      },
      resolve: async (id, input) => {
        const entry = (await this.snapshot(config)).entries.find(
          (e) => e.preset.id === id,
        );
        if (!entry) throw new Problem(404, "preset_not_found");
        const values = validateSettings(entry.preset.input, input);
        let route: string;
        if (!entry.segments) route = String(values.route);
        else {
          const parts: string[] = [];
          let omitted = false;
          for (const [index, token] of entry.segments.entries()) {
            if ("literal" in token) {
              parts.push(token.literal);
              omitted = false;
              continue;
            }
            const value = String(values["p" + index] ?? "");
            if (!value && token.optional) {
              omitted = true;
              continue;
            }
            if (omitted) throw new Problem(400, "preset_parameter_gap");
            if (!value || (!token.path && value.includes("/")))
              throw new Problem(400, "invalid_preset_parameter");
            parts.push(value.split("/").map(encodeURIComponent).join("/"));
          }
          route = "/" + parts.join("/");
        }
        authorizeRoute(config, route);
        if (route.length > 2048)
          throw new Problem(400, "invalid_preset_parameter");
        return {
          label: text(entry.preset.group + " · " + entry.preset.label, 200),
          configuration: { route },
        };
      },
    };
  }
}
