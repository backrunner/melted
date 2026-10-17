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
  markup,
  type XMLNode,
} from "./xml.js";
export const ATOM = "http://www.w3.org/2005/Atom";
export function atomAuthors(node: XMLNode) {
  return children(node, "author", ATOM).map((n) => ({
    name: value(n, "name", ATOM) || undefined,
    url: link(value(n, "uri", ATOM), n),
  }));
}
function body(node: XMLNode | undefined): {
  content_html?: string;
  content_text?: string;
} {
  if (!node || node.attributes.src) return {};
  const type = node.attributes.type ?? "text";
  if (type === "html" || type === "text/html")
    return { content_html: text(node) };
  if (type === "xhtml") {
    const div = child(node, "div", "http://www.w3.org/1999/xhtml");
    if (!div) throw new Error("Invalid Atom XHTML");
    return { content_html: markup(div) };
  }
  if (type === "text" || type === "text/plain")
    return { content_text: text(node) };
  return {};
}
export async function atomItem(
  node: XMLNode,
): Promise<Record<string, unknown>> {
  const title = value(node, "title", ATOM),
    links = children(node, "link", ATOM);
  const alternate =
    links.find(
      (l) =>
        (!l.attributes.rel || l.attributes.rel === "alternate") &&
        (!l.attributes.type || l.attributes.type === "text/html"),
    ) ?? links.find((l) => l.attributes.rel === "alternate");
  const url = alternate
    ? link(alternate.attributes.href, alternate)
    : undefined;
  let content = body(child(node, "content", ATOM));
  if (!content.content_html && !content.content_text)
    content = body(child(node, "summary", ATOM));
  if (!content.content_html && !content.content_text)
    content = { content_text: title };
  const authors = atomAuthors(node);
  const item: Record<string, unknown> = {
    title: title || undefined,
    url,
    ...content,
    authors: authors.length ? authors : undefined,
    language: node.language || undefined,
    date_published: date(value(node, "published", ATOM)),
    date_modified: date(value(node, "updated", ATOM)),
    tags: children(node, "category", ATOM)
      .map((c) => c.attributes.term)
      .filter(Boolean),
    attachments: links
      .filter((l) => l.attributes.rel === "enclosure")
      .map((n) => ({
        url: link(n.attributes.href, n),
        mime_type: n.attributes.type,
        size_in_bytes: number(n.attributes.length),
        title: n.attributes.title,
      })),
  };
  item.id =
    value(node, "id", ATOM) ||
    url ||
    "content:" + (await hash(JSON.stringify(item)));
  return item;
}
