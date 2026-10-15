// Small development baseline. It is not a cross-framework benchmark or production capacity claim.
import { b64 } from "../../src/shared/crypto.js";
const origin = process.argv[2];
if (!origin) throw new Error("Pass a local development origin");
const base = new URL(origin);
if (
  base.protocol !== "http:" ||
  (!["127.0.0.1", "localhost"].includes(base.hostname) &&
    !base.hostname.startsWith("192.168.64."))
)
  throw new Error("Only the local Apple Container network is allowed");
const call = async (path: string, body?: unknown, token?: string) => {
  const r = await fetch(origin + path, {
    method: body ? "POST" : "GET",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.status === 204 ? null : ((await r.json()) as any);
};
const d = await call("/.well-known/melted");
if (!d.capabilities.development_samples)
  throw new Error("Development samples must be enabled");
const key = await crypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"],
);
const c = await call("/v1/auth/key/challenges", {
  public_key: b64(await crypto.subtle.exportKey("raw", key.publicKey)),
});
const session = await call("/v1/auth/key/sessions", {
  challenge_id: c.challenge_id,
  signature: b64(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      key.privateKey,
      new TextEncoder().encode(c.message),
    ),
  ),
});
await call("/v1/development/seed", {}, session.access_token);
const timings: number[] = [];
let next = 0;
const count = 200,
  concurrency = 16,
  start = performance.now();
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (next < count) {
      const index = next++;
      const before = performance.now();
      await call(
        index % 2 ? "/v1/briefings/demo_library" : "/v1/briefings?limit=30",
        undefined,
        session.access_token,
      );
      timings.push(performance.now() - before);
    }
  }),
);
const elapsed = performance.now() - start;
timings.sort((a, b) => a - b);
console.log(
  JSON.stringify(
    {
      runtime: process.version,
      requests: count,
      concurrency,
      fixture_documents: 6,
      errors: 0,
      elapsed_ms: Math.round(elapsed),
      requests_per_second: Math.round((count / elapsed) * 1000),
      p50_ms: Number(timings[Math.floor(count * 0.5)]!.toFixed(2)),
      p95_ms: Number(timings[Math.floor(count * 0.95)]!.toFixed(2)),
      note: "Local container HTTP; 50% authenticated list snapshots / 50% details; no TLS or AI",
    },
    null,
    2,
  ),
);
