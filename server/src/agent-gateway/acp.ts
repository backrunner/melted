// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";

type Message = {
  jsonrpc: string;
  id?: number | string;
  method?: string;
  params?: any;
  result?: any;
  error?: unknown;
};
/** ACP v1 stdio client. No shell, filesystem, terminal or interactive permission grants. */
export class ACPClient {
  private readonly process: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<
    number,
    { resolve: (v: any) => void; reject: (e: Error) => void }
  >();
  private sequence = 0;
  private buffered = Buffer.alloc(0);
  private bytes = 0;
  private closed = false;
  private session?: string;
  private text = "";
  private receiving = false;
  private failure?: Error;
  constructor(
    command: string,
    args: string[],
    cwd: string,
    env: Record<string, string>,
    private readonly signal: AbortSignal,
  ) {
    this.process = spawn(command, args, {
      cwd,
      env,
      shell: false,
      detached: true,
      stdio: "pipe",
    });
    this.process.stdout.on("data", (chunk) => this.read(Buffer.from(chunk)));
    // Harness logs can contain prompt/source data or credentials; never forward them.
    this.process.stderr.resume();
    this.process.stdin.on("error", () => this.fail("agent_transport_failed"));
    this.process.on("error", () => this.fail("agent_start_failed"));
    this.process.on("exit", () => this.fail("agent_disconnected"));
    signal.addEventListener("abort", this.cancel, { once: true });
    if (signal.aborted) this.cancel();
  }
  private send(message: unknown) {
    if (this.closed || this.failure)
      throw this.failure ?? new Error("agent_closed");
    this.process.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", ...(message as object) }) + "\n",
    );
  }
  private request(method: string, params: unknown): Promise<any> {
    if (this.failure) return Promise.reject(this.failure);
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.send({ id, method, params });
      } catch (error) {
        this.pending.delete(id);
        reject(error);
      }
    });
  }
  private read(chunk: Buffer) {
    try {
      this.bytes += chunk.length;
      if (this.bytes > 8 * 1024 * 1024) throw new Error();
      this.buffered = Buffer.concat([this.buffered, chunk]);
      if (this.buffered.length > 1024 * 1024) throw new Error();
      for (;;) {
        const at = this.buffered.indexOf(10);
        if (at < 0) break;
        const line = this.buffered.subarray(0, at);
        this.buffered = this.buffered.subarray(at + 1);
        const m = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(line),
        ) as Message;
        if (!m || Array.isArray(m) || m.jsonrpc !== "2.0") throw new Error();
        if (m.method) this.inbound(m);
        else {
          if (typeof m.id !== "number") throw new Error();
          const pending = this.pending.get(m.id);
          if (!pending) throw new Error();
          this.pending.delete(m.id);
          if (m.error) pending.reject(new Error("agent_rpc_failed"));
          else pending.resolve(m.result);
        }
      }
    } catch {
      this.fail("agent_protocol_invalid");
    }
  }
  private inbound(m: Message) {
    if (m.id !== undefined) {
      if (m.method === "session/request_permission") {
        this.send({ id: m.id, result: { outcome: { outcome: "cancelled" } } });
        // Do not silently treat denied tool execution as an empty successful run.
        this.fail("agent_permission_required");
      } else
        this.send({
          id: m.id,
          error: { code: -32601, message: "Unsupported client capability" },
        });
      return;
    }
    if (m.method !== "session/update") return;
    if (m.params?.sessionId !== this.session) throw new Error();
    const u = m.params.update;
    if (u?.sessionUpdate === "agent_message_chunk" && this.receiving) {
      if (u.content?.type !== "text" || typeof u.content.text !== "string")
        throw new Error();
      this.text += u.content.text;
      if (this.text.length > 128 * 1024) throw new Error();
    }
    // Thoughts and tool updates are not raw content and are never retained.
  }
  private fail(code: string) {
    if (this.closed || this.failure) return;
    this.failure = new Error(code);
    for (const p of this.pending.values()) p.reject(this.failure);
    this.pending.clear();
  }
  private cancel = () => {
    if (this.session && !this.failure && !this.closed) {
      try {
        this.send({
          method: "session/cancel",
          params: { sessionId: this.session },
        });
      } catch {}
    }
    this.fail("agent_cancelled");
  };
  async run(cwd: string, mcp: { url: string; token: string }, prompt: string) {
    const init = await this.request("initialize", {
      protocolVersion: 1,
      clientCapabilities: {},
      clientInfo: { name: "melted-collector", version: "1.0.0" },
    });
    if (
      init?.protocolVersion !== 1 ||
      init.agentCapabilities?.mcpCapabilities?.http !== true
    )
      throw new Error("agent_capability_missing");
    const session = await this.request("session/new", {
      cwd,
      mcpServers: [
        {
          type: "http",
          name: "melted-public-collection",
          url: mcp.url,
          headers: [{ name: "Authorization", value: `Bearer ${mcp.token}` }],
        },
      ],
    });
    if (
      typeof session?.sessionId !== "string" ||
      !session.sessionId ||
      session.sessionId.length > 256
    )
      throw new Error("agent_session_invalid");
    this.session = session.sessionId;
    this.receiving = true;
    const response = await this.request("session/prompt", {
      sessionId: this.session,
      prompt: [{ type: "text", text: prompt }],
    });
    this.receiving = false;
    if (response?.stopReason !== "end_turn")
      throw new Error("agent_turn_incomplete");
    return this.text;
  }
  async close() {
    if (this.closed) return;
    if (this.session && !this.failure) {
      try {
        await Promise.race([
          this.request("session/close", { sessionId: this.session }),
          new Promise((resolve) => setTimeout(resolve, 750)),
        ]);
      } catch {}
    }
    this.cancel();
    this.closed = true;
    this.signal.removeEventListener("abort", this.cancel);
    this.process.stdin.end();
    const kill = (signal: NodeJS.Signals) => {
      if (this.process.pid) {
        try {
          process.kill(-this.process.pid, signal);
        } catch {}
      }
    };
    kill("SIGTERM");
    // Kill the process group as well: a descendant must not outlive its run.
    await new Promise((resolve) => setTimeout(resolve, 150));
    kill("SIGKILL");
  }
}
