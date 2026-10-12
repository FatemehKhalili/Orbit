/**
 * The API's /time endpoint: the instance timezone and the date that counts as today in it
 * (ADR 0008). Every module that shows days asks here, never the web server's clock.
 * Server-side only (ADR 0002).
 */

import { apiRequest, type ApiOptions, type ApiResult } from "@/lib/api-client";

/** A calendar date as the API sends it, "2026-10-11" (ADR 0008). */
export type Day = string;

/** The instance timezone and the date that counts as today in it. */
export type OrbitTime = { timezone: string; today: Day };

export async function getTime(
  token: string,
  options: ApiOptions = {},
): Promise<ApiResult<OrbitTime>> {
  return apiRequest<OrbitTime>("/time", { token }, options);
}
