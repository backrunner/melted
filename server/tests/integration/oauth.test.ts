import { test, after } from "node:test";
import assert from "node:assert/strict";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { connect } from "../../src/storage/postgres/connection.js";
import { migrate } from "../../src/storage/postgres/migrations.js";
import { PostgresRepository } from "../../src/storage/postgres/repository.js";
import {
  authorizeBrowser,
  browserCallback,
  exchangeBrowser,
  startBrowser,
  callbackURI,
} from "../../src/modules/identity/browser-login.js";
import { type Config } from "../../src/config/schema.js";
import { random, pkce, hash } from "../../src/shared/crypto.js";
import { Problem } from "../../src/shared/problem.js";

if (
  !process.env.MELTED_TEST_DATABASE_URL ||
  process.env.MELTED_TEST_DATABASE_URL === process.env.DATABASE_URL
)
  throw new Error(
    "Set a dedicated MELTED_TEST_DATABASE_URL distinct from DATABASE_URL",
  );
const { database, pool } = connect(process.env.MELTED_TEST_DATABASE_URL);
after(() => pool.end());
test("OIDC validates provider identity, state, nonce, PKCE, expiry and one-time codes", async () => {
  await migrate(database);
  const repo = new PostgresRepository(database);
  const config: Config = {
    serverID: "oauth-test",
    operator: "test",
    publicOrigin: "http://localhost",
    registration: "key",
    oidc: { issuer: "https://identity.example", clientID: "melted-test" },
  };
  const keys = await generateKeyPair("ES256");
  const jwk = {
    ...(await exportJWK(keys.publicKey)),
    kid: "test",
    alg: "ES256",
  };
  let nonce = "",
    mode = "valid";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    if (url.endsWith("/.well-known/openid-configuration"))
      return Response.json({
        issuer: config.oidc!.issuer,
        authorization_endpoint: "https://identity.example/authorize",
        token_endpoint: "https://identity.example/token",
        jwks_uri: "https://identity.example/jwks",
      });
    if (url.endsWith("/jwks")) return Response.json({ keys: [jwk] });
    if (url.endsWith("/token")) {
      assert.equal(init?.redirect, "error");
      const body = new URLSearchParams(String(init?.body));
      assert.equal(body.get("grant_type"), "authorization_code");
      assert(body.get("code_verifier"));
      const token = await new SignJWT({
        nonce: mode === "nonce" ? "wrong" : nonce,
      })
        .setProtectedHeader({ alg: "ES256", kid: "test" })
        .setIssuer(
          mode === "issuer" ? "https://wrong.example" : config.oidc!.issuer,
        )
        .setAudience(mode === "audience" ? "wrong" : config.oidc!.clientID)
        .setSubject("user-" + (mode === "different" ? "other" : "one"))
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(keys.privateKey);
      return Response.json({ id_token: token });
    }
    throw new Error("Unexpected provider request");
  };
  try {
    async function begin() {
      const verifier = random(),
        state = random();
      const result = await startBrowser(repo, config, {
        redirect_uri: callbackURI,
        state,
        code_challenge: await pkce(verifier),
      });
      const flowID = new URL(result.authorization_url).searchParams.get(
        "request",
      )!;
      const provider = new URL(await authorizeBrowser(repo, config, flowID));
      nonce = provider.searchParams.get("nonce")!;
      assert.equal(provider.searchParams.get("code_challenge_method"), "S256");
      return {
        verifier,
        state,
        flowID,
        providerState: provider.searchParams.get("state")!,
      };
    }
    const first = await begin();
    await assert.rejects(() =>
      browserCallback(repo, config, "wrong", "provider-code"),
    );
    const callback = new URL(
      await browserCallback(repo, config, first.providerState, "provider-code"),
    );
    assert.equal(callback.searchParams.get("state"), first.state);
    const code = callback.searchParams.get("code")!;
    await assert.rejects(() =>
      browserCallback(repo, config, first.providerState, "provider-code"),
    );
    await assert.rejects(() =>
      exchangeBrowser(repo, {
        code,
        code_verifier: random(),
        redirect_uri: callbackURI,
      }),
    );
    const session = await exchangeBrowser(repo, {
      code,
      code_verifier: first.verifier,
      redirect_uri: callbackURI,
    });
    assert(session.account_id);
    await assert.rejects(() =>
      exchangeBrowser(repo, {
        code,
        code_verifier: first.verifier,
        redirect_uri: callbackURI,
      }),
    );
    for (mode of ["nonce", "issuer", "audience"]) {
      const flow = await begin();
      await assert.rejects(() =>
        browserCallback(repo, config, flow.providerState, "provider-code"),
      );
    }
    mode = "valid";
    const again = await begin();
    const againCode = new URL(
      await browserCallback(repo, config, again.providerState, "provider-code"),
    ).searchParams.get("code")!;
    assert.equal(
      (
        await exchangeBrowser(repo, {
          code: againCode,
          code_verifier: again.verifier,
          redirect_uri: callbackURI,
        })
      ).account_id,
      session.account_id,
    );
    const expired = await begin();
    await database.query(
      "UPDATE browser_flows SET expires_at=now()-interval '1 second' WHERE id=$1",
      [expired.flowID],
    );
    await assert.rejects(() =>
      browserCallback(repo, config, expired.providerState, "provider-code"),
    );
    const codeExpiry = await begin();
    const expiringCode = new URL(
      await browserCallback(
        repo,
        config,
        codeExpiry.providerState,
        "provider-code",
      ),
    ).searchParams.get("code")!;
    await database.query(
      "UPDATE browser_codes SET expires_at=now()-interval '1 second' WHERE code_hash=$1",
      [await hash(expiringCode)],
    );
    await assert.rejects(() =>
      exchangeBrowser(repo, {
        code: expiringCode,
        code_verifier: codeExpiry.verifier,
        redirect_uri: callbackURI,
      }),
    );
    mode = "different";
    const closed = await begin();
    await assert.rejects(
      () =>
        browserCallback(
          repo,
          { ...config, registration: "closed" },
          closed.providerState,
          "provider-code",
        ),
      (e: unknown) => e instanceof Problem && e.code === "registration_closed",
    );
    await assert.rejects(async () =>
      startBrowser(repo, config, {
        redirect_uri: "evil://callback",
        state: random(),
        code_challenge: await pkce(random()),
      }),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
