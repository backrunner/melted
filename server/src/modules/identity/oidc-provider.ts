import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import { type Config } from "../../config/schema.js";
import { parse } from "../../shared/validation.js";
import { Problem, unauthorized } from "../../shared/problem.js";
import type { BrowserFlow } from "./browser-flow.js";

const safeURL = z.url().refine((v) => {
  const u = new URL(v);
  return u.protocol === "https:" && !u.username && !u.password && !u.hash;
});
const metadataSchema = z.object({
  issuer: safeURL,
  authorization_endpoint: safeURL,
  token_endpoint: safeURL,
  jwks_uri: safeURL,
});
type Metadata = z.infer<typeof metadataSchema>;
const metadataCache = new Map<
  string,
  { expires: number; metadata: Metadata }
>();
async function jsonResponse(response: Response) {
  if (!response.ok) throw new Problem(503, "identity_provider_unavailable");
  const reader = response.body?.getReader();
  if (!reader) throw new Problem(503, "identity_provider_unavailable");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 256_000) {
      await reader.cancel();
      throw new Problem(503, "identity_provider_unavailable");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}
export async function metadata(config: Config) {
  if (!config.oidc) throw new Problem(404, "browser_login_unavailable");
  const cached = metadataCache.get(config.oidc.issuer);
  if (cached && cached.expires > Date.now()) return cached.metadata;
  const data = parse(
    metadataSchema,
    await jsonResponse(
      await fetch(
        `${config.oidc.issuer.replace(/\/$/, "")}/.well-known/openid-configuration`,
        { redirect: "error", signal: AbortSignal.timeout(8000) },
      ),
    ),
  );
  if (data.issuer !== config.oidc.issuer) throw unauthorized();
  metadataCache.set(data.issuer, {
    expires: Date.now() + 300_000,
    metadata: data,
  });
  return data;
}

export async function providerSubject(
  config: Config & { oidc: NonNullable<Config["oidc"]> },
  flow: BrowserFlow,
  code: string,
): Promise<string> {
  const provider = await metadata(config);
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: `${config.publicOrigin}/v1/auth/browser/callback`,
    client_id: config.oidc.clientID,
    code_verifier: flow.provider_verifier,
  });
  if (config.oidc.clientSecret)
    params.set("client_secret", config.oidc.clientSecret);
  const tokens = parse(
    z.object({ id_token: z.string().min(1).max(64000) }),
    await jsonResponse(
      await fetch(provider.token_endpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: params,
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      }),
    ),
  );
  const { payload } = await jwtVerify(
    tokens.id_token,
    createRemoteJWKSet(new URL(provider.jwks_uri), { timeoutDuration: 8000 }),
    {
      issuer: config.oidc.issuer,
      audience: config.oidc.clientID,
      algorithms: ["RS256", "ES256", "PS256"],
      maxTokenAge: 300,
      requiredClaims: ["exp", "iat", "sub", "nonce"],
      clockTolerance: 30,
    },
  ).catch((error: unknown) => {
    if (error instanceof Error && error.name.startsWith("JWT"))
      throw unauthorized();
    if (error instanceof Error && error.name.startsWith("JWS"))
      throw unauthorized();
    throw new Problem(503, "identity_provider_unavailable");
  });
  if (
    payload.nonce !== flow.nonce ||
    typeof payload.sub !== "string" ||
    !payload.sub ||
    payload.sub.length > 512 ||
    (Array.isArray(payload.aud) &&
      payload.aud.length > 1 &&
      payload.azp !== config.oidc.clientID) ||
    (payload.azp !== undefined && payload.azp !== config.oidc.clientID)
  )
    throw unauthorized();
  return payload.sub;
}
