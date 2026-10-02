import { describe, expect, it } from "vitest";

import { ConfigError, getApiBaseUrl } from "./config";

describe("getApiBaseUrl", () => {
  it("returns the configured URL", () => {
    expect(getApiBaseUrl({ ORBIT_API_URL: "http://api:8000" })).toBe("http://api:8000");
  });

  it("strips trailing slashes so paths can be appended", () => {
    expect(getApiBaseUrl({ ORBIT_API_URL: "https://api.example.com//" })).toBe(
      "https://api.example.com",
    );
  });

  it.each([undefined, "", "   "])("throws when ORBIT_API_URL is %j", (value) => {
    expect(() => getApiBaseUrl({ ORBIT_API_URL: value })).toThrow(ConfigError);
  });

  it("rejects values that are not URLs", () => {
    expect(() => getApiBaseUrl({ ORBIT_API_URL: "api:8000/oops" })).toThrow(ConfigError);
  });

  it("rejects non-http protocols", () => {
    expect(() => getApiBaseUrl({ ORBIT_API_URL: "ftp://api" })).toThrow(/http or https/);
  });
});
