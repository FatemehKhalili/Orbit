import { describe, expect, it, vi } from "vitest";

import { apiFetch, apiRequest } from "./api-client";

const env = { ORBIT_API_URL: "http://api:8000/" };

function respondWith(status: number, body?: unknown) {
  return vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      new Response(body === undefined ? null : JSON.stringify(body), { status }),
    );
}

const unreachable = () => vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));

describe("apiFetch", () => {
  it("calls the configured API from the server with no caching", async () => {
    const fetchImpl = respondWith(200, {});

    await apiFetch("/shopping/items", {}, { env, fetchImpl });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://api:8000/shopping/items");
    expect(init?.cache).toBe("no-store");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const headers = init?.headers as Record<string, string>;
    expect(headers.Accept).toBe("application/json");
    expect(headers.Authorization).toBeUndefined();
    expect(headers["Content-Type"]).toBeUndefined();
    expect(init?.body).toBeUndefined();
  });

  it("sends the token as a bearer token and a JSON body", async () => {
    const fetchImpl = respondWith(201, {});

    await apiFetch(
      "/shopping/items",
      { method: "POST", token: "raw-token", json: { name: "Milk" } },
      { env, fetchImpl },
    );

    const init = fetchImpl.mock.calls[0][1];
    const headers = init?.headers as Record<string, string>;
    expect(init?.method).toBe("POST");
    expect(headers.Authorization).toBe("Bearer raw-token");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(String(init?.body))).toEqual({ name: "Milk" });
  });

  it("returns null when the API is not configured or cannot be reached", async () => {
    expect(await apiFetch("/x", {}, { env: {}, fetchImpl: respondWith(200) })).toBeNull();
    expect(await apiFetch("/x", {}, { env, fetchImpl: unreachable() })).toBeNull();
  });

  it("gives up after the timeout", async () => {
    const fetchImpl = vi.fn<typeof fetch>((_url, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    });

    expect(await apiFetch("/x", {}, { env, fetchImpl, timeoutMs: 10 })).toBeNull();
  });
});

describe("apiRequest", () => {
  it("returns the parsed body on success", async () => {
    const result = await apiRequest("/x", {}, { env, fetchImpl: respondWith(200, [{ id: "1" }]) });

    expect(result).toEqual({ ok: true, data: [{ id: "1" }] });
  });

  it("returns no data for 204", async () => {
    expect(await apiRequest("/x", {}, { env, fetchImpl: respondWith(204) })).toEqual({
      ok: true,
      data: undefined,
    });
  });

  it.each([
    [401, "unauthenticated"],
    [404, "not_found"],
    [422, "invalid"],
    [400, "unavailable"],
    [500, "unavailable"],
    [503, "unavailable"],
  ])("maps HTTP %i to %s", async (status, error) => {
    const fetchImpl = respondWith(status, { detail: "x" });

    const result = await apiRequest("/x", {}, { env, fetchImpl });

    expect(result).toEqual({ ok: false, error });
  });

  it("reports the API as unavailable when it is down or misconfigured", async () => {
    const unavailable = { ok: false, error: "unavailable" };
    expect(await apiRequest("/x", {}, { env, fetchImpl: unreachable() })).toEqual(unavailable);
    expect(await apiRequest("/x", {}, { env: {}, fetchImpl: respondWith(200, {}) })).toEqual(
      unavailable,
    );
  });

  it("reports a malformed success body as unavailable", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("<html>", { status: 200 }));

    expect(await apiRequest("/x", {}, { env, fetchImpl })).toEqual({
      ok: false,
      error: "unavailable",
    });
  });
});
