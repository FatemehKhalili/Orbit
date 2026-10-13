import { describe, expect, it, vi } from "vitest";

import { getTime } from "./time-api";

const env = { ORBIT_API_URL: "http://api:8000" };

describe("time API call", () => {
  it("reads the instance's timezone and today's date", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ timezone: "Europe/Berlin", today: "2026-10-11" }), {
          status: 200,
        }),
      );

    expect(await getTime("tok", { env, fetchImpl })).toEqual({
      ok: true,
      data: { timezone: "Europe/Berlin", today: "2026-10-11" },
    });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://api:8000/time");
    expect(init?.method ?? "GET").toBe("GET");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });
});
