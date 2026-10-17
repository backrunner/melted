// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { schnorr } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
const secret = new Uint8Array(32).fill(1); // Public test-only key, never used against a real relay.
export const pubkey = bytesToHex(schnorr.getPublicKey(secret));
export function event(overrides: Record<string, unknown> = {}) {
  const e = {
    pubkey,
    created_at: 1720000000,
    kind: 1,
    tags: [["t", "culture"]],
    content: "城市与阅读",
    ...overrides,
  };
  const digest = sha256(
    new TextEncoder().encode(
      JSON.stringify([0, e.pubkey, e.created_at, e.kind, e.tags, e.content]),
    ),
  );
  return {
    ...e,
    id: bytesToHex(digest),
    sig: bytesToHex(schnorr.sign(digest, secret, new Uint8Array(32))),
  };
}
export function bluesky(text = "城市与阅读") {
  return {
    feed: [
      {
        post: {
          uri: "at://did:plc:abcdefghijklmnopqrstuvwx/app.bsky.feed.post/one",
          author: {
            did: "did:plc:abcdefghijklmnopqrstuvwx",
            handle: "writer.bsky.social",
            displayName: "作者",
          },
          record: {
            $type: "app.bsky.feed.post",
            text,
            createdAt: "2024-07-03T09:46:40Z",
            langs: ["zh"],
          },
          embed: {
            images: [
              {
                fullsize: "https://images.example.org/photo.jpg",
                alt: "一座城",
              },
            ],
          },
        },
      },
    ],
  };
}
export function fediverse(text = "<p>城市与阅读</p>") {
  return [
    {
      id: "one",
      uri: "https://social.example.org/users/writer/statuses/one",
      url: "https://social.example.org/@writer/one",
      content: text,
      visibility: "public",
      account: { acct: "writer", display_name: "作者" },
      language: "zh",
      created_at: "2024-07-03T09:46:40Z",
      edited_at: null,
      tags: [{ name: "culture" }],
      media_attachments: [],
    },
  ];
}
