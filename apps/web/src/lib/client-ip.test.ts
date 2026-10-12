import { describe, expect, it } from "vitest";

import { clientIpFrom, trustProxy } from "./client-ip";

const headers = (value: string | null) => ({ get: () => value });
const trusted = { ORBIT_TRUSTED_PROXY: "true" };

describe("clientIpFrom", () => {
  it("ignores X-Forwarded-For unless a trusted proxy is configured", () => {
    expect(trustProxy({})).toBe(false);
    expect(clientIpFrom(headers("203.0.113.7"), {})).toBeUndefined();
    expect(clientIpFrom(headers("203.0.113.7"), { ORBIT_TRUSTED_PROXY: "false" })).toBeUndefined();
  });

  it("takes the address the proxy added: the last one", () => {
    expect(clientIpFrom(headers("198.51.100.1, 203.0.113.7"), trusted)).toBe("203.0.113.7");
    expect(clientIpFrom(headers(" 2001:db8::1 "), { ORBIT_TRUSTED_PROXY: " TRUE " })).toBe(
      "2001:db8::1",
    );
  });

  it("refuses anything that is not an IP address", () => {
    expect(clientIpFrom(headers(null), trusted)).toBeUndefined();
    expect(clientIpFrom(headers(""), trusted)).toBeUndefined();
    expect(clientIpFrom(headers("203.0.113.7, evil"), trusted)).toBeUndefined();
    expect(clientIpFrom(headers("unknown"), trusted)).toBeUndefined();
  });
});
