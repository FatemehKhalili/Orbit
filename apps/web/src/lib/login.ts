import type { LoginResult } from "@/lib/auth-api";

export type LoginState = { error?: string; email?: string };

type Dependencies = {
  login: (email: string, password: string) => Promise<LoginResult>;
  startSession: (token: string, expiresAt: Date) => Promise<void>;
};

export const LOGIN_ERRORS = {
  missing: "Enter your email and password.",
  invalid: "Invalid email or password.",
  unavailable: "Orbit could not reach its server. Try again in a moment.",
} as const;

/**
 * The login form's logic, without Next.js: validates the form, asks the API, and stores
 * the session on success. Returns null on success (the caller redirects), or the state
 * to show on the form. The password is never echoed back.
 */
export async function performLogin(
  formData: FormData,
  { login, startSession }: Dependencies,
): Promise<LoginState | null> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: LOGIN_ERRORS.missing, email };

  const result = await login(email, password);
  if (!result.ok) return { error: LOGIN_ERRORS[result.reason], email };

  await startSession(result.token, result.expiresAt);
  return null;
}
