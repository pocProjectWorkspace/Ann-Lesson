import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import type { Role, User } from "@prisma/client";
import { db } from "./db";

export const SESSION_COOKIE = "lp_session";
const WEB_TTL_SECONDS = 60 * 60 * 12; // 12 hours
const MOBILE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days; revocable server-side
const TOUCH_INTERVAL_MS = 5 * 60_000;

export type Session = {
  sid: string; // row id in the Session table
  userId: string;
  role: Role;
  schoolId: string | null;
  name: string;
};

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET must be set to at least 32 characters");
  return new TextEncoder().encode(s);
}

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 10);
}
export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

/* ---------------- Token helpers ---------------- */

async function sign(payload: Record<string, unknown>, ttlSeconds: number) {
  return new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${ttlSeconds}s`).sign(secret());
}

function toSession(payload: Record<string, unknown>): Session | null {
  if (!payload.sid || !payload.userId || !payload.role) return null;
  return {
    sid: String(payload.sid),
    userId: String(payload.userId),
    role: payload.role as Role,
    schoolId: (payload.schoolId as string | null) ?? null,
    name: String(payload.name ?? ""),
  };
}

/** Parse and verify the signature only. Does not consult the database. */
export async function readSessionToken(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.purpose) return null; // special-purpose tokens are not sessions
    return toSession(payload as Record<string, unknown>);
  } catch {
    return null;
  }
}

/**
 * Confirm the session row is live and the account is still allowed in.
 * This is what makes deactivation and sign-out take effect immediately.
 */
export async function validateSession(session: Session): Promise<boolean> {
  const row = await db.session.findUnique({
    where: { id: session.sid },
    select: { revokedAt: true, expiresAt: true, lastSeenAt: true, userId: true, user: { select: { isActive: true, school: { select: { isActive: true } } } } },
  });
  if (!row || row.revokedAt || row.expiresAt < new Date() || row.userId !== session.userId) return false;
  if (!row.user.isActive || (row.user.school && !row.user.school.isActive)) return false;
  if (Date.now() - row.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    db.session.update({ where: { id: session.sid }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  return true;
}

/* ---------------- Creating sessions ---------------- */

type SessionUser = Pick<User, "id" | "role" | "schoolId" | "name">;

async function openSession(user: SessionUser, kind: "web" | "mobile", ttlSeconds: number) {
  let userAgent: string | null = null;
  try {
    userAgent = (await headers()).get("user-agent")?.slice(0, 200) ?? null;
  } catch {
    /* not in a request scope */
  }
  const row = await db.session.create({ data: { userId: user.id, kind, userAgent, expiresAt: new Date(Date.now() + ttlSeconds * 1000) } });
  const session: Session = { sid: row.id, userId: user.id, role: user.role, schoolId: user.schoolId, name: user.name };
  const token = await sign(session, ttlSeconds);
  return { session, token };
}

async function setCookie(token: string, ttlSeconds: number) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: ttlSeconds });
}

/** Web sign-in: new session row plus HttpOnly cookie. */
export async function createWebSession(user: SessionUser) {
  const { token, session } = await openSession(user, "web", WEB_TTL_SECONDS);
  await setCookie(token, WEB_TTL_SECONDS);
  return session;
}

/** Mobile sign-in: new session row, token returned to the app, no cookie. */
export async function createMobileSession(user: SessionUser) {
  return openSession(user, "mobile", MOBILE_TTL_SECONDS);
}

/** Sign out: revoke the row and clear the cookie. */
export async function destroySession() {
  const jar = await cookies();
  const s = await readSessionToken(jar.get(SESSION_COOKIE)?.value);
  if (s) await revokeSession(s.sid);
  jar.delete(SESSION_COOKIE);
}

export async function revokeSession(sid: string) {
  await db.session.updateMany({ where: { id: sid, revokedAt: null }, data: { revokedAt: new Date() } });
}
export async function revokeUserSessions(userId: string, exceptSid?: string) {
  await db.session.updateMany({ where: { userId, revokedAt: null, ...(exceptSid ? { NOT: { id: exceptSid } } : {}) }, data: { revokedAt: new Date() } });
}
export async function revokeSchoolSessions(schoolId: string) {
  await db.session.updateMany({ where: { revokedAt: null, user: { schoolId } }, data: { revokedAt: new Date() } });
}

/* ---------------- Reading sessions ---------------- */

/** Validated session from the cookie, or null. */
export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const s = await readSessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!s) return null;
  return (await validateSession(s)) ? s : null;
}

/** Read a short-lived web-view hand-off token (purpose "webview") into a validated session. */
export async function readWebviewSession(token: string | null | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.purpose !== "webview") return null;
    const s = toSession(payload as Record<string, unknown>);
    return s && (await validateSession(s)) ? s : null;
  } catch {
    return null;
  }
}

/**
 * Validated session from "Authorization: Bearer" (mobile), a "?t=" web-view
 * hand-off token (embedded viewer inside the app, no cookies needed), or the cookie.
 */
export async function getSessionFromRequest(req: Request): Promise<Session | null> {
  const header = req.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    const s = await readSessionToken(header.slice(7).trim());
    return s && (await validateSession(s)) ? s : null;
  }
  const t = new URL(req.url).searchParams.get("t");
  if (t) {
    const s = await readWebviewSession(t);
    if (s) return s;
  }
  return getSession();
}

export const homeFor: Record<Role, string> = {
  SUPER_ADMIN: "/admin",
  SCHOOL_ADMIN: "/school",
  TEACHER: "/teacher",
  STUDENT: "/student",
};

export const ALL_ROLES: Role[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER", "STUDENT"];

/** Require a logged-in user with one of the given roles; redirects otherwise. */
export async function requireRole(...roles: Role[]): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login?error=signed-out");
  if (!roles.includes(session.role)) redirect(homeFor[session.role]);
  return session;
}

/** Session for a school-scoped role, with a non-null schoolId. */
export async function requireSchoolRole(...roles: Role[]) {
  const session = await requireRole(...roles);
  if (!session.schoolId) redirect("/login");
  return session as Session & { schoolId: string };
}

/* ---------------- Web-view hand-off (mobile app → embedded viewer) ---------------- */

/** Short-lived token that lets the mobile app's web view obtain the session cookie. */
export async function signWebviewToken(session: Session) {
  return sign({ ...session, purpose: "webview" }, 600);
}

/** Validates the hand-off token and sets a cookie for the same session row. */
export async function exchangeWebviewToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.purpose !== "webview") return null;
    const s = toSession(payload as Record<string, unknown>);
    if (!s || !(await validateSession(s))) return null;
    await setCookie(await sign(s, WEB_TTL_SECONDS), WEB_TTL_SECONDS);
    return s;
  } catch {
    return null;
  }
}
