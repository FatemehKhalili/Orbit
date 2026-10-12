import { describe, expect, it, vi } from "vitest";

import type { LoginResult } from "./auth-api";
import { LOGIN_ERRORS, performLogin, throttledMessage } from "./login";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function deps(result: LoginResult) {
  return {
    login: vi.fn().mockResolvedValue(result),
    startSession: vi.fn().mockResolvedValue(undefined),
    rememberDevice: vi.fn().mockResolvedValue(undefined),
  };
}

const expiresAt = new Date("2026-11-02T06:00:00Z");

describe("performLogin", () => {
  it("stores the session and returns null on success", async () => {
    const d = deps({ ok: true, token: "raw-token", expiresAt });

    const state = await performLogin(form({ email: " owner@example.com ", password: "pw" }), d);

    expect(state).toBeNull();
    expect(d.login).toHaveBeenCalledWith("owner@example.com", "pw");
    expect(d.startSession).toHaveBeenCalledWith("raw-token", expiresAt);
    expect(d.rememberDevice).not.toHaveBeenCalled();
  });

  it("keeps a new device token in the browser", async () => {
    const d = deps({ ok: true, token: "raw-token", expiresAt, deviceToken: "device-1" });

    expect(await performLogin(form({ email: "a@example.com", password: "pw" }), d)).toBeNull();
    expect(d.rememberDevice).toHaveBeenCalledWith("device-1");
  });

  it("says how long to wait after too many attempts, and sets nothing", async () => {
    const d = deps({ ok: false, reason: "throttled", retryAfterSeconds: 900 });

    const state = await performLogin(form({ email: "a@example.com", password: "pw" }), d);

    expect(state).toEqual({
      error: "Too many sign-in attempts. Try again in 15 minutes.",
      email: "a@example.com",
    });
    expect(d.startSession).not.toHaveBeenCalled();
    expect(d.rememberDevice).not.toHaveBeenCalled();
  });

  it("returns an error and sets no session for wrong credentials", async () => {
    const d = deps({ ok: false, reason: "invalid" });

    const state = await performLogin(form({ email: "owner@example.com", password: "nope" }), d);

    expect(state).toEqual({ error: LOGIN_ERRORS.invalid, email: "owner@example.com" });
    expect(d.startSession).not.toHaveBeenCalled();
  });

  it("says when the API is unavailable", async () => {
    const d = deps({ ok: false, reason: "unavailable" });

    const state = await performLogin(form({ email: "a@example.com", password: "pw" }), d);

    expect(state?.error).toBe(LOGIN_ERRORS.unavailable);
  });

  it.each<Record<string, string>>([
    {},
    { email: "a@example.com" },
    { password: "pw" },
    { email: "  ", password: "pw" },
  ])(
    "asks for both fields without calling the API (%j)",
    async (fields) => {
      const d = deps({ ok: true, token: "t", expiresAt });

      const state = await performLogin(form(fields), d);

      expect(state?.error).toBe(LOGIN_ERRORS.missing);
      expect(d.login).not.toHaveBeenCalled();
    },
  );

  it("never echoes the password back to the form", async () => {
    const d = deps({ ok: false, reason: "invalid" });

    const state = await performLogin(form({ email: "a@example.com", password: "secret-pw" }), d);

    expect(JSON.stringify(state)).not.toContain("secret-pw");
  });
});

describe("throttledMessage", () => {
  it.each([
    [1, "1 minute"],
    [30, "1 minute"],
    [60, "1 minute"],
    [61, "2 minutes"],
    [900, "15 minutes"],
  ])("rounds %i seconds up to %s", (seconds, text) => {
    expect(throttledMessage(seconds)).toBe(`Too many sign-in attempts. Try again in ${text}.`);
  });
});
