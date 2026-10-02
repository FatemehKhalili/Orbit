import { describe, expect, it, vi } from "vitest";

import { checkApiHealth } from "./api-health";

const env = { ORBIT_API_URL: "http://api:8000/" };

function respondWith(status: number) {
  return vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status }));
}

describe("checkApiHealth", () => {
  it("calls the API readiness endpoint", async () => {
    const fetchImpl = respondWith(200);

    await checkApiHealth({ env, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://api:8000/health/ready",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("reports online when the API and database are healthy", async () => {
    expect(await checkApiHealth({ env, fetchImpl: respondWith(200) })).toEqual({
      state: "online",
    });
  });

  it("reports degraded when the API says the database is unavailable", async () => {
    expect(await checkApiHealth({ env, fetchImpl: respondWith(503) })).toEqual({
      state: "degraded",
    });
  });

  it("reports offline when the API cannot be reached", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));

    expect(await checkApiHealth({ env, fetchImpl })).toEqual({ state: "offline" });
  });

  it("reports unconfigured without calling fetch when ORBIT_API_URL is missing", async () => {
    const fetchImpl = respondWith(200);

    const health = await checkApiHealth({ env: {}, fetchImpl });

    expect(health).toEqual({ state: "unconfigured", reason: "ORBIT_API_URL is not set" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
