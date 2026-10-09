/**
 * The Shopping forms' logic, without Next.js: reads and checks the form, calls the API
 * and decides what the form shows next. The Server Actions in app/(app)/shopping wire
 * it to cookies, revalidation and redirects. The API is the authority on validation and
 * ownership; the checks here only give quicker, friendlier messages.
 */

import type { ApiError, ApiResult } from "@/lib/api-client";
import type {
  NewShoppingItem,
  ShoppingItem,
  ShoppingItemChanges,
} from "@/lib/shopping-api";

/** Must match the API (apps/api/app/models/shopping.py). */
export const SHOPPING_LIMITS = { name: 200, quantity: 50, notes: 1000 } as const;

export type ItemFields = { name: string; quantity: string; notes: string };

export type ShoppingFormState =
  | { status: "idle" }
  | { status: "success"; message?: string }
  | { status: "error"; error: string; fields?: ItemFields }
  /** The session is gone: the caller clears the cookie and sends the user to sign in. */
  | { status: "signed_out" };

export const IDLE: ShoppingFormState = { status: "idle" };

export const SHOPPING_ERRORS = {
  nameMissing: "Enter a name for the item.",
  nameTooLong: `Keep the name to ${SHOPPING_LIMITS.name} characters or fewer.`,
  quantityTooLong: `Keep the quantity to ${SHOPPING_LIMITS.quantity} characters or fewer.`,
  notesTooLong: `Keep the notes to ${SHOPPING_LIMITS.notes} characters or fewer.`,
  missingItem: "Orbit could not tell which item to change. Reload the page and try again.",
  invalid: "Orbit could not save this item. Check the fields and try again.",
  not_found: "This item no longer exists. It may have been deleted elsewhere.",
  unavailable: "Orbit could not reach its server. Try again in a moment.",
} as const;

export type ShoppingApi = {
  create: (token: string, item: NewShoppingItem) => Promise<ApiResult<ShoppingItem>>;
  update: (
    token: string,
    id: string,
    changes: ShoppingItemChanges,
  ) => Promise<ApiResult<ShoppingItem>>;
  remove: (token: string, id: string) => Promise<ApiResult<undefined>>;
};

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export function readItemFields(formData: FormData): ItemFields {
  return {
    name: text(formData, "name"),
    quantity: text(formData, "quantity"),
    notes: text(formData, "notes"),
  };
}

/** Checks the fields; returns the item to send, or the message to show. */
export function validateItem(fields: ItemFields): NewShoppingItem | string {
  if (!fields.name) return SHOPPING_ERRORS.nameMissing;
  if (fields.name.length > SHOPPING_LIMITS.name) return SHOPPING_ERRORS.nameTooLong;
  if (fields.quantity.length > SHOPPING_LIMITS.quantity) return SHOPPING_ERRORS.quantityTooLong;
  if (fields.notes.length > SHOPPING_LIMITS.notes) return SHOPPING_ERRORS.notesTooLong;
  return { name: fields.name, quantity: fields.quantity || null, notes: fields.notes || null };
}

function failed(error: ApiError, fields?: ItemFields): ShoppingFormState {
  if (error === "unauthenticated") return { status: "signed_out" };
  return { status: "error", error: SHOPPING_ERRORS[error], fields };
}

export async function performAddItem(
  formData: FormData,
  token: string | undefined,
  api: Pick<ShoppingApi, "create">,
): Promise<ShoppingFormState> {
  if (!token) return { status: "signed_out" };
  const fields = readItemFields(formData);
  const item = validateItem(fields);
  if (typeof item === "string") return { status: "error", error: item, fields };

  const result = await api.create(token, item);
  if (!result.ok) return failed(result.error, fields);
  return { status: "success", message: `Added “${result.data.name}”.` };
}

export async function performEditItem(
  formData: FormData,
  token: string | undefined,
  api: Pick<ShoppingApi, "update">,
): Promise<ShoppingFormState> {
  if (!token) return { status: "signed_out" };
  const id = text(formData, "id");
  if (!id) return { status: "error", error: SHOPPING_ERRORS.missingItem };
  const fields = readItemFields(formData);
  const item = validateItem(fields);
  if (typeof item === "string") return { status: "error", error: item, fields };

  // Sends every field, so emptying quantity or notes clears them.
  const result = await api.update(token, id, item);
  if (!result.ok) return failed(result.error, fields);
  return { status: "success" };
}

export async function performToggleItem(
  formData: FormData,
  token: string | undefined,
  api: Pick<ShoppingApi, "update">,
): Promise<ShoppingFormState> {
  if (!token) return { status: "signed_out" };
  const id = text(formData, "id");
  if (!id) return { status: "error", error: SHOPPING_ERRORS.missingItem };
  // The form carries the state to switch to, so a repeated submit cannot flip it back.
  const checked = text(formData, "checked") === "true";

  const result = await api.update(token, id, { checked });
  if (!result.ok) return failed(result.error);
  return { status: "success" };
}

export async function performDeleteItem(
  formData: FormData,
  token: string | undefined,
  api: Pick<ShoppingApi, "remove">,
): Promise<ShoppingFormState> {
  if (!token) return { status: "signed_out" };
  const id = text(formData, "id");
  if (!id) return { status: "error", error: SHOPPING_ERRORS.missingItem };

  const result = await api.remove(token, id);
  // Already gone is what the user wanted.
  if (!result.ok && result.error !== "not_found") return failed(result.error);
  return { status: "success" };
}

/** "3 to buy · 2 checked", for the list heading. */
export function summarize(items: Pick<ShoppingItem, "checked">[]): string {
  if (items.length === 0) return "Nothing on the list";
  const checked = items.filter((item) => item.checked).length;
  const toBuy = items.length - checked;
  return checked ? `${toBuy} to buy · ${checked} checked` : `${toBuy} to buy`;
}
