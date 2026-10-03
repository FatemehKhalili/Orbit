/** Calls to the API's /auth endpoints. Server-side only (ADR 0002). */

import { apiFetch, type ApiOptions } from "@/lib/api-client";

export type User = { id: string; email: string; displayName: string };

export type LoginResult =
  | { ok: true; token: string; expiresAt: Date }
  | { ok: false; reason: "invalid" | "unavailable" };

export type CurrentUser =
  | { state: "authenticated"; user: User }
  | { state: "unauthenticated" }
  | { state: "unavailable" };

type ApiUser = { id: string; email: string; display_name: string };

export async function loginWithApi(
  email: string,
  password: string,
  options: ApiOptions = {},
): Promise<LoginResult> {
  const response = await apiFetch(
    "/auth/login",
    { method: "POST", json: { email, password } },
    options,
  );
  if (response?.ok) {
    const body = (await response.json()) as { token: string; expires_at: string };
    return { ok: true, token: body.token, expiresAt: new Date(body.expires_at) };
  }
  // 401 is a wrong email or password; 422 is input the API refuses outright (too long).
  if (response && (response.status === 401 || response.status === 422)) {
    return { ok: false, reason: "invalid" };
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
