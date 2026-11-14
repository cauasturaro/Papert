import { isIP } from "node:net";

/**
 * Only a trusted ingress can establish XFF: Next preserves client-written headers and
 * exposes no socket peer in route handlers. Zero proxies therefore means unknown.
 * The public ingress must overwrite XFF; subsequent trusted proxies may append to it.
 */
export function clientAddress(
  forwardedFor: string | null,
  trustedProxies: number,
) {
  if (!forwardedFor || trustedProxies <= 0) {
    return null;
  }

  const entries = forwardedFor.split(",").map((entry) => entry.trim());
  const candidate = entries[entries.length - trustedProxies];

  if (!candidate || isIP(candidate) === 0) {
    return null;
  }

  return candidate;
}

/** Proxies in front of Web that append to X-Forwarded-For (TRUSTED_PROXY_COUNT, default 0). */
export function trustedProxyCount(
  env: Record<string, string | undefined> = process.env,
) {
  const count = Number(env.TRUSTED_PROXY_COUNT ?? 0);

  return Number.isInteger(count) && count >= 0 ? count : 0;
}
