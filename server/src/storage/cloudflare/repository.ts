// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { z } from "zod";
import { type Config } from "../../config/schema.js";
import { unauthorized } from "../../shared/problem.js";
import { hash } from "../../shared/crypto.js";
import { parse } from "../../shared/validation.js";
import {
  type Briefing,
  type Fixture,
  type Mutation,
} from "../../modules/content/schemas.js";
import { type Filter } from "../../modules/content/filters.js";
import { type Principal, type Session } from "../../modules/identity/types.js";
import { type Repository } from "../repository.js";
import { type BrowserFlow } from "../../modules/identity/browser-flow.js";
import { type Page } from "../../modules/content/repository.js";
import { type Change } from "../../modules/sync/repository.js";
import type { CloudBindings } from "./bindings.js";
import { call } from "./rpc.js";

function tokenOwner(token: string, kind: "access" | "refresh"): string {
  const parts = token.split(".");
  if (
    parts.length !== 3 ||
    parts[0] !== kind ||
    !/^acc_[a-f0-9]{64}$/.test(parts[1]!) ||
    !/^[A-Za-z0-9_-]{43}$/.test(parts[2]!)
  )
    throw unauthorized();
  return parts[1]!;
}
function flowID(value: string) {
  const valueID = value.split(".")[0]!;
  if (!/^flow_[a-f0-9]{32}$/.test(valueID)) throw unauthorized();
  return valueID;
}
export class CloudRepository implements Repository {
  constructor(private env: CloudBindings) {}
  private account<T>(owner: string, op: string, payload: unknown = {}) {
    return call<T>(this.env.ACCOUNTS, owner, op, payload);
  }
  private control<T>(name: string, op: string, payload: unknown) {
    return call<T>(this.env.CONTROL, name, op, payload);
  }
  async health() {
    await this.control("health", "health", {});
  }
  async limit(key: string, maximum: number) {
    await this.control(`limit_${await hash(key)}`, "limit", { maximum });
  }
  async challenge(config: Config, body: unknown) {
    const { public_key } = parse(
      z
        .object({ public_key: z.string().regex(/^[A-Za-z0-9_-]{87}$/) })
        .strict(),
      body,
    );
    const owner =
      "acc_" + (await hash(config.serverID + "\nkey\n" + public_key));
    return this.account<{
      challenge_id: string;
      message: string;
      expires_in: number;
    }>(owner, "challenge", { public_key, serverID: config.serverID });
  }
  async keySession(config: Config, body: unknown) {
    const input = parse(
      z
        .object({
          challenge_id: z.string().max(128),
          signature: z.string().regex(/^[A-Za-z0-9_-]{86}$/),
        })
        .strict(),
      body,
    );
    const owner = input.challenge_id.split(".")[0]!;
    if (!/^acc_[a-f0-9]{64}$/.test(owner)) throw unauthorized();
    return this.account<Session>(owner, "keySession", {
      ...input,
      registration: config.registration === "key",
    });
  }
  async authenticate(authorization?: string) {
    if (!authorization?.startsWith("Bearer ") || authorization.length > 512)
      throw unauthorized();
    const token = authorization.slice(7);
    return this.account<Principal>(
      tokenOwner(token, "access"),
      "authenticate",
      { token },
    );
  }
  async refresh(body: unknown) {
    const { refresh_token } = parse(
      z.object({ refresh_token: z.string().max(512) }).strict(),
      body,
    );
    return this.account<Session>(
      tokenOwner(refresh_token, "refresh"),
      "refresh",
      { token: refresh_token },
    );
  }
  async logout(p: Principal) {
    await this.account(p.owner, "logout", { family: p.family });
  }
  taxonomy(owner: string) {
    return this.account<Fixture["terms"]>(owner, "taxonomy");
  }
  detail(owner: string, contentID: string) {
    return this.account<Briefing>(owner, "detail", { id: contentID });
  }
  list(owner: string, f: Filter, cursor: string | null, limit: number) {
    return this.account<Page>(owner, "list", { filter: f, cursor, limit });
  }
  setState(owner: string, contentID: string, mutation: Mutation) {
    return this.account<Briefing["state"]>(owner, "setState", {
      id: contentID,
      mutation,
    });
  }
  changes(owner: string, after: number) {
    return this.account<Change[]>(owner, "changes", { after });
  }
  async importDemo(owner: string, fixture: Fixture) {
    await this.account(owner, "importDemo", { fixture });
  }
  async saveFlow(flow: BrowserFlow) {
    await this.control(flow.id, "saveFlow", flow);
  }
  readFlow(value: string) {
    return this.control<BrowserFlow>(flowID(value), "readFlow", {});
  }
  claimFlow(state: string) {
    return this.control<BrowserFlow>(flowID(state), "claimFlow", { state });
  }
  async completeFlow(
    flow: BrowserFlow,
    subject: string,
    code: string,
    registration: boolean,
  ) {
    const owner =
      "acc_" +
      (await hash(
        this.env.MELTED_SERVER_ID + "\noidc\n" + flow.issuer + "\n" + subject,
      ));
    await this.account(owner, "externalIdentity", { registration });
    await this.control(flow.id, "completeFlow", {
      owner,
      code_hash: await hash(code),
    });
  }
  async exchangeCode(code: string, challenge: string, redirect: string) {
    const owner = await this.control<string>(flowID(code), "exchangeCode", {
      code_hash: await hash(code),
      challenge,
      redirect,
    });
    // Consuming a code and issuing a session cross two objects. A failed issuance requires
    // restarting login; the code is never made reusable after an uncertain response.
    return this.account<Session>(owner, "issue");
  }
  async maintenance() {
    /* Each object owns its expiry alarm; no external scheduler/database. */
  }
}
