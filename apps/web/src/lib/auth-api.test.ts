import { describe, expect, it, vi } from "vitest";

import { fetchCurrentUser, loginWithApi, logoutWithApi } from "./auth-api";

const env = { ORBIT_API_URL: "http://api:8000/" };

function respondWith(status: number, body: unknown = {}) {
  return vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(status === 204 ? null : JSON.stringify(body), { status }));
}

const unreachable = () => vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));

function headersOf(fetchImpl: ReturnType<typeof respondWith>): Record<string, string> {
  return fetchImpl.mock.calls[0][1]?.headers as Record<string, string>;
}

describe("loginWithApi", () => {
  it("posts the credentials as JSON and returns the token and expiry", async () => {
    const fetchImpl = respondWith(200, {
      token: "raw-token",
      expires_at: "2026-11-02T06:00:00+00:00",
      user: {},
    });

    const result = await loginWithApi("owner@example.com", "pw", { env, fetchImpl });

    expect(result).toEqual({
      ok: true,
      token: "raw-token",
      expiresAt: new Date("2026-11-02T06:00:00Z"),
    });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://api:8000/auth/login");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ email: "owner@example.com", password: "pw" });
    expect(headersOf(fetchImpl).Authorization).toBeUndefined();
  });

  it.each([401, 422])("reports invalid credentials for HTTP %i", async (status) => {
    const result = await loginWithApi("a@example.com", "pw", {
      env,
      fetchImpl: respondWith(status),
    });
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });

  it("reports the API as unavailable on server errors, network errors and missing config", async () => {
    const unavailable = { ok: false, reason: "unavailable" };
    expect(await loginWithApi("a", "b", { env, fetchImpl: respondWith(500) })).toEqual(unavailable);
    expect(await loginWithApi("a", "b", { env, fetchImpl: unreachable() })).toEqual(unavailable);
    expect(await loginWithApi("a", "b", { env: {}, fetchImpl: respondWith(200) })).toEqual(
      unavailable,
    );
  });
});

describe("fetchCurrentUser", () => {
  it("sends the session token as a bearer token", async () => {
    const fetchImpl = respondWith(200, { id: "1", email: "owner@example.com", display_name: "Me" });

    const result = await fetchCurrentUser("raw-token", { env, fetchImpl });

    expect(result).toEqual({
      state: "authenticated",
      user: { id: "1", email: "owner@example.com", displayName: "Me" },
    });
    expect(fetchImpl.mock.calls[0][0]).toBe("http://api:8000/auth/me");
    expect(headersOf(fetchImpl).Authorization).toBe("Bearer raw-token");
    expect(fetchImpl.mock.calls[0][1]?.cache).toBe("no-store");
  });

  it("reports unauthenticated when the API rejects the token", async () => {
    expect(await fetchCurrentUser("t", { env, fetchImpl: respondWith(401) })).toEqual({
      state: "unauthenticated",
    });
  });

  it("reports unavailable, not unauthenticated, when the API is down", async () => {
    expect(await fetchCurrentUser("t", { env, fetchImpl: unreachable() })).toEqual({
      state: "unavailable",
    });
    expect(await fetchCurrentUser("t", { env, fetchImpl: respondWith(503) })).toEqual({
      state: "unavailable",
    });
  });

  it("gives up after the timeout", async () => {
    const fetchImpl = vi.fn<typeof fetch>((_url, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    });

    expect(await fetchCurrentUser("t", { env, fetchImpl, timeoutMs: 10 })).toEqual({
      state: "unavailable",
    });
  });
});

describe("logoutWithApi", () => {
  it("posts to /auth/logout with the token and reports success on 204", async () => {
    const fetchImpl = respondWith(204);

    expect(await logoutWithApi("raw-token", { env, fetchImpl })).toBe(true);
    expect(fetchImpl.mock.calls[0][0]).toBe("http://api:8000/auth/logout");
    expect(fetchImpl.mock.calls[0][1]?.method).toBe("POST");
    expect(headersOf(fetchImpl).Authorization).toBe("Bearer raw-token");
  });

  it("reports failure without throwing when the API is down", async () => {
    expect(await logoutWithApi("t", { env, fetchImpl: unreachable() })).toBe(false);
  });
});
