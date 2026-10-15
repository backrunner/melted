import { z } from "zod";
import { parse } from "../shared/validation.js";

export const configSchema = z.object({
  serverID: z.string().min(1).max(100),
  operator: z.string().min(1).max(200),
  publicOrigin: z
    .url()
    .refine((v) => {
      const u = new URL(v);
      return (
        u.pathname === "/" &&
        !u.username &&
        !u.password &&
        !u.search &&
        !u.hash &&
        (u.protocol === "https:" ||
          (u.protocol === "http:" &&
            ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname)))
      );
    })
    .transform((v) => new URL(v).origin),
  registration: z.enum(["key", "closed"]).default("key"),
  oidc: z
    .object({
      issuer: z.url().startsWith("https://"),
      clientID: z.string().min(1),
      clientSecret: z.string().optional(),
    })
    .optional(),
});
export type Config = z.infer<typeof configSchema>;
export function configFromEnv(env: Record<string, string | undefined>): Config {
  const oidcPresent = [
    env.OIDC_ISSUER,
    env.OIDC_CLIENT_ID,
    env.OIDC_CLIENT_SECRET,
  ].some(Boolean);
  return parse(configSchema, {
    serverID: env.MELTED_SERVER_ID,
    operator: env.MELTED_OPERATOR ?? "Melted",
    publicOrigin: env.PUBLIC_ORIGIN,
    registration: env.REGISTRATION_MODE ?? "key",
    oidc: oidcPresent
      ? {
          issuer: env.OIDC_ISSUER,
          clientID: env.OIDC_CLIENT_ID,
          clientSecret: env.OIDC_CLIENT_SECRET,
        }
      : undefined,
  });
}
