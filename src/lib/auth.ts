import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, signToken, verifyToken } from "./sessionToken";
import { getUserById } from "./usersDb";
import type { User } from "./types";

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

export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;
  return getUserById(payload.uid);
}

export async function requireAdmin(): Promise<User | null> {
  const user = await getCurrentUser();
  if (!user || !user.is_admin) return null;
  return user;
}
