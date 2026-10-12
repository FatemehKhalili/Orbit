import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";
import { SECURITY_HEADERS } from "./security-headers";

describe("security headers", () => {
  it("are sent on every path", async () => {
    expect(await nextConfig.headers?.()).toEqual([
      { source: "/:path*", headers: SECURITY_HEADERS },
    ]);
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("forbid framing and content sniffing", () => {
    const headers = Object.fromEntries(SECURITY_HEADERS.map(({ key, value }) => [key, value]));
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Content-Security-Policy"]).toBe("frame-ancestors 'none'");
    expect(headers["Referrer-Policy"]).toBe("same-origin");
  });
});
