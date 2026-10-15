import type { Config } from "../../config/schema.js";
import type { Principal, Session } from "./types.js";

export interface IdentityRepository {
  challenge(
    config: Config,
    body: unknown,
  ): Promise<{ challenge_id: string; message: string; expires_in: number }>;
  keySession(config: Config, body: unknown): Promise<Session>;
  authenticate(authorization?: string): Promise<Principal>;
  refresh(body: unknown): Promise<Session>;
  logout(principal: Principal): Promise<void>;
}
