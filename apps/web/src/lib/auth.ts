/** Session helpers for Server Components and Server Actions. */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { fetchCurrentUser, type CurrentUser, type User } from "@/lib/auth-api";
import { LOGIN_PATH } from "@/lib/routes";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

export async function getSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value || undefined;
}

/** Only in Server Actions or Route Handlers: cookies cannot be set while rendering. */
export async function startSession(token: string, expiresAt: Date): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** The signed-in user for this request, asked of the API once per render. */
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const token = await getSessionToken();
  if (!token) return { state: "unauthenticated" };
  return fetchCurrentUser(token);
});

/**
 * The signed-in user, or a redirect to the login page. Returns null when the API cannot
 * be reached, so the caller can say so instead of bouncing to a login that would fail.
 */
export async function requireUser(): Promise<User | null> {
  const current = await getCurrentUser();
  if (current.state === "unauthenticated") redirect(LOGIN_PATH);
  return current.state === "authenticated" ? current.user : null;
}
