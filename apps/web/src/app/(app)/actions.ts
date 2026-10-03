"use server";

import { redirect } from "next/navigation";

import { clearSession, getSessionToken } from "@/lib/auth";
import { logoutWithApi } from "@/lib/auth-api";
import { LOGIN_PATH } from "@/lib/routes";

export async function logout(): Promise<void> {
  const token = await getSessionToken();
  // Revoke the session on the API first; clear the cookie even if the API is down.
  if (token) await logoutWithApi(token);
  await clearSession();
  redirect(LOGIN_PATH);
}
