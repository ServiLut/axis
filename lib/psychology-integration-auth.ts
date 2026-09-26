import { createHash, timingSafeEqual } from "node:crypto";

// Dedicated read-only integration key. Never reuse the JWT signing key, Supabase
// service role, an operator's session or credentials belonging to another business.
export function authorizePsychologyIntegration(
  authorization: string | null,
  config: { enabled?: string; tokenHash?: string } = {
    enabled: process.env.PSICOLOGOS_N8N_ENABLED,
    tokenHash: process.env.PSICOLOGOS_N8N_TOKEN_HASH,
  },
): 200 | 401 | 503 {
  if (config.enabled !== "true" || !/^[a-f0-9]{64}$/.test(config.tokenHash || "")) return 503;
  if (!authorization || authorization.length > 256 || !/^Bearer [A-Za-z0-9_-]{43,128}$/.test(authorization)) return 401;
  const actual = createHash("sha256").update(authorization.slice(7)).digest();
  return timingSafeEqual(actual, Buffer.from(config.tokenHash!, "hex")) ? 200 : 401;
}
