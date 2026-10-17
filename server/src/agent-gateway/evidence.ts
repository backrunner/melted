// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { z } from "zod";
import {
  authorizedURL,
  type AgentSettings,
  type CollectionProfile,
} from "../modules/agent-collection/protocol.js";
import {
  collectionResult,
  requestBytes,
} from "../modules/plugins/sdk/index.js";
import { normalizeSyndication } from "../modules/ingest/feeds/syndication.js";
import { blank } from "../plugins/shared/social.js";
import { hash } from "../shared/crypto.js";
import type { RawContent } from "../modules/sources/types.js";

export const fetchInput = z
  .object({
    url: z.string().max(2048),
    format: z.enum(["auto", "page", "rss", "atom", "json"]).default("auto"),
  })
  .strict();
export class EvidenceStore {
  private readonly items = new Map<string, RawContent>();
  private readonly fetched = new Map<string, unknown>();
  private bytes = 0;
  private requests = 0;
  private successful = 0;
  private invalid = 0;
  private selection?: string[];
  constructor(
    private readonly settings: AgentSettings,
    private readonly profile: CollectionProfile,
    private readonly signal: AbortSignal,
    private readonly transport: typeof fetch = fetch,
  ) {}
  async fetch(input: unknown) {
    this.signal.throwIfAborted();
    if (this.selection) throw new Error("agent_already_submitted");
    const { url: value, format } = fetchInput.parse(input);
    const url = authorizedURL(this.profile, value),
      key = JSON.stringify([url.href, format]);
    if (this.fetched.has(key)) return this.fetched.get(key);
    if (++this.requests > this.settings.max_requests)
      throw new Error("agent_request_limit");
    try {
      const response = await requestBytes(url, {
        signal: this.signal,
        transport: this.transport,
        maxBytes: 2 * 1024 * 1024,
        timeoutMs: 10000,
        headers: { "User-Agent": "Melted/0.2 Agent collection" },
      });
      if (response.status !== 200) throw new Error("agent_fetch_failed");
      const type = response.headers.get("Content-Type") ?? "";
      const page =
        format === "page" ||
        (format === "auto" && /^(text\/html|text\/plain)(?:;|$)/i.test(type));
      let contents: RawContent[];
      if (page) {
        if (!/^(text\/html|text\/plain)(?:;|$)/i.test(type))
          throw new Error("agent_unsupported_page");
        const text = new TextDecoder("utf-8", { fatal: true }).decode(
          response.data,
        );
        const content = blank(url.href);
        content.canonical_url = url.href;
        content.parts = [
          {
            kind: /^text\/html/i.test(type) ? "html" : "text",
            mime_type: /^text\/html/i.test(type) ? "text/html" : "text/plain",
            text,
          },
        ];
        // No guessed date, generated title, JS execution, attachment or readability fetch.
        contents = [content];
      } else {
        const result = await normalizeSyndication(
          response.data,
          url.href,
          format,
          100,
          type,
        );
        this.invalid += result.warnings.length;
        contents = result.items.map((i) => i.content);
      }
      const candidates = [];
      let previewBudget = 64000;
      for (const original of contents) {
        const content = {
          ...original,
          external_id: page
            ? url.href
            : `feed:${url.href}#${await hash(original.external_id)}`,
        };
        try {
          await collectionResult({ items: [content] });
        } catch {
          this.invalid++;
          continue;
        }
        const serialized = JSON.stringify(content),
          id = await hash(serialized),
          size = new TextEncoder().encode(serialized).length;
        if (!this.items.has(id)) {
          if (this.items.size >= 200 || this.bytes + size > 3 * 1024 * 1024)
            throw new Error("agent_evidence_limit");
          this.items.set(id, content);
          this.bytes += size;
        }
        const preview = content.parts
          .map((p) => p.text)
          .join("\n")
          .slice(0, Math.min(12000, previewBudget));
        previewBudget -= preview.length;
        candidates.push({
          evidence_id: id,
          title: content.title?.slice(0, 500) ?? null,
          url: content.canonical_url,
          published_at: content.published_at,
          text: preview,
          preview_truncated:
            preview.length <
            content.parts.reduce((n, p) => n + p.text.length, 0),
        });
      }
      const output = {
        untrusted_source_data: true,
        fetched_url: url.href,
        candidates,
      };
      this.successful++;
      this.fetched.set(key, output);
      return output;
    } catch {
      this.invalid++;
      throw new Error("agent_fetch_failed");
    }
  }
  select(input: unknown) {
    this.signal.throwIfAborted();
    if (!this.successful) throw new Error("agent_no_evidence");
    if (this.selection) throw new Error("agent_already_submitted");
    const selection = z
      .object({
        evidence_ids: z
          .array(z.string().regex(/^[a-f0-9]{64}$/))
          .max(this.settings.max_items),
      })
      .strict()
      .parse(input);
    if (new Set(selection.evidence_ids).size !== selection.evidence_ids.length)
      throw new Error("agent_duplicate_evidence");
    if (selection.evidence_ids.some((id) => !this.items.has(id)))
      throw new Error("agent_unknown_evidence");
    this.selection = selection.evidence_ids;
    return { selected: this.selection.length };
  }
  async result() {
    this.signal.throwIfAborted();
    if (!this.selection) throw new Error("agent_selection_missing");
    const items = this.selection.map((id) => this.items.get(id)!);
    return collectionResult({
      items,
      warnings: Array.from(
        { length: Math.min(this.invalid, 999) },
        (_, index) => ({ index, code: "agent_source_invalid" }),
      ),
    });
  }
}
