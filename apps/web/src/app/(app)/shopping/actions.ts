"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { clearSession, getSessionToken } from "@/lib/auth";
import { LOGIN_PATH } from "@/lib/routes";
import {
  performAddItem,
  performDeleteItem,
  performEditItem,
  performToggleItem,
  type ShoppingFormState,
} from "@/lib/shopping";
import {
  createShoppingItem,
  deleteShoppingItem,
  updateShoppingItem,
} from "@/lib/shopping-api";

// Each action asks the API with the caller's own session token; the API decides what
// that session may see and change (ADR 0007). Nothing here trusts the page that
// rendered the form.

const SHOPPING_PATH = "/shopping";

async function settle(state: ShoppingFormState): Promise<ShoppingFormState> {
  if (state.status === "signed_out") {
    await clearSession();
    redirect(LOGIN_PATH);
  }
  // Re-render the list in the same round trip, with or without JavaScript.
  revalidatePath(SHOPPING_PATH);
  return state;
}

export async function addItem(
  _previous: ShoppingFormState,
  formData: FormData,
): Promise<ShoppingFormState> {
  const token = await getSessionToken();
  return settle(await performAddItem(formData, token, { create: createShoppingItem }));
}

export async function editItem(
  _previous: ShoppingFormState,
  formData: FormData,
): Promise<ShoppingFormState> {
  const token = await getSessionToken();
  const state = await settle(
    await performEditItem(formData, token, { update: updateShoppingItem }),
  );
  if (state.status === "success") redirect(SHOPPING_PATH);
  return state;
}

export async function toggleItem(
  _previous: ShoppingFormState,
  formData: FormData,
): Promise<ShoppingFormState> {
  const token = await getSessionToken();
  return settle(await performToggleItem(formData, token, { update: updateShoppingItem }));
}

export async function deleteItem(
  _previous: ShoppingFormState,
  formData: FormData,
): Promise<ShoppingFormState> {
  const token = await getSessionToken();
  return settle(await performDeleteItem(formData, token, { remove: deleteShoppingItem }));
}
