// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { AccountSources } from "./sources/repository.js";
import { initializeSources } from "./sources/schema.js";
import { dispatchSources } from "./sources/dispatch.js";
import { listChanges } from "./changes.js";
import type { Mutation, Fixture } from "../../modules/content/schemas.js";
import { DurableObject } from "cloudflare:workers";
import { Problem, unauthorized } from "../../shared/problem.js";
import { type Filter } from "../../modules/content/filters.js";
import type { CloudBindings } from "./bindings.js";
import { AccountDatabase } from "./sqlite.js";
import { initializeAccount } from "./account-schema.js";
import { AccountIdentity } from "./identity.js";
import { AccountContent } from "./content.js";

export class AccountStore extends DurableObject<CloudBindings> {
  private sources: AccountSources;
  private db: AccountDatabase;
  private identity: AccountIdentity;
  private content: AccountContent;
  constructor(ctx: DurableObjectState, env: CloudBindings) {
    super(ctx, env);
    this.db = new AccountDatabase(ctx.storage);
    initializeAccount(this.db.sql);
    initializeSources(this.db);
    this.sources = new AccountSources(this.db);
    this.identity = new AccountIdentity(this.db);
    this.content = new AccountContent(this.db);
  }
  async fetch(request: Request): Promise<Response> {
    try {
      const { name, operation, payload } = (await request.json()) as {
        name: string;
        operation: string;
        payload: Record<string, unknown>;
      };
      if (!/^acc_[a-f0-9]{64}$/.test(name)) throw unauthorized();
      if (this.db.meta("owner") && this.db.meta("owner") !== name)
        throw unauthorized();
      this.db.setMeta("owner", name);
      if ((await this.ctx.storage.getAlarm()) === null)
        await this.ctx.storage.setAlarm(Date.now() + 3600_000);
      if (
        /^sources\.(create|patch|remove|sync|claim|complete|fail)$/.test(
          operation,
        )
      ) {
        const existing = await this.ctx.storage.getAlarm();
        if (existing === null || existing > Date.now() + 1000)
          await this.ctx.storage.setAlarm(Date.now() + 1000);
      }
      const value = await this.dispatch(name, operation, payload);
      if (operation.startsWith("sources.")) await this.arm();
      return Response.json(value === undefined ? {} : value);
    } catch (error) {
      if (error instanceof Problem)
        return Response.json({ code: error.code }, { status: error.status });
      return Response.json({ code: "internal_error" }, { status: 500 });
    }
  }
  private async dispatch(
    owner: string,
    op: string,
    p: Record<string, unknown>,
  ): Promise<unknown> {
    switch (op) {
      case "challenge":
        return this.identity.challenge(owner, p);
      case "keySession":
        return this.identity.keySession(owner, p);
      case "externalIdentity":
        return this.identity.externalIdentity(p);
      case "issue":
        return this.identity.issueSession(owner);
      case "managedSession":
        return this.identity.managedSession(owner);
      case "authenticate":
        return this.identity.authenticate(owner, p);
      case "refresh":
        return this.identity.refresh(owner, p);
      case "logout":
        return this.identity.logout(p);
    }
    if (!this.db.meta("registered")) throw unauthorized();
    if (op.startsWith("sources."))
      return dispatchSources(this.sources, owner, op, p);
    switch (op) {
      case "taxonomy":
        return this.content.taxonomy();
      case "detail":
        return this.content.detail(p.id as string);
      case "list":
        return this.content.list(
          p.filter as Filter,
          p.cursor as string | null,
          p.limit as number,
        );
      case "setState":
        return this.content.setState(p.id as string, p.mutation as Mutation);
      case "changes":
        return listChanges(this.db, p.after as number);
      case "importDemo":
        return this.content.importDemo(p.fixture as Fixture);
      default:
        throw new Problem(404, "not_found");
    }
  }
  private async arm(recovery?: number) {
    const now = Date.now();
    const maintenance = Number(
      this.db.meta("maintenance_at") ?? now + 3600_000,
    );
    const due = this.sources.nextWake(now);
    const next = Math.max(now + 1000, Math.min(maintenance, due ?? Infinity));
    const existing = await this.ctx.storage.getAlarm();
    if (existing === null || existing > next || existing === recovery)
      await this.ctx.storage.setAlarm(next);
  }
  async alarm() {
    const now = Date.now();
    // Persist a recovery wakeup before any IO, including queue publishing.
    const recovery = now + 60_000;
    await this.ctx.storage.setAlarm(recovery);
    if (!this.db.meta("registered")) {
      await this.ctx.storage.deleteAll();
      return;
    }
    if (Number(this.db.meta("maintenance_at") ?? 0) <= now) {
      this.db.transaction(() => {
        this.db.sql.exec("DELETE FROM snapshots WHERE expires<?", now);
        this.db.sql.exec("DELETE FROM challenges WHERE expires<?", now);
        this.db.sql.exec("DELETE FROM families WHERE expires<?", now);
        this.db.sql.exec(
          "DELETE FROM mutations WHERE created<?",
          now - 7 * 86400_000,
        );
        this.db.sql.exec(
          "DELETE FROM source_requests WHERE created<?",
          now - 7 * 86400_000,
        );
        this.db.setMeta("maintenance_at", String(now + 3600_000));
      });
    }
    this.sources.schedule(now);
    if (this.env.COLLECTION_QUEUE) {
      const rows = this.sources.outbox(now),
        owner = this.db.meta("owner")!;
      // Send individually so a 50-message batch is not larger than Queue limits.
      for (const row of rows) {
        await this.env.COLLECTION_QUEUE.send({ owner, run_id: row.run_id });
        this.sources.dispatched(row.run_id, row.token);
      }
    }
    await this.arm(recovery);
  }
}
