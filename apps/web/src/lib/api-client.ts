/**
 * The web app's client for the Orbit API. Server-side only (ADR 0002): the browser never
 * talks to the API, and the session token never leaves the Next.js server.
 */

import { ConfigError, getApiBaseUrl } from "@/lib/config";

type Env = Record<string, string | undefined>;

export type ApiOptions = {
  env?: Env;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export type ApiInit = Omit<RequestInit, "body"> & {
  /** Sent as `Authorization: Bearer <token>`. */
  token?: string;
  /** Sent as a JSON body. */
  json?: unknown;
};

/**
 * Sends one request to the API. Returns the response whatever its status, or null when
 * the API could not be asked at all: not configured, unreachable or too slow.
 */
export async function apiFetch(
  path: string,
  init: ApiInit = {},
  { env = process.env, fetchImpl = fetch, timeoutMs = 5000 }: ApiOptions = {},
): Promise<Response | null> {
  let baseUrl: string;
  try {
    baseUrl = getApiBaseUrl(env);
  } catch (error) {
    if (error instanceof ConfigError) return null;
    throw error;
  }
  const { token, json, headers, ...rest } = init;
  try {
    return await fetchImpl(`${baseUrl}${path}`, {
      ...rest,
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Accept: "application/json",
        ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
    });
  } catch {
    return null;
  }
}

/**
 * Why a request failed, in the terms callers act on:
 * - unauthenticated: 401, the session is missing, expired or revoked (sign in again)
 * - not_found: 404, including another user's record (ADR 0007)
 * - invalid: 422, the API refused the input
 * - unavailable: anything else, including the API being down
 */
export type ApiError = "unauthenticated" | "not_found" | "invalid" | "unavailable";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

const ERRORS_BY_STATUS: Record<number, ApiError> = {
  401: "unauthenticated",
  404: "not_found",
  422: "invalid",
};

/** Sends a request and parses a JSON response body (`undefined` for 204). */
export async function apiRequest<T>(
  path: string,
  init: ApiInit = {},
  options: ApiOptions = {},
): Promise<ApiResult<T>> {
  const response = await apiFetch(path, init, options);
  if (!response) return { ok: false, error: "unavailable" };
  if (!response.ok) return { ok: false, error: ERRORS_BY_STATUS[response.status] ?? "unavailable" };
  if (response.status === 204) return { ok: true, data: undefined as T };
  try {
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}
