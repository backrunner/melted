// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { hash } from "../../../shared/crypto.js";
import {
  child,
  children,
  text,
  value,
  link,
  date,
  number,
  type XMLNode,
} from "./xml.js";
const DC = "http://purl.org/dc/elements/1.1/";
const CONTENT = "http://purl.org/rss/1.0/modules/content/";
const MEDIA = "http://search.yahoo.com/mrss/";
const ITUNES = "http://www.itunes.com/dtds/podcast-1.0.dtd";
export async function rssItem(node: XMLNode): Promise<Record<string, unknown>> {
  const guid = child(node, "guid"),
    title = value(node, "title");
  const url =
    link(value(node, "link"), node) ??
    (guid?.attributes.isPermaLink !== "false" &&
    /^https?:\/\//i.test(text(guid).trim())
      ? link(text(guid), guid!)
      : undefined);
  const body =
    text(child(node, "encoded", CONTENT)) || text(child(node, "description"));
  const author =
    value(node, "creator", DC) ||
    value(node, "author") ||
    value(node, "author", ITUNES);
  const categories = children(node, "category")
    .map((n) => text(n).trim())
    .filter(Boolean);
  const enclosures = [
    ...children(node, "enclosure"),
    ...children(node, "content", MEDIA),
  ];
  const item: Record<string, unknown> = {
    title: title || undefined,
    url,
    ...(body ? { content_html: body } : { content_text: title }),
    authors: author ? [{ name: author }] : undefined,
    language: node.language || undefined,
    date_published: date(value(node, "pubDate") || value(node, "date", DC)),
    tags: categories,
    attachments: enclosures.map((n) => ({
      url: link(n.attributes.url, n),
      mime_type: n.attributes.type,
      size_in_bytes: number(n.attributes.length ?? n.attributes.fileSize),
      duration_in_seconds: number(n.attributes.duration),
    })),
    image:
      link(child(node, "thumbnail", MEDIA)?.attributes.url, node) ??
      link(child(node, "image", ITUNES)?.attributes.href, node),
  };
  item.id =
    text(guid).trim() || url || "content:" + (await hash(JSON.stringify(item)));
  return item;
}
