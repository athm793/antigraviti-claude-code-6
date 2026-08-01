import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { SESSION_COOKIE_NAME, verifyToken } from "./lib/sessionToken";

// Routes that never require a logged-in session.
// - /login, /setup: the auth pages themselves
// - /api/auth/*: login, logout, setup and "who am I" endpoints
// - /api/proxy/*, /api/debug/*: authenticated separately via per-config master keys
// - /api/run/*: the public waterfall endpoint, authenticated by a hashed endpoint key
// - /api/cron/*: called by the platform scheduler, which has no session; gated
//   fail-closed on CRON_SECRET inside the handler
// - /docs/*: static product documentation. Public on purpose — the LLM
//   workflow depends on pasting /docs/llm.txt into outside tools, and there
//   is nothing account-specific in it. (The brain files stay gated.)
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
  "/api/cron/",
  "/docs/",
  "/api/health",
];

// Public paths matched in full rather than by prefix.
// - /icon: the generated favicon. Gating it means a logged-out browser asks
//   for the icon, is redirected to /login and gets HTML instead of a PNG, so
//   the login page renders with no icon. Nothing in it is account-specific.
//   It goes here, not in PUBLIC_PREFIXES, because a "/icon" prefix would also
//   open anything else beginning with those five characters.
const PUBLIC_EXACT = new Set(["/icon"]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

// Static content that only the middleware protects. Pages and API routes all
// re-resolve the viewer from the database themselves (getCurrentUser /
// authorize*), so deleting a user locks them out of those immediately even
// though their token stays cryptographically valid for up to 7 days. Static
// files have no such second check — for these prefixes the middleware itself
// confirms the user still exists before serving.
const GATED_STATIC_PREFIXES = ["/brain/"];

/**
 * Does this uid still exist? Direct one-column query rather than usersDb —
 * that module pulls in password hashing (node crypto), which the edge runtime
 * can't load. Fails closed: any error means "no".
 */
async function userStillExists(uid: string): Promise<boolean> {
  const url = process.env.DATABASE_URL;
  if (!url) return false;
  try {
    const sql = neon(url);
    const rows = await sql`SELECT 1 FROM users WHERE id = ${uid}`;
    return rows.length > 0;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifyToken(token) : null;

  if (session) {
    // Gated statics get the database check here; everything else does its own.
    const gatedStatic = GATED_STATIC_PREFIXES.some((p) => pathname.startsWith(p));
    if (!gatedStatic || (await userStillExists(session.uid))) {
      return NextResponse.next();
    }
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
