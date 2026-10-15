import { test } from "node:test";
import assert from "node:assert/strict";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fixture from "../../../contracts/fixtures/development-library.json" with { type: "json" };
import { filters } from "../../src/modules/content/filters.js";
import { random, hash, id, b64 } from "../../src/shared/crypto.js";

test("SQLite DO persists across process restart; browser code and replay revocation are durable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "melted-do-"));
  const options = convertV4MiniflareOptions({
    name: "melted-storage-test",
    modules: true,
    scriptPath: ".wrangler/test-build/worker.js",
    compatibilityDate: "2026-10-14",
    compatibilityFlags: ["nodejs_compat"],
    durableObjects: {
      ACCOUNTS: { className: "AccountStore", useSQLite: true },
      CONTROL: { className: "ControlStore", useSQLite: true },
    },
    durableObjectsPersist: directory,
    bindings: {
      MELTED_SERVER_ID: "durability-test",
      MELTED_OPERATOR: "test",
      PUBLIC_ORIGIN: "http://localhost",
      REGISTRATION_MODE: "key",
      DEVELOPMENT_SAMPLES: "true",
    },
  });
  options.unsafeInspectDurableObjects = true;
  options.resourcePersistencePath = directory;
  options.isolatedResourcePersistencePath = directory;
  let mf = new Miniflare(options);
  const invoke = async (
    namespace: string,
    name: string,
    operation: string,
    payload: unknown,
    status = 200,
  ) => {
    const ns = await mf.getDurableObjectNamespace(namespace);
    const response = await ns
      .get(ns.idFromName(name))
      .fetch("https://internal.melted/invoke", {
        method: "POST",
        body: JSON.stringify({ name, operation, payload }),
      });
    assert.equal(response.status, status);
    return (await response.json()) as any;
  };
  try {
    const owner = "acc_" + (await hash(random())),
      flow = id("flow"),
      code = flow + "." + random(),
      challenge = random(),
      state = flow + "." + random();
    await invoke("CONTROL", flow, "saveFlow", {
      id: flow,
      issuer: "https://identity.example",
      provider_state: state,
      client_state: random(),
      client_challenge: challenge,
      redirect_uri: "melted://auth/callback",
      nonce: random(),
      provider_verifier: random(),
    });
    await invoke("CONTROL", flow, "claimFlow", { state: "wrong" }, 401);
    await invoke("CONTROL", flow, "claimFlow", { state });
    await invoke("CONTROL", flow, "claimFlow", { state }, 401);
    await invoke("ACCOUNTS", owner, "externalIdentity", { registration: true });
    await invoke("CONTROL", flow, "completeFlow", {
      owner,
      code_hash: await hash(code),
    });
    await mf.dispose();
    mf = new Miniflare(options);
    await invoke(
      "CONTROL",
      flow,
      "exchangeCode",
      {
        code_hash: await hash(code),
        challenge: "wrong",
        redirect: "melted://auth/callback",
      },
      401,
    );
    assert.equal(
      await invoke("CONTROL", flow, "exchangeCode", {
        code_hash: await hash(code),
        challenge,
        redirect: "melted://auth/callback",
      }),
      owner,
    );
    await invoke(
      "CONTROL",
      flow,
      "exchangeCode",
      {
        code_hash: await hash(code),
        challenge,
        redirect: "melted://auth/callback",
      },
      401,
    );
    const session = await invoke("ACCOUNTS", owner, "issue", {});
    const next = await invoke("ACCOUNTS", owner, "refresh", {
      token: session.refresh_token,
    });
    await invoke(
      "ACCOUNTS",
      owner,
      "refresh",
      { token: session.refresh_token },
      401,
    );
    await mf.dispose();
    mf = new Miniflare(options);
    await invoke(
      "ACCOUNTS",
      owner,
      "authenticate",
      { token: next.access_token },
      401,
    );
    // Closed registration rejects a new key but admits an already registered one.
    const key = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    const public_key = b64(await crypto.subtle.exportKey("raw", key.publicKey));
    const keyOwner = "acc_" + (await hash("key-" + public_key));
    const c = await invoke("ACCOUNTS", keyOwner, "challenge", {
      public_key,
      serverID: "test",
    });
    const proof = {
      challenge_id: c.challenge_id,
      signature: b64(
        await crypto.subtle.sign(
          { name: "ECDSA", hash: "SHA-256" },
          key.privateKey,
          new TextEncoder().encode(c.message),
        ),
      ),
    };
    await invoke(
      "ACCOUNTS",
      keyOwner,
      "keySession",
      { ...proof, registration: false },
      403,
    );
    await invoke("ACCOUNTS", keyOwner, "keySession", {
      ...proof,
      registration: true,
    });
    const c2 = await invoke("ACCOUNTS", keyOwner, "challenge", {
      public_key,
      serverID: "test",
    });
    await invoke("ACCOUNTS", keyOwner, "keySession", {
      challenge_id: c2.challenge_id,
      signature: b64(
        await crypto.subtle.sign(
          { name: "ECDSA", hash: "SHA-256" },
          key.privateKey,
          new TextEncoder().encode(c2.message),
        ),
      ),
      registration: false,
    });
    const storage = await mf.unsafeGetDurableObjectStorage(
      "melted-storage-test",
      "AccountStore",
      { name: keyOwner },
    );
    const expired = await invoke("ACCOUNTS", keyOwner, "challenge", {
      public_key,
      serverID: "test",
    });
    await storage.exec(
      "UPDATE challenges SET expires=0 WHERE id=?",
      expired.challenge_id,
    );
    await invoke(
      "ACCOUNTS",
      keyOwner,
      "keySession",
      {
        challenge_id: expired.challenge_id,
        signature: b64(
          await crypto.subtle.sign(
            { name: "ECDSA", hash: "SHA-256" },
            key.privateKey,
            new TextEncoder().encode(expired.message),
          ),
        ),
        registration: true,
      },
      401,
    );
    await invoke("ACCOUNTS", keyOwner, "importDemo", { fixture });
    const firstPage = await invoke("ACCOUNTS", keyOwner, "list", {
      filter: filters(new URLSearchParams()),
      cursor: null,
      limit: 1,
    });
    await storage.exec("UPDATE snapshots SET expires=0");
    await invoke(
      "ACCOUNTS",
      keyOwner,
      "list",
      {
        filter: filters(new URLSearchParams()),
        cursor: firstPage.next_cursor,
        limit: 1,
      },
      410,
    );
    const oversized = {
      terms: [],
      documents: Array.from({ length: 45 }, (_, i) => ({
        ...fixture.documents[0]!,
        id: "large_" + i,
        category_id: null,
        tag_ids: [],
        subject_ids: [],
        markdown: "x".repeat(200000),
      })),
    };
    await invoke("ACCOUNTS", keyOwner, "importDemo", { fixture: oversized });
    await invoke(
      "ACCOUNTS",
      keyOwner,
      "list",
      { filter: filters(new URLSearchParams()), cursor: null, limit: 1 },
      422,
    );
  } finally {
    await mf.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});
