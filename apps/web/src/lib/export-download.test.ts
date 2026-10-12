import { describe, expect, it, vi } from "vitest";

import { EXPORT_UNAVAILABLE, exportDownload } from "./export-download";

const env = { ORBIT_API_URL: "http://api:8000" };

describe("exportDownload", () => {
  it("passes the API's export through as an uncached file", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('{"format":"orbit-export"}', {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": 'attachment; filename="orbit-export-2026-10-11.json"',
        },
      }),
    );

    const response = await exportDownload("raw-token", { env, fetchImpl });

    if (response === "unauthenticated") throw new Error("expected a response");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="orbit-export-2026-10-11.json"',
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe('{"format":"orbit-export"}');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://api:8000/account/export");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer raw-token");
  });

  it("sends an expired session to the login page", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 401 }));
    expect(await exportDownload("old", { env, fetchImpl })).toBe("unauthenticated");
  });

  it("says so, without the API's body, when the export fails", async () => {
    for (const fetchImpl of [
      vi.fn<typeof fetch>().mockResolvedValue(new Response("boom", { status: 500 })),
      vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed")),
    ]) {
      const response = await exportDownload("raw-token", { env, fetchImpl });
      if (response === "unauthenticated") throw new Error("expected a response");
      expect(response.status).toBe(503);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await response.text()).toBe(EXPORT_UNAVAILABLE);
    }
  });
});
