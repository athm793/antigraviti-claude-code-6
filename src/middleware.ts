import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifyToken } from "./lib/sessionToken";

// Routes that never require a logged-in session.
// - /login, /setup: the auth pages themselves
// - /api/auth/*: login, logout, setup and "who am I" endpoints
// - /api/proxy/*, /api/debug/*: authenticated separately via per-config master keys
// - /api/run/*: the public waterfall endpoint, authenticated by a hashed endpoint key
// - /api/health: needs to stay reachable by uptime monitors
//
// Every prefix keeps its trailing slash on purpose. Matching is startsWith, so
// "/api/run" without one would also make "/api/runners" public.
const PUBLIC_PREFIXES = [
  "/login",
  "/setup",
  "/api/auth/",
  "/api/proxy/",
  "/api/debug/",
  "/api/run/",
  "/api/health",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifyToken(token) : null;

  if (session) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
