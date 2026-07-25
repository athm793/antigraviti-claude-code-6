import { cache } from "react";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, signToken, verifyToken } from "./sessionToken";
import { getUserById } from "./usersDb";
import { getConfig } from "./db";
import { getEndpoint } from "./endpointsDb";
import type { ProxyConfig, User } from "./types";
import type { Endpoint } from "./endpointTypes";

export { SESSION_COOKIE_NAME };

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function setSessionCookie(uid: string): Promise<void> {
  const token = await signToken({ uid, exp: Date.now() + SESSION_DURATION_MS });
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DURATION_MS / 1000,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}

/**
 * Deduped per request: the layout, the page and any route handler in the same
 * request now all need the viewer, and without this each one would cost its
 * own verify + database round trip.
 */
export const getCurrentUser = cache(async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;
  return getUserById(payload.uid);
});

export async function requireAdmin(): Promise<User | null> {
  const user = await getCurrentUser();
  if (!user || !user.is_admin) return null;
  return user;
}

/**
 * Whether a user may read or change a config.
 *
 * Middleware only proves a session is *valid*, never *whose* — so without a
 * check like this, any account holder can read every config's upstream keys
 * and repoint any config at a server they control, which makes the proxy hand
 * them that config's key. Every /api/configs route calls this first.
 *
 * Ownerless configs (pre-migration rows whose owner was deleted) are
 * admin-only rather than open to everyone.
 */
export function canAccessConfig(user: User, config: ProxyConfig): boolean {
  if (user.is_admin) return true;
  return config.owner_user_id !== null && config.owner_user_id === user.id;
}

export type ConfigAuth =
  | { ok: true; user: User; config: ProxyConfig }
  | { ok: false; status: 401 | 403 | 404 };

/**
 * Resolves session, config and permission in one call.
 *
 * A user who may not see a config gets 404, not 403 — a 403 would confirm the
 * id exists, letting someone map out other people's configs by probing.
 */
export async function authorizeConfig(configId: string): Promise<ConfigAuth> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, status: 401 };

  const config = await getConfig(configId);
  if (!config) return { ok: false, status: 404 };
  if (!canAccessConfig(user, config)) return { ok: false, status: 404 };

  return { ok: true, user, config };
}

export type EndpointAuth =
  | { ok: true; user: User; endpoint: Endpoint }
  | { ok: false; status: 401 | 403 | 404 };

/** Same ownership rule as providers, applied to waterfall endpoints. */
export async function authorizeEndpoint(endpointId: string): Promise<EndpointAuth> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, status: 401 };

  const endpoint = await getEndpoint(endpointId);
  if (!endpoint) return { ok: false, status: 404 };

  const owned =
    endpoint.owner_user_id !== null && endpoint.owner_user_id === user.id;
  if (!user.is_admin && !owned) return { ok: false, status: 404 };

  return { ok: true, user, endpoint };
}

/** Turns a failed ConfigAuth into the response body the routes already use. */
export function configAuthResponse(status: 401 | 403 | 404): Response {
  if (status === 401) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  if (status === 403) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return Response.json({ error: "Not found" }, { status: 404 });
}
