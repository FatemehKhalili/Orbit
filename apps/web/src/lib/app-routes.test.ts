import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const APP_DIR = fileURLToPath(new URL("../app", import.meta.url));

function routeHandlers(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return routeHandlers(path);
    return /^route\.(ts|tsx|js)$/.test(entry.name) ? [path] : [];
  });
}

describe("route handlers", () => {
  // State-changing requests that rely on the session cookie must go through Server
  // Actions, which Next.js checks against cross-site requests (Origin vs Host). A custom
  // POST/PUT/PATCH/DELETE handler would need its own CSRF protection.
  it("only handle GET", () => {
    const handlers = routeHandlers(APP_DIR);
    expect(handlers.length).toBeGreaterThan(0);

    for (const file of handlers) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/export\s+(async\s+)?function\s+(POST|PUT|PATCH|DELETE)\b/);
      expect(source, file).not.toMatch(/export\s+const\s+(POST|PUT|PATCH|DELETE)\b/);
    }
  });
});
