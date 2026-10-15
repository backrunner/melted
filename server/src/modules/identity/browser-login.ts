import { z } from "zod";
import { type Config } from "../../config/schema.js";
import { id, random, pkce } from "../../shared/crypto.js";
import { parse } from "../../shared/validation.js";
import { Problem, unauthorized } from "../../shared/problem.js";
import type { BrowserRepository } from "./browser-repository.js";
import { metadata, providerSubject } from "./oidc-provider.js";

export const callbackURI = "melted://auth/callback";
export async function startBrowser(
  repo: BrowserRepository,
  config: Config,
  body: unknown,
) {
  if (!config.oidc) throw new Problem(404, "browser_login_unavailable");
  const input = parse(
    z
      .object({
        redirect_uri: z.literal(callbackURI),
        state: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
        code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
      })
      .strict(),
    body,
  );
  const flowID = id("flow");
  await repo.saveFlow({
    id: flowID,
    client_state: input.state,
    client_challenge: input.code_challenge,
    redirect_uri: input.redirect_uri,
    provider_state: `${flowID}.${random()}`,
    nonce: random(),
    provider_verifier: random(),
    issuer: config.oidc.issuer,
  });
  return {
    authorization_url: `${config.publicOrigin}/v1/auth/browser/authorize?request=${flowID}`,
    expires_in: 300,
  };
}
export async function authorizeBrowser(
  repo: BrowserRepository,
  config: Config,
  flowID: string,
) {
  if (!/^flow_[a-f0-9]{32}$/.test(flowID)) throw unauthorized();
  const [flow, provider] = await Promise.all([
    repo.readFlow(flowID),
    metadata(config),
  ]);
  if (flow.issuer !== config.oidc!.issuer) throw unauthorized();
  const url = new URL(provider.authorization_endpoint);
  for (const [key, value] of Object.entries({
    response_type: "code",
    client_id: config.oidc!.clientID,
    redirect_uri: `${config.publicOrigin}/v1/auth/browser/callback`,
    scope: "openid",
    state: flow.provider_state,
    nonce: flow.nonce,
    code_challenge: await pkce(flow.provider_verifier),
    code_challenge_method: "S256",
  }))
    url.searchParams.set(key, value);
  return url.toString();
}
export async function browserCallback(
  repo: BrowserRepository,
  config: Config,
  state: string,
  code: string,
) {
  if (
    !state ||
    state.length > 256 ||
    !code ||
    code.length > 4096 ||
    !config.oidc
  )
    throw unauthorized();
  const flow = await repo.claimFlow(state);
  if (flow.issuer !== config.oidc.issuer) throw unauthorized();
  const subject = await providerSubject(
    { ...config, oidc: config.oidc },
    flow,
    code,
  );
  const appCode = `${flow.id}.${random()}`;
  await repo.completeFlow(
    flow,
    subject,
    appCode,
    config.registration === "key",
  );
  const redirect = new URL(flow.redirect_uri);
  redirect.searchParams.set("code", appCode);
  redirect.searchParams.set("state", flow.client_state);
  return redirect.toString();
}
export async function exchangeBrowser(repo: BrowserRepository, body: unknown) {
  const input = parse(
    z
      .object({
        code: z.string().min(1).max(256),
        code_verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
        redirect_uri: z.literal(callbackURI),
      })
      .strict(),
    body,
  );
  return repo.exchangeCode(
    input.code,
    await pkce(input.code_verifier),
    input.redirect_uri,
  );
}
