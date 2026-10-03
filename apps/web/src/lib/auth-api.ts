/** Calls to the API's /auth endpoints. Server-side only (ADR 0002). */

import { ConfigError, getApiBaseUrl } from "@/lib/config";

type Env = Record<string, string | undefined>;

type Options = {
  env?: Env;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export type User = { id: string; email: string; displayName: string };

export type LoginResult =
  | { ok: true; token: string; expiresAt: Date }
  | { ok: false; reason: "invalid" | "unavailable" };

export type CurrentUser =
  | { state: "authenticated"; user: User }
  | { state: "unauthenticated" }
  | { state: "unavailable" };

type ApiUser = { id: string; email: string; display_name: string };

async function callApi(
  path: string,
  init: RequestInit & { token?: string },
  { env = process.env, fetchImpl = fetch, timeoutMs = 5000 }: Options,
): Promise<Response | null> {
  let baseUrl: string;
  try {
    baseUrl = getApiBaseUrl(env);
  } catch (error) {
    if (error instanceof ConfigError) return null;
    throw error;
  }
  const { token, headers, ...rest } = init;
  try {
    return await fetchImpl(`${baseUrl}${path}`, {
      ...rest,
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });
  } catch {
    return null;
  }
}

export async function loginWithApi(
  email: string,
  password: string,
  options: Options = {},
): Promise<LoginResult> {
  const response = await callApi(
    "/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    },
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
export async function logoutWithApi(token: string, options: Options = {}): Promise<boolean> {
  const response = await callApi("/auth/logout", { method: "POST", token }, options);
  return response?.status === 204;
}

export async function fetchCurrentUser(token: string, options: Options = {}): Promise<CurrentUser> {
  const response = await callApi("/auth/me", { method: "GET", token }, options);
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
