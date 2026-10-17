// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import sax from "sax";
import { z } from "zod";

export type XMLNode = {
  name: string;
  local: string;
  uri: string;
  attributes: Record<string, string>;
  children: (XMLNode | string)[];
  base: string;
  language?: string;
};
/** Bounded XML only. No DTDs, external entities, stylesheet loading or network IO. */
export function parseXML(text: string, base: string): XMLNode {
  const options: sax.SAXOptions & { strictEntities: boolean } = {
    xmlns: true,
    strictEntities: true,
    position: false,
  };
  const parser = sax.parser(true, options);
  const stack: XMLNode[] = [];
  let root: XMLNode | undefined,
    nodes = 0;
  const fail = () => {
    throw new Error("Invalid or excessive feed XML");
  };
  parser.onerror = fail;
  parser.ondoctype = fail;
  parser.onsgmldeclaration = fail;
  parser.onopentag = (tag) => {
    if (
      stack.length >= 64 ||
      ++nodes > 20000 ||
      Object.keys(tag.attributes).length > 100
    )
      fail();
    const qualified = tag as sax.QualifiedTag;
    const attributes = Object.fromEntries(
      Object.values(qualified.attributes).map((a) => [a.name, a.value]),
    );
    const parent = stack.at(-1);
    const node: XMLNode = {
      name: tag.name,
      local: qualified.local,
      uri: qualified.uri,
      attributes,
      children: [],
      base: attributes["xml:base"]
        ? new URL(attributes["xml:base"], parent?.base ?? base).href
        : (parent?.base ?? base),
      language: attributes["xml:lang"] ?? parent?.language,
    };
    if (parent) parent.children.push(node);
    else {
      if (root) fail();
      root = node;
    }
    stack.push(node);
  };
  parser.onclosetag = () => {
    stack.pop();
  };
  const append = (text: string) => {
    const parent = stack.at(-1);
    if (parent) parent.children.push(text);
    else if (text.trim()) fail();
  };
  parser.ontext = append;
  parser.oncdata = append;
  parser.write(text).close();
  if (!root || stack.length) fail();
  return root!;
}
export function children(
  node: XMLNode,
  local: string,
  uri = node.uri,
): XMLNode[] {
  return node.children.filter(
    (c): c is XMLNode =>
      typeof c !== "string" && c.local === local && c.uri === uri,
  );
}
export function child(node: XMLNode, local: string, uri = node.uri) {
  return children(node, local, uri)[0];
}
export function text(node: XMLNode | undefined): string {
  return (
    node?.children.map((c) => (typeof c === "string" ? c : text(c))).join("") ??
    ""
  );
}
export function value(node: XMLNode, local: string, uri = node.uri) {
  return text(child(node, local, uri)).trim();
}
const escape = (v: string) =>
  v
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
/** Untrusted raw XHTML evidence; clients must never execute this markup. */
export function markup(node: XMLNode): string {
  return `<${node.name}${Object.entries(node.attributes)
    .map(([k, v]) => ` ${k}="${escape(v)}"`)
    .join(
      "",
    )}>${node.children.map((c) => (typeof c === "string" ? escape(c) : markup(c))).join("")}</${node.name}>`;
}
export function link(
  value: string | undefined,
  node: XMLNode,
): string | undefined {
  if (!value?.trim()) return undefined;
  const url = new URL(value.trim(), node.base);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("Invalid feed link");
  return url.href;
}
export function date(value: string): string | undefined {
  if (!value) return undefined;
  if (/^\d{4}-/.test(value)) z.iso.datetime({ offset: true }).parse(value);
  else {
    const parts =
      /^(?:[A-Za-z]{3},?\s+)?(\d{1,2})\s+([A-Za-z]{3})\s+(\d{2,4})\s+\d{1,2}:\d{2}(?::\d{2})?\s+(?:[+-]\d{4}|UT|GMT|[ECMP][SD]T|Z)(?:\s+\([^)]*\))?$/i.exec(
        value,
      );
    if (!parts) throw new Error("Invalid feed date");
    const month = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ].indexOf(parts[2]!.toLowerCase());
    let year = Number(parts[3]);
    if (year < 100) year += year >= 50 ? 1900 : 2000;
    const day = Number(parts[1]);
    if (
      month < 0 ||
      day < 1 ||
      day > new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
    )
      throw new Error("Invalid feed date");
  }
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error("Invalid feed date");
  return new Date(time).toISOString();
}
export function number(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error("Invalid feed number");
  return n;
}
