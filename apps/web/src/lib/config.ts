/**
 * Server-side configuration. ORBIT_API_URL is read at request time (not inlined at
 * build time like NEXT_PUBLIC_* variables), so one built image can point at any API.
 */

export class ConfigError extends Error {
  name = "ConfigError";
}

type Env = Record<string, string | undefined>;

export function getApiBaseUrl(env: Env = process.env): string {
  const raw = env.ORBIT_API_URL?.trim();
  if (!raw) {
    throw new ConfigError("ORBIT_API_URL is not set");
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigError("ORBIT_API_URL is not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ConfigError("ORBIT_API_URL must use http or https");
  }

  return raw.replace(/\/+$/, "");
}
