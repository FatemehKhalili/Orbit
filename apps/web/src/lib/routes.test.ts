import { describe, expect, it } from "vitest";

import { MODULES, isPublicPath, loginRedirectFor } from "./routes";

describe("isPublicPath", () => {
  it.each(["/login", "/login/", "/api/health"])("%s is public", (path) => {
    expect(isPublicPath(path)).toBe(true);
  });

  it.each(["/", "/finance", "/login/extra", "/api/other", "/loginx"])("%s is protected", (path) => {
    expect(isPublicPath(path)).toBe(false);
  });
});

describe("loginRedirectFor", () => {
  it("sends visitors without a session cookie to the login page", () => {
    expect(loginRedirectFor("/", false)).toBe("/login");
    expect(loginRedirectFor("/shopping", false)).toBe("/login");
  });

  it("lets requests with a session cookie through for the layout to verify", () => {
    expect(loginRedirectFor("/", true)).toBeNull();
  });

  it("never redirects public paths, so the login page cannot loop", () => {
    expect(loginRedirectFor("/login", false)).toBeNull();
    expect(loginRedirectFor("/login", true)).toBeNull();
    expect(loginRedirectFor("/api/health", false)).toBeNull();
  });
});

describe("MODULES", () => {
  it("lists the six MVP modules with the dashboard at /", () => {
    expect(MODULES.map((module) => module.name)).toEqual([
      "Dashboard",
      "Finance",
      "Calendar",
      "Habits",
      "Shopping",
      "Wishlist",
    ]);
    expect(MODULES[0].href).toBe("/");
  });
});
