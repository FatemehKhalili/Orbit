/**
 * The session cookie. It holds the raw API session token; the API stores only its hash.
 * Only the Next.js server reads it (httpOnly), and it is sent to the API as a bearer
 * token from the server, never from the browser.
 */

type Env = Record<string, string | undefined>;

export const SESSION_COOKIE = "orbit_session";

/**
 * Secure (HTTPS-only) cookies in production. ORBIT_INSECURE_COOKIES=true turns this off
 * for self-hosting over plain HTTP on a trusted home network; anyone on that network
 * could then read the session cookie in transit.
 */
export function secureCookiesEnabled(env: Env = process.env): boolean {
  if (env.NODE_ENV !== "production") return false;
  return env.ORBIT_INSECURE_COOKIES?.trim().toLowerCase() !== "true";
}

export function sessionCookieOptions(expiresAt: Date, env: Env = process.env) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: secureCookiesEnabled(env),
    expires: expiresAt,
  };
}

/**
 * The device cookie (ADR 0010). It holds a random token the API gave this browser at its
 * first successful sign-in; the API stores only its hash. It is not a credential: it never
 * replaces the password. It only lets this browser's sign-ins be throttled on their own,
 * so someone guessing the owner's password cannot lock the owner out of this browser.
 */
export const DEVICE_COOKIE = "orbit_device";

const DEVICE_COOKIE_DAYS = 365;

export function deviceCookieOptions(env: Env = process.env) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: secureCookiesEnabled(env),
    maxAge: DEVICE_COOKIE_DAYS * 24 * 60 * 60,
  };
}
