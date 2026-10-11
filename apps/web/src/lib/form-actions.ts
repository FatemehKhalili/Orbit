/**
 * The last step of every module's Server Actions: a lost session clears the cookie and
 * goes to the login page; anything else re-renders the module's page in the same round
 * trip, with or without JavaScript. Server-side only.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { clearSession } from "@/lib/auth";
import type { FormState } from "@/lib/forms";
import { LOGIN_PATH } from "@/lib/routes";

export async function settleAction<State extends FormState<unknown>>(
  state: State,
  path: string,
): Promise<State> {
  if (state.status === "signed_out") {
    await clearSession();
    redirect(LOGIN_PATH);
  }
  revalidatePath(path);
  return state;
}
