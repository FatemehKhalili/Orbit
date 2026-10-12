/** The MVP modules, in navigation order. Dashboard and Shopping have content so far. */
export const MODULES = [
  { name: "Dashboard", href: "/" },
  { name: "Finance", href: "/finance" },
  { name: "Calendar", href: "/calendar" },
  { name: "Habits", href: "/habits" },
  { name: "Shopping", href: "/shopping" },
  { name: "Wishlist", href: "/wishlist" },
] as const;

/** Whether a navigation link is the current module, including its sub-pages. */
export function isActiveModule(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export const LOGIN_PATH = "/login";

// Reachable without signing in. Everything else needs a session.
const PUBLIC_PATHS = new Set([LOGIN_PATH, "/api/health"]);

export function isPublicPath(pathname: string): boolean {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return PUBLIC_PATHS.has(normalized);
}

/**
 * The cheap, optimistic check the proxy runs on every request: no session cookie on a
 * protected page means "go to the login page". Whether the cookie is still valid is
 * checked against the API by the signed-in layout.
 */
export function loginRedirectFor(pathname: string, hasSessionCookie: boolean): string | null {
  if (hasSessionCookie || isPublicPath(pathname)) return null;
  return LOGIN_PATH;
}
