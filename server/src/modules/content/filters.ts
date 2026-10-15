import { z } from "zod";
import { invalid } from "../../shared/problem.js";
import { parse } from "../../shared/validation.js";

export function filters(params: URLSearchParams) {
  const allowed = new Set([
    "view",
    "q",
    "category_ids",
    "tag_ids",
    "subject_ids",
    "from",
    "to",
    "sort",
    "limit",
    "cursor",
  ]);
  for (const key of params.keys()) if (!allowed.has(key)) throw invalid();
  for (const key of ["view", "q", "from", "to", "sort", "limit", "cursor"])
    if (params.getAll(key).length > 1) throw invalid();
  const filter = parse(
    z.object({
      view: z.enum(["all", "unread", "saved"]),
      q: z.string().max(512),
      category_ids: z.array(z.string().min(1).max(128)).max(50),
      tag_ids: z.array(z.string().min(1).max(128)).max(50),
      subject_ids: z.array(z.string().min(1).max(128)).max(50),
      from: z.iso.datetime({ offset: true }).nullable(),
      to: z.iso.datetime({ offset: true }).nullable(),
      sort: z.literal("updated_desc"),
    }),
    {
      view: params.get("view") ?? "all",
      q: (params.get("q") ?? "").trim(),
      category_ids: params.getAll("category_ids"),
      tag_ids: params.getAll("tag_ids"),
      subject_ids: params.getAll("subject_ids"),
      from: params.get("from"),
      to: params.get("to"),
      sort: params.get("sort") ?? "updated_desc",
    },
  );
  if (
    filter.from &&
    filter.to &&
    Date.parse(filter.from) >= Date.parse(filter.to)
  )
    throw invalid();
  for (const field of ["category_ids", "tag_ids", "subject_ids"] as const)
    filter[field] = [...new Set(filter[field])].sort();
  return filter;
}
export type Filter = ReturnType<typeof filters>;
