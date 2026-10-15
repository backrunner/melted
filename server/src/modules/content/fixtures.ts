import type { Fixture } from "./schemas.js";
import { invalid } from "../../shared/problem.js";

export function validateFixture(f: Fixture) {
  const terms = new Map(f.terms.map((t) => [t.id, t.kind]));
  if (
    terms.size !== f.terms.length ||
    new Set(f.documents.map((d) => d.id)).size !== f.documents.length
  )
    throw invalid();
  for (const d of f.documents) {
    if (
      !d.is_demo ||
      d.revision !== 1 ||
      d.state.version !== 1 ||
      (d.category_id && terms.get(d.category_id) !== "category") ||
      d.tag_ids.some((t) => terms.get(t) !== "tag") ||
      d.subject_ids.some((t) => terms.get(t) !== "subject")
    )
      throw invalid();
  }
}
