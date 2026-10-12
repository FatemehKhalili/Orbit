import { describe, expect, it } from "vitest";

import {
  DEVICE_COOKIE,
  deviceCookieOptions,
  SESSION_COOKIE,
  secureCookiesEnabled,
  sessionCookieOptions,
} from "./session";

const expires = new Date("2026-11-01T00:00:00Z");

describe("sessionCookieOptions", () => {
  it("keeps the token away from browser scripts and cross-site requests", () => {
    expect(sessionCookieOptions(expires, {})).toEqual({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: false,
      expires,
    });
  });

  it("uses the orbit_session cookie name", () => {
    expect(SESSION_COOKIE).toBe("orbit_session");
  });
});

describe("secureCookiesEnabled", () => {
  it("is on in production", () => {
    expect(secureCookiesEnabled({ NODE_ENV: "production" })).toBe(true);
    expect(sessionCookieOptions(expires, { NODE_ENV: "production" }).secure).toBe(true);
  });

  it("is off in development and tests, which run over plain http://localhost", () => {
    expect(secureCookiesEnabled({ NODE_ENV: "development" })).toBe(false);
    expect(secureCookiesEnabled({ NODE_ENV: "test" })).toBe(false);
  });

  it.each(["true", "TRUE", " true "])(
    "can be turned off in production with ORBIT_INSECURE_COOKIES=%j",
    (value) => {
      expect(secureCookiesEnabled({ NODE_ENV: "production", ORBIT_INSECURE_COOKIES: value })).toBe(
        false,
      );
    },
  );

  it.each(["", "false", "1", "yes"])("stays on for ORBIT_INSECURE_COOKIES=%j", (value) => {
    expect(secureCookiesEnabled({ NODE_ENV: "production", ORBIT_INSECURE_COOKIES: value })).toBe(
      true,
    );
  });
});

describe("deviceCookieOptions", () => {
  it("keeps the device token from scripts for a year, Secure like the session", () => {
    expect(DEVICE_COOKIE).toBe("orbit_device");
    expect(deviceCookieOptions({})).toEqual({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: false,
      maxAge: 365 * 24 * 60 * 60,
    });
    expect(deviceCookieOptions({ NODE_ENV: "production" }).secure).toBe(true);
    expect(
      deviceCookieOptions({ NODE_ENV: "production", ORBIT_INSECURE_COOKIES: "true" }).secure,
    ).toBe(false);
  });
});
