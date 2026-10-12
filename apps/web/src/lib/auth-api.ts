/** Calls to the API's /auth endpoints. Server-side only (ADR 0002). */

import { apiFetch, type ApiOptions } from "@/lib/api-client";

export type User = { id: string; email: string; displayName: string };

export type LoginResult =
  | { ok: true; token: string; expiresAt: Date; deviceToken?: string }
  | { ok: false; reason: "invalid" | "unavailable" }
  | { ok: false; reason: "throttled"; retryAfterSeconds: number };

/** What the web server knows about the browser that is signing in (ADR 0010). */
export type LoginContext = {
  /** The browser's device token from an earlier successful sign-in. */
  deviceToken?: string;
  /** The browser's address, only when a trusted reverse proxy reported it. */
  clientIp?: string;
};

export type CurrentUser =
  | { state: "authenticated"; user: User }
  | { state: "unauthenticated" }
  | { state: "unavailable" };

type ApiUser = { id: string; email: string; display_name: string };

export async function loginWithApi(
  email: string,
  password: string,
  { deviceToken, clientIp }: LoginContext = {},
  options: ApiOptions = {},
): Promise<LoginResult> {
  const response = await apiFetch(
    "/auth/login",
    {
      method: "POST",
      json: {
        email,
        password,
        ...(deviceToken ? { device_token: deviceToken } : {}),
        ...(clientIp ? { client_ip: clientIp } : {}),
      },
    },
    options,
  );
  if (response?.ok) {
    const body = (await response.json()) as {
      token: string;
      expires_at: string;
      device_token?: string | null;
    };
    return {
      ok: true,
      token: body.token,
      expiresAt: new Date(body.expires_at),
      ...(body.device_token ? { deviceToken: body.device_token } : {}),
    };
  }
  // 401 is a wrong email or password; 422 is input the API refuses outright (too long).
  if (response && (response.status === 401 || response.status === 422)) {
    return { ok: false, reason: "invalid" };
  }
  // 429: too many failed attempts; the API says how long to wait (ADR 0010).
  if (response?.status === 429) {
    const seconds = Number.parseInt(response.headers.get("Retry-After") ?? "", 10);
    return {
      ok: false,
      reason: "throttled",
      retryAfterSeconds: Number.isFinite(seconds) && seconds > 0 ? seconds : 60,
    };
  }
  return { ok: false, reason: "unavailable" };
}

/** Revokes the session on the API. Best effort: the cookie is cleared either way. */
export async function logoutWithApi(token: string, options: ApiOptions = {}): Promise<boolean> {
  const response = await apiFetch("/auth/logout", { method: "POST", token }, options);
  return response?.status === 204;
}

export async function fetchCurrentUser(
  token: string,
  options: ApiOptions = {},
): Promise<CurrentUser> {
  const response = await apiFetch("/auth/me", { method: "GET", token }, options);
  if (response?.ok) {
    const body = (await response.json()) as ApiUser;
    return {
      state: "authenticated",
      user: { id: body.id, email: body.email, displayName: body.display_name },
    };
  }
  if (response?.status === 401) return { state: "unauthenticated" };
  return { state: "unavailable" };
}
