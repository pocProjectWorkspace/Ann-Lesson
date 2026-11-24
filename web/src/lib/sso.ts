import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";
import type { Role, School, User } from "@prisma/client";
import { db } from "./db";
import { hashPassword } from "./auth";

/**
 * Single sign-on for schools.
 *
 * The platform owner sets a school's sign-in method: FORM, MICROSOFT or GOOGLE. For an
 * SSO school, staff sign in through the provider with OpenID Connect (authorization code
 * flow with PKCE); students keep student ID + password unless `ssoStudents` is on.
 * Users are matched by provider subject, then by email within the school, and teachers
 * are created on first sign-in when `ssoAutoProvision` is on. Roles come from the
 * school's group lists. Nothing here touches the platform owner login.
 */

export type AuthMode = "FORM" | "MICROSOFT" | "GOOGLE";
export const AUTH_MODES: AuthMode[] = ["FORM", "MICROSOFT", "GOOGLE"];
export const isAuthMode = (v: unknown): v is AuthMode => AUTH_MODES.includes(v as AuthMode);

export const providerLabel: Record<AuthMode, string> = { FORM: "School code and password", MICROSOFT: "Microsoft", GOOGLE: "Google" };

type SsoSchool = Pick<School, "id" | "code" | "name" | "authMode" | "ssoTenant" | "ssoClientId" | "ssoClientSecret" | "ssoAdminGroups" | "ssoTeacherGroups" | "ssoAutoProvision" | "ssoStudents">;

/* ---------------- Secret storage ---------------- */

function key() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET must be set to at least 32 characters");
  return createHash("sha256").update(`sso:${s}`).digest();
}

/** AES-256-GCM, keyed from AUTH_SECRET. Stored as base64 iv.tag.ciphertext. */
export function encryptSecret(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(stored: string) {
  const [iv, tag, enc] = stored.split(".").map((p) => Buffer.from(p, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

/* ---------------- Provider endpoints ---------------- */

type Discovery = { issuer: string; authorization_endpoint: string; token_endpoint: string; jwks_uri: string };
const discoveryCache = new Map<string, { at: number; doc: Discovery }>();

export function discoveryUrl(school: Pick<SsoSchool, "authMode" | "ssoTenant">) {
  if (school.authMode === "MICROSOFT") return `https://login.microsoftonline.com/${encodeURIComponent(school.ssoTenant ?? "")}/v2.0/.well-known/openid-configuration`;
  if (school.authMode === "GOOGLE") return "https://accounts.google.com/.well-known/openid-configuration";
  throw new Error("School does not use single sign-on");
}

export async function discover(school: Pick<SsoSchool, "authMode" | "ssoTenant">): Promise<Discovery> {
  const url = discoveryUrl(school);
  const hit = discoveryCache.get(url);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.doc;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Provider discovery failed (${res.status})`);
  const doc = (await res.json()) as Discovery;
  discoveryCache.set(url, { at: Date.now(), doc });
  return doc;
}

/** True when the school has everything needed to start a sign-in. */
export function ssoConfigured(school: Pick<SsoSchool, "authMode" | "ssoTenant" | "ssoClientId" | "ssoClientSecret">) {
  return school.authMode !== "FORM" && !!school.ssoTenant && !!school.ssoClientId && !!school.ssoClientSecret;
}

/* ---------------- Flow state (PKCE, nonce, where to go after) ---------------- */

export type FlowState = { school: string; state: string; nonce: string; verifier: string; next: string; client: "web" | "mobile"; redirect?: string; test: boolean };
export const SSO_COOKIE = "lp_sso";
const FLOW_TTL_SECONDS = 600;

export function newFlow(input: Pick<FlowState, "school" | "next" | "client" | "redirect" | "test">): FlowState {
  return { ...input, state: randomBytes(16).toString("base64url"), nonce: randomBytes(16).toString("base64url"), verifier: randomBytes(32).toString("base64url") };
}
export const codeChallenge = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

const flowSecret = () => new TextEncoder().encode(`${process.env.AUTH_SECRET}:sso-flow`);
export async function signFlow(flow: FlowState) {
  return new SignJWT(flow as unknown as Record<string, unknown>).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${FLOW_TTL_SECONDS}s`).sign(flowSecret());
}
export async function readFlow(token: string | undefined): Promise<FlowState | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, flowSecret());
    return payload as unknown as FlowState;
  } catch {
    return null;
  }
}
export const flowCookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: FLOW_TTL_SECONDS };

/** The provider's authorization URL for this school and flow. */
export async function authorizationUrl(school: SsoSchool, flow: FlowState, redirectUri: string) {
  const doc = await discover(school);
  const u = new URL(doc.authorization_endpoint);
  u.searchParams.set("client_id", school.ssoClientId ?? "");
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("scope", "openid profile email");
  u.searchParams.set("state", flow.state);
  u.searchParams.set("nonce", flow.nonce);
  u.searchParams.set("code_challenge", codeChallenge(flow.verifier));
  u.searchParams.set("code_challenge_method", "S256");
  if (school.authMode === "GOOGLE" && school.ssoTenant) u.searchParams.set("hd", school.ssoTenant);
  if (school.authMode === "MICROSOFT") u.searchParams.set("prompt", "select_account");
  return u.toString();
}

/* ---------------- Token exchange and verification ---------------- */

export type Claims = { sub: string; email?: string; email_verified?: boolean; name?: string; preferred_username?: string; groups?: string[]; hd?: string; tid?: string };

export async function exchangeCode(school: SsoSchool, flow: FlowState, code: string, redirectUri: string): Promise<Claims> {
  const doc = await discover(school);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: school.ssoClientId ?? "",
    client_secret: decryptSecret(school.ssoClientSecret ?? ""),
    code_verifier: flow.verifier,
  });
  const res = await fetch(doc.token_endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, cache: "no-store" });
  const tok = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string; error_description?: string };
  if (!res.ok || !tok.id_token) throw new Error(tok.error_description || tok.error || `Token exchange failed (${res.status})`);

  const jwks = createRemoteJWKSet(new URL(doc.jwks_uri));
  const { payload } = await jwtVerify(tok.id_token, jwks, { audience: school.ssoClientId ?? "" });
  const claims = payload as unknown as Claims & { iss: string; nonce?: string };
  if (claims.nonce !== flow.nonce) throw new Error("Sign-in response did not match this browser (nonce)");

  if (school.authMode === "MICROSOFT") {
    const tenant = (school.ssoTenant ?? "").toLowerCase();
    if (claims.tid?.toLowerCase() !== tenant || !claims.iss.toLowerCase().includes(tenant)) throw new Error("This Microsoft account belongs to a different organisation");
  } else if (school.authMode === "GOOGLE") {
    if (claims.iss !== "https://accounts.google.com" && claims.iss !== "accounts.google.com") throw new Error("Unexpected token issuer");
    if ((claims.hd ?? "").toLowerCase() !== (school.ssoTenant ?? "").toLowerCase()) throw new Error(`Use a ${school.ssoTenant} Google account`);
  }
  if (!claims.sub) throw new Error("The provider did not return a user id");
  return claims;
}

/* ---------------- Mapping claims to a person in the school ---------------- */

export const parseList = (s: string | null | undefined) =>
  (s ?? "")
    .split(/[,\n;]/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

/** Which role the school's rules give these claims; null = not allowed in. */
export function roleFor(school: Pick<SsoSchool, "ssoAdminGroups" | "ssoTeacherGroups" | "ssoAutoProvision">, claims: Claims): Exclude<Role, "SUPER_ADMIN" | "STUDENT"> | null {
  const mine = new Set([...(claims.groups ?? []).map((g) => g.toLowerCase()), (claims.email ?? "").toLowerCase(), (claims.preferred_username ?? "").toLowerCase()].filter(Boolean));
  const admins = parseList(school.ssoAdminGroups);
  const teachers = parseList(school.ssoTeacherGroups);
  if (admins.some((a) => mine.has(a))) return "SCHOOL_ADMIN";
  if (teachers.length === 0) return school.ssoAutoProvision ? "TEACHER" : null;
  if (teachers.some((t) => mine.has(t))) return "TEACHER";
  return null;
}

export type Resolution = { user: User; created: boolean; linked: boolean } | { error: string };

/** Find, link or create the user these claims belong to. */
export async function resolveUser(school: SsoSchool, claims: Claims): Promise<Resolution> {
  const email = claims.email?.toLowerCase() || claims.preferred_username?.toLowerCase() || null;
  const provider = school.authMode;

  // 1. Already linked to this provider subject.
  const linked = await db.user.findFirst({ where: { schoolId: school.id, authProvider: provider, externalId: claims.sub } });
  if (linked) {
    if (!linked.isActive) return { error: "Your account is inactive. Contact your school admin." };
    return { user: linked, created: false, linked: false };
  }

  // 2. An existing person with the same email in this school: link them.
  if (email) {
    const byEmail = await db.user.findFirst({ where: { schoolId: school.id, email: { equals: email, mode: "insensitive" } } });
    if (byEmail) {
      if (!byEmail.isActive) return { error: "Your account is inactive. Contact your school admin." };
      if (byEmail.role === "STUDENT" && !school.ssoStudents) return { error: "Students sign in with their student ID and password." };
      const user = await db.user.update({ where: { id: byEmail.id }, data: { authProvider: provider, externalId: claims.sub } });
      return { user, created: false, linked: true };
    }
  }

  // 3. Unknown person: create a teacher or admin if the school's rules allow it.
  const role = roleFor(school, claims);
  if (!role) return { error: `Your ${providerLabel[provider as AuthMode]} account is not set up for ${school.name}. Ask your school admin to add you.` };
  if (!email) return { error: "The provider did not share an email address, which is needed to create your account." };
  const base = email.split("@")[0].replace(/[^a-z0-9._-]/g, "").slice(0, 60) || "user";
  let username = base;
  for (let i = 2; await db.user.findFirst({ where: { schoolId: school.id, username }, select: { id: true } }); i++) username = `${base}${i}`;
  const user = await db.user.create({
    data: {
      schoolId: school.id,
      role,
      name: claims.name?.trim() || email,
      username,
      email,
      // Local password is unusable; this person signs in through the provider.
      passwordHash: await hashPassword(randomBytes(32).toString("base64url")),
      authProvider: provider,
      externalId: claims.sub,
    },
  });
  return { user, created: true, linked: false };
}

/** Form login rule for SSO schools: staff must use the provider, except the break-glass admin. */
export function mustUseSso(school: Pick<School, "authMode">, user: Pick<User, "role" | "isBreakGlass">) {
  return school.authMode !== "FORM" && (user.role === "TEACHER" || user.role === "SCHOOL_ADMIN") && !user.isBreakGlass;
}
