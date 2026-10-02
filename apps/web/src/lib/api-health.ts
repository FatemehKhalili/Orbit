import { ConfigError, getApiBaseUrl } from "@/lib/config";

export type ApiHealth =
  | { state: "online" } // API up, database reachable
  | { state: "degraded" } // API up, database unreachable
  | { state: "offline" } // API did not answer
  | { state: "unconfigured"; reason: string };

type Options = {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export async function checkApiHealth({
  env = process.env,
  fetchImpl = fetch,
  timeoutMs = 3000,
}: Options = {}): Promise<ApiHealth> {
  let baseUrl: string;
  try {
    baseUrl = getApiBaseUrl(env);
  } catch (error) {
    if (error instanceof ConfigError) {
      return { state: "unconfigured", reason: error.message };
    }
    throw error;
  }

  try {
    const response = await fetchImpl(`${baseUrl}/health/ready`, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.ok) return { state: "online" };
    if (response.status === 503) return { state: "degraded" };
    return { state: "offline" };
  } catch {
    return { state: "offline" };
  }
}
