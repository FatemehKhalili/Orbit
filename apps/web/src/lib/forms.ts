/**
 * Form helpers shared by every module's Server Action forms, without Next.js: the state a
 * form shows, reading fields, counting text the way the API does, and turning an API
 * failure into that state. Module logic (lib/shopping.ts, lib/habits.ts) builds on these.
 */

import type { ApiError } from "@/lib/api-client";

export type FormState<Fields = Record<string, string>> =
  | { status: "idle" }
  | { status: "success"; message?: string }
  | { status: "error"; error: string; fields?: Fields }
  /** The session is gone: the caller clears the cookie and sends the user to sign in. */
  | { status: "signed_out" };

export const IDLE = { status: "idle" } as const satisfies FormState;

export const SIGNED_OUT = { status: "signed_out" } as const satisfies FormState;

/** A form field as trimmed text; missing or non-text fields read as "". */
export function formText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The length the API checks: Unicode code points, as Python's len() counts them. String
 * `length` counts UTF-16 units, so an emoji would count twice.
 */
export function textLength(value: string): number {
  return [...value].length;
}

/** What to tell the user for each API failure other than a lost session. */
export type ApiErrorMessages = Record<Exclude<ApiError, "unauthenticated">, string>;

/** The form state for a failed API call: signed out, or the module's message. */
export function failedState<Fields>(
  error: ApiError,
  messages: ApiErrorMessages,
  fields?: Fields,
): FormState<Fields> {
  if (error === "unauthenticated") return SIGNED_OUT;
  return { status: "error", error: messages[error], fields };
}
