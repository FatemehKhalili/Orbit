/** Calls to the API's /shopping endpoints. Server-side only (ADR 0002). */

import { apiRequest, type ApiOptions, type ApiResult } from "@/lib/api-client";

export type ShoppingItem = {
  id: string;
  name: string;
  quantity: string | null;
  notes: string | null;
  checked: boolean;
  createdAt: string;
  updatedAt: string;
};

export type NewShoppingItem = { name: string; quantity: string | null; notes: string | null };

export type ShoppingItemChanges = Partial<NewShoppingItem & { checked: boolean }>;

type ApiShoppingItem = Omit<ShoppingItem, "createdAt" | "updatedAt"> & {
  created_at: string;
  updated_at: string;
};

const ITEMS = "/shopping/items";

function itemPath(id: string): string {
  return `${ITEMS}/${encodeURIComponent(id)}`;
}

function fromApi({ created_at, updated_at, ...item }: ApiShoppingItem): ShoppingItem {
  return { ...item, createdAt: created_at, updatedAt: updated_at };
}

function mapItem<T, U>(result: ApiResult<T>, map: (data: T) => U): ApiResult<U> {
  return result.ok ? { ok: true, data: map(result.data) } : result;
}

/** The owner's items, in the API's order: unchecked first, then oldest first. */
export async function listShoppingItems(
  token: string,
  options: ApiOptions = {},
): Promise<ApiResult<ShoppingItem[]>> {
  const result = await apiRequest<ApiShoppingItem[]>(ITEMS, { token }, options);
  return mapItem(result, (items) => items.map(fromApi));
}

export async function getShoppingItem(
  token: string,
  id: string,
  options: ApiOptions = {},
): Promise<ApiResult<ShoppingItem>> {
  return mapItem(await apiRequest<ApiShoppingItem>(itemPath(id), { token }, options), fromApi);
}

export async function createShoppingItem(
  token: string,
  item: NewShoppingItem,
  options: ApiOptions = {},
): Promise<ApiResult<ShoppingItem>> {
  const result = await apiRequest<ApiShoppingItem>(
    ITEMS,
    { method: "POST", token, json: item },
    options,
  );
  return mapItem(result, fromApi);
}

export async function updateShoppingItem(
  token: string,
  id: string,
  changes: ShoppingItemChanges,
  options: ApiOptions = {},
): Promise<ApiResult<ShoppingItem>> {
  const result = await apiRequest<ApiShoppingItem>(
    itemPath(id),
    { method: "PATCH", token, json: changes },
    options,
  );
  return mapItem(result, fromApi);
}

export async function deleteShoppingItem(
  token: string,
  id: string,
  options: ApiOptions = {},
): Promise<ApiResult<undefined>> {
  return apiRequest<undefined>(itemPath(id), { method: "DELETE", token }, options);
}
