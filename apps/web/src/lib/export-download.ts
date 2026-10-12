/**
 * "Download my data": the owner's export from the API, passed through as a file
 * (ADR 0009). Server-side only; the session token never reaches the browser.
 */

import { apiFetch, type ApiOptions } from "@/lib/api-client";

export const EXPORT_UNAVAILABLE = "Orbit could not export your data right now. Try again in a moment.";

/** The response to send the browser, or "unauthenticated" to send it to the login page. */
export async function exportDownload(
  token: string,
  options: ApiOptions = {},
): Promise<Response | "unauthenticated"> {
  // A large history takes longer to gather than an ordinary page's data.
  const response = await apiFetch(
    "/account/export",
    { method: "GET", token },
    { timeoutMs: 30_000, ...options },
  );
  if (response?.status === 401) return "unauthenticated";
  if (!response?.ok) {
    return new Response(EXPORT_UNAVAILABLE, {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  return new Response(response.body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition":
        response.headers.get("Content-Disposition") ?? 'attachment; filename="orbit-export.json"',
      "Cache-Control": "no-store",
    },
  });
}
