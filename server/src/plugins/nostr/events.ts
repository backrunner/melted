// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { z } from "zod";
import { schnorr } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { blank, link, normalizeItems } from "../shared/social.js";
import { collectionResult } from "../../modules/plugins/sdk/index.js";
import { publicKey, type Settings } from "./config.js";

const hex = z.string().regex(/^[0-9a-f]{64}$/);
const eventSchema = z.object({
  id: hex,
  pubkey: hex,
  sig: z.string().regex(/^[0-9a-f]{128}$/),
  created_at: z.number().int().min(0).max(8.64e12),
  kind: z.union([z.literal(1), z.literal(30023)]),
  tags: z.array(z.array(z.string().max(4096)).max(32)).max(2000),
  content: z.string().max(256 * 1024),
});
export function normalizeEvents(values: unknown[], settings: Settings) {
  const addresses = new Set<string>();
  // Replaceable articles use their address as stable identity; choose newest (then lowest ID).
  // Only verified events enter this set, so forged newer entries cannot hide valid articles.
  const sorted = [...values].sort((a, b) => {
    const x = eventSchema.safeParse(a),
      y = eventSchema.safeParse(b);
    if (!x.success) return y.success ? 1 : 0;
    if (!y.success) return -1;
    return (
      y.data.created_at - x.data.created_at ||
      x.data.id.localeCompare(y.data.id)
    );
  });
  return normalizeItems(sorted, async (value) => {
    const e = eventSchema.parse(value);
    if (
      e.kind !== (settings.kind === "articles" ? 30023 : 1) ||
      e.created_at > Math.floor(Date.now() / 1000) + 300
    )
      throw new Error("invalid_event_filter");
    if (
      settings.mode === "author"
        ? e.pubkey !== publicKey(settings.target)
        : !e.tags.some((t) => t[0] === "t" && t[1] === settings.target)
    )
      throw new Error("invalid_event_filter");
    const digest = sha256(
      new TextEncoder().encode(
        JSON.stringify([0, e.pubkey, e.created_at, e.kind, e.tags, e.content]),
      ),
    );
    if (
      bytesToHex(digest) !== e.id ||
      !schnorr.verify(hexToBytes(e.sig), digest, hexToBytes(e.pubkey))
    )
      throw new Error("invalid_event_signature");
    const tag = (key: string) => e.tags.find((t) => t[0] === key)?.[1];
    const d = tag("d");
    if (e.kind === 30023 && d === undefined)
      throw new Error("missing_article_identifier");
    const id = e.kind === 30023 ? `30023:${e.pubkey}:${d}` : e.id;
    if (addresses.has(id)) return null;
    const result = blank(id);
    result.title = e.kind === 30023 ? (tag("title") ?? null) : null;
    result.parts = [{ kind: "text", mime_type: "text/plain", text: e.content }];
    result.authors = [{ name: e.pubkey }];
    result.published_at = new Date(e.created_at * 1000).toISOString();
    if (e.kind === 30023) {
      result.modified_at = result.published_at;
      const published = tag("published_at");
      if (
        published !== undefined &&
        (!/^\d+$/.test(published) || Number(published) > 8.64e12)
      )
        throw new Error("invalid_article_date");
      result.published_at =
        published === undefined
          ? null
          : new Date(Number(published) * 1000).toISOString();
    }
    result.tags = [
      ...new Set(e.tags.filter((t) => t[0] === "t" && t[1]).map((t) => t[1]!)),
    ];
    const image = link(tag("image"));
    if (image) result.media.push({ url: image });
    // Relay hints, URLs and imeta are data. Never fetch profiles, media or additional relays.
    await collectionResult({ items: [result] });
    addresses.add(id);
    return result;
  });
}
