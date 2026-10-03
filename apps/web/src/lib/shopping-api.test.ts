import { describe, expect, it, vi } from "vitest";

import {
  createShoppingItem,
  deleteShoppingItem,
  getShoppingItem,
  listShoppingItems,
  updateShoppingItem,
} from "./shopping-api";

const env = { ORBIT_API_URL: "http://api:8000" };

const apiItem = {
  id: "8a1c6f9e-0000-4000-8000-000000000001",
  name: "Milk",
  quantity: "1 l",
  notes: null,
  checked: false,
  created_at: "2026-10-03T10:00:00Z",
  updated_at: "2026-10-03T10:05:00Z",
};

const item = {
  id: apiItem.id,
  name: "Milk",
  quantity: "1 l",
  notes: null,
  checked: false,
  createdAt: "2026-10-03T10:00:00Z",
  updatedAt: "2026-10-03T10:05:00Z",
};

function respondWith(status: number, body?: unknown) {
  return vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      new Response(body === undefined ? null : JSON.stringify(body), { status }),
    );
}

function request(fetchImpl: ReturnType<typeof respondWith>) {
  const [url, init] = fetchImpl.mock.calls[0];
  const headers = init?.headers as Record<string, string>;
  return {
    url,
    method: init?.method ?? "GET",
    authorization: headers.Authorization,
    body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
  };
}

describe("shopping API calls", () => {
  it("lists the items with the session token", async () => {
    const fetchImpl = respondWith(200, [apiItem]);

    expect(await listShoppingItems("tok", { env, fetchImpl })).toEqual({ ok: true, data: [item] });
    expect(request(fetchImpl)).toEqual({
      url: "http://api:8000/shopping/items",
      method: "GET",
      authorization: "Bearer tok",
      body: undefined,
    });
  });

  it("gets one item", async () => {
    const fetchImpl = respondWith(200, apiItem);

    expect(await getShoppingItem("tok", item.id, { env, fetchImpl })).toEqual({
      ok: true,
      data: item,
    });
    expect(request(fetchImpl).url).toBe(`http://api:8000/shopping/items/${item.id}`);
  });

  it("encodes the ID into the path", async () => {
    const fetchImpl = respondWith(404, { detail: "Shopping item not found" });

    expect(await getShoppingItem("tok", "../../auth/me", { env, fetchImpl })).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(request(fetchImpl).url).toBe("http://api:8000/shopping/items/..%2F..%2Fauth%2Fme");
  });

  it("creates an item", async () => {
    const fetchImpl = respondWith(201, apiItem);
    const input = { name: "Milk", quantity: "1 l", notes: null };

    expect(await createShoppingItem("tok", input, { env, fetchImpl })).toEqual({
      ok: true,
      data: item,
    });
    expect(request(fetchImpl)).toMatchObject({ method: "POST", body: input });
  });

  it("updates only the given fields", async () => {
    const fetchImpl = respondWith(200, { ...apiItem, checked: true });

    const result = await updateShoppingItem("tok", item.id, { checked: true }, { env, fetchImpl });

    expect(result).toEqual({ ok: true, data: { ...item, checked: true } });
    expect(request(fetchImpl)).toMatchObject({
      url: `http://api:8000/shopping/items/${item.id}`,
      method: "PATCH",
      body: { checked: true },
    });
  });

  it("deletes an item", async () => {
    const fetchImpl = respondWith(204);

    expect(await deleteShoppingItem("tok", item.id, { env, fetchImpl })).toEqual({
      ok: true,
      data: undefined,
    });
    expect(request(fetchImpl).method).toBe("DELETE");
  });

  it("passes failures through", async () => {
    expect(await listShoppingItems("tok", { env, fetchImpl: respondWith(401) })).toEqual({
      ok: false,
      error: "unauthenticated",
    });
    expect(
      await updateShoppingItem("tok", item.id, { name: "x" }, { env, fetchImpl: respondWith(503) }),
    ).toEqual({ ok: false, error: "unavailable" });
  });
});
