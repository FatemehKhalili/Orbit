import { NextResponse, type NextRequest } from "next/server";

import { loginRedirectFor } from "@/lib/routes";
import { SESSION_COOKIE } from "@/lib/session";

// Optimistic check only: sends visitors without a session cookie to the login page.
// The signed-in layout verifies the session with the API on every request.
export function proxy(request: NextRequest) {
  const target = loginRedirectFor(request.nextUrl.pathname, request.cookies.has(SESSION_COOKIE));
  if (target === null) return NextResponse.next();
  return NextResponse.redirect(new URL(target, request.url));
}

export const config = {
  // Skip Next.js internals and static files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
