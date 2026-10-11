import type { LoginResult } from "@/lib/auth-api";

export type LoginState = { error?: string; email?: string };

type Dependencies = {
  login: (email: string, password: string) => Promise<LoginResult>;
  startSession: (token: string, expiresAt: Date) => Promise<void>;
  /** Keeps a new device token in the browser, so its sign-ins are throttled on their own. */
  rememberDevice: (deviceToken: string) => Promise<void>;
};

export const LOGIN_ERRORS = {
  missing: "Enter your email and password.",
  invalid: "Invalid email or password.",
  unavailable: "Orbit could not reach its server. Try again in a moment.",
} as const;

/** The message for a sign-in refused after too many failed attempts (ADR 0010). */
export function throttledMessage(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `Too many sign-in attempts. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
}

/**
 * The login form's logic, without Next.js: validates the form, asks the API, and stores
 * the session on success. Returns null on success (the caller redirects), or the state
 * to show on the form. The password is never echoed back.
 */
export async function performLogin(
  formData: FormData,
  { login, startSession, rememberDevice }: Dependencies,
): Promise<LoginState | null> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: LOGIN_ERRORS.missing, email };

  const result = await login(email, password);
  if (!result.ok) {
    const error =
      result.reason === "throttled"
        ? throttledMessage(result.retryAfterSeconds)
        : LOGIN_ERRORS[result.reason];
    return { error, email };
  }

  await startSession(result.token, result.expiresAt);
  if (result.deviceToken) await rememberDevice(result.deviceToken);
  return null;
}
