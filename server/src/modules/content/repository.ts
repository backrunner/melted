import type { Briefing, Fixture, Mutation } from "./schemas.js";
import type { Filter } from "./filters.js";

export type Page = {
  items: Briefing[];
  total: number;
  query_hash: string;
  next_cursor?: string;
};
export interface ContentRepository {
  taxonomy(owner: string): Promise<Fixture["terms"]>;
  detail(owner: string, id: string): Promise<Briefing>;
  list(
    owner: string,
    filter: Filter,
    cursor: string | null,
    limit: number,
  ): Promise<Page>;
  setState(
    owner: string,
    id: string,
    mutation: Mutation,
  ): Promise<Briefing["state"]>;
  importDemo(owner: string, fixture: Fixture): Promise<void>;
}
