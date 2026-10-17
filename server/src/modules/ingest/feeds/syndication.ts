// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { CollectorError } from "../../plugins/definition.js";
import { normalizeFeed } from "./json-feed.js";
import { parseXML, child, children, value } from "./xml.js";
import { rssItem } from "./rss.js";
import { ATOM, atomAuthors, atomItem } from "./atom.js";

function decode(bytes: Uint8Array, contentType: string | null) {
  const prefix = new TextDecoder("ascii").decode(bytes.slice(0, 256));
  const bom =
    bytes[0] === 0xff && bytes[1] === 0xfe
      ? "utf-16le"
      : bytes[0] === 0xfe && bytes[1] === 0xff
        ? "utf-16be"
        : bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
          ? "utf-8"
          : undefined;
  const charset = /charset\s*=\s*["']?([\w-]+)/i.exec(contentType ?? "")?.[1];
  const declaration = /^\s*<\?xml\s[^?]*encoding\s*=\s*["']([\w-]+)["']/i.exec(
    prefix,
  )?.[1];
  return new TextDecoder(bom ?? charset ?? declaration ?? "utf-8", {
    fatal: true,
  }).decode(bytes);
}
export async function normalizeSyndication(
  bytes: Uint8Array,
  sourceURL: string,
  format: "auto" | "rss" | "atom" | "json" = "auto",
  maximum = 100,
  contentType: string | null = null,
) {
  try {
    if (
      bytes.byteLength > 4 * 1024 * 1024 ||
      !Number.isInteger(maximum) ||
      maximum < 1 ||
      maximum > 100
    )
      throw new Error("Invalid limits");
    const decoded = decode(bytes, contentType);
    if (decoded.trimStart().startsWith("{")) {
      if (format !== "auto" && format !== "json")
        throw new Error("Unexpected format");
      const feed = JSON.parse(decoded) as Record<string, unknown>;
      if (!Array.isArray(feed.items) || feed.items.length > 1000)
        throw new Error("Invalid feed items");
      return await normalizeFeed({
        ...feed,
        items: feed.items.slice(0, maximum),
      });
    }
    const root = parseXML(decoded, sourceURL);
    const atom = root.local === "feed" && root.uri === ATOM;
    const rss =
      root.local === "rss" && !root.uri && root.attributes.version === "2.0";
    if (
      (!atom && !rss) ||
      (format !== "auto" && format !== (atom ? "atom" : "rss"))
    )
      throw new Error("Unexpected format");
    const channel = atom ? root : child(root, "channel", "");
    if (!channel) throw new Error("Missing channel");
    const entries = children(channel, atom ? "entry" : "item");
    if (entries.length > 1000) throw new Error("Excessive entries");
    const items: unknown[] = [];
    for (const node of entries.slice(0, maximum)) {
      try {
        items.push(await (atom ? atomItem(node) : rssItem(node)));
      } catch {
        items.push({});
      } // Preserve the failed position for partial/retry semantics.
    }
    return await normalizeFeed({
      version: "https://jsonfeed.org/version/1.1",
      title: value(channel, "title"),
      items,
      language:
        channel.language ||
        (rss ? value(channel, "language") : undefined) ||
        undefined,
      authors: atom ? atomAuthors(channel) : undefined,
    });
  } catch (error) {
    if (error instanceof CollectorError) throw error;
    throw new CollectorError({ code: "invalid_feed", retryable: false });
  }
}
