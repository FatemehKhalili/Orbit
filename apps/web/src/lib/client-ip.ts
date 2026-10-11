/**
 * The browser's address, for sign-in throttling (ADR 0010). Server-side only.
 *
 * The web app sees the reverse proxy's address, not the browser's, so it can only learn
 * the browser's from the proxy's X-Forwarded-For header. A browser can send that header
 * itself, so it is trusted only when ORBIT_TRUSTED_PROXY=true says a proxy that sets it
 * stands in front of Orbit. The last entry is the one that proxy added.
 */

import { isIP } from "node:net";

type Env = Record<string, string | undefined>;

export function trustProxy(env: Env = process.env): boolean {
  return env.ORBIT_TRUSTED_PROXY?.trim().toLowerCase() === "true";
}

export function clientIpFrom(
  headers: { get(name: string): string | null },
  env: Env = process.env,
): string | undefined {
  if (!trustProxy(env)) return undefined;
  const forwarded = headers.get("x-forwarded-for");
  const last = forwarded?.split(",").at(-1)?.trim();
  return last && isIP(last) ? last : undefined;
}
