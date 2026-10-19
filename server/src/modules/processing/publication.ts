// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { hash } from "../../shared/crypto.js";
import type { ProcessingResult } from "./types.js";
export async function publicationTerms(result: ProcessingResult) {
  const values = [
    ...(result.decision?.category
      ? [{ kind: "category", name: result.decision.category }]
      : []),
    ...(result.decision?.tags ?? []).map((name) => ({ kind: "tag", name })),
  ];
  return Promise.all(
    values.map(async (term) => ({
      ...term,
      id:
        "auto_" +
        (await hash(term.kind + "\n" + term.name.normalize("NFKC").trim())),
    })),
  );
}
