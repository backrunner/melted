export type Change = { sequence: number; entity_id: string; kind: string };
export interface SyncRepository {
  changes(owner: string, after: number): Promise<Change[]>;
}
