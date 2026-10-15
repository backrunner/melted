import type { CloudBindings } from "./bindings.js";
import { DurableObject } from "cloudflare:workers";
import { Problem, invalid, unauthorized } from "../../shared/problem.js";
import { type BrowserFlow } from "../../modules/identity/browser-flow.js";

type StoredFlow = BrowserFlow & {
  status: "pending" | "processing" | "complete";
  owner?: string;
  code_hash?: string;
};
export class ControlStore extends DurableObject<CloudBindings> {
  constructor(ctx: DurableObjectState, env: CloudBindings) {
    super(ctx, env);
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS record(id INTEGER PRIMARY KEY,value TEXT NOT NULL,expires INTEGER NOT NULL)",
    );
  }
  async fetch(request: Request): Promise<Response> {
    try {
      const { operation, payload } = (await request.json()) as {
        operation: string;
        payload: Record<string, unknown>;
      };
      if (operation === "health") return Response.json({});
      const sql = this.ctx.storage.sql,
        now = Date.now();
      const result = this.ctx.storage.transactionSync(() => {
        const row = sql
          .exec<{ value: string; expires: number }>(
            "SELECT value,expires FROM record WHERE id=1 AND expires>?",
            now,
          )
          .toArray()[0];
        if (operation === "limit") {
          const count = row ? Number(row.value) + 1 : 1;
          sql.exec(
            "INSERT INTO record(id,value,expires) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value,expires=excluded.expires",
            String(count),
            row?.expires ?? now + 60_000,
          );
          return { limited: count > (payload.maximum as number) };
        }
        if (operation === "saveFlow") {
          sql.exec(
            "INSERT INTO record(id,value,expires) VALUES(1,?,?)",
            JSON.stringify({ ...payload, status: "pending" }),
            now + 300_000,
          );
          return {};
        }
        if (!row) throw unauthorized();
        const flow = JSON.parse(row.value) as StoredFlow;
        if (operation === "readFlow") {
          if (flow.status !== "pending") throw unauthorized();
          return flow;
        }
        if (operation === "claimFlow") {
          if (
            flow.status !== "pending" ||
            flow.provider_state !== payload.state
          )
            throw unauthorized();
          flow.status = "processing";
          sql.exec(
            "UPDATE record SET value=? WHERE id=1",
            JSON.stringify(flow),
          );
          return flow;
        }
        if (operation === "completeFlow") {
          if (flow.status !== "processing") throw unauthorized();
          flow.status = "complete";
          flow.owner = payload.owner as string;
          flow.code_hash = payload.code_hash as string;
          sql.exec(
            "UPDATE record SET value=?,expires=? WHERE id=1",
            JSON.stringify(flow),
            now + 60_000,
          );
          return {};
        }
        if (operation === "exchangeCode") {
          if (
            flow.status !== "complete" ||
            flow.code_hash !== payload.code_hash ||
            flow.client_challenge !== payload.challenge ||
            flow.redirect_uri !== payload.redirect
          )
            throw unauthorized();
          sql.exec("DELETE FROM record");
          return flow.owner;
        }
        throw invalid();
      });
      const expiry = sql
        .exec<{ expires: number }>("SELECT expires FROM record WHERE id=1")
        .toArray()[0]?.expires;
      if (expiry) await this.ctx.storage.setAlarm(expiry + 1000);
      if (
        result &&
        typeof result === "object" &&
        "limited" in result &&
        result.limited
      )
        throw new Problem(429, "rate_limited");
      return Response.json(result ?? {});
    } catch (error) {
      return Response.json(
        { code: error instanceof Problem ? error.code : "internal_error" },
        { status: error instanceof Problem ? error.status : 500 },
      );
    }
  }
  async alarm() {
    await this.ctx.storage.deleteAll();
  }
}
