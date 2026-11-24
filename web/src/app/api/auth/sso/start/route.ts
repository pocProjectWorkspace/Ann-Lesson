import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { authorizationUrl, flowCookieOptions, newFlow, signFlow, SSO_COOKIE, ssoConfigured } from "@/lib/sso";

/** Public origin of this deployment, honouring the proxy in front of it. */
export function publicOrigin(req: NextRequest) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") || /^\d+\.\d+\.\d+\.\d+/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

/** Where the mobile app may be sent back to with its token. */
function allowedMobileRedirect(url: string | null) {
  if (!url) return undefined;
  if (url.startsWith("lessonplan://")) return url;
  const allowed = (process.env.CORS_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  try {
    const u = new URL(url);
    if (allowed.includes(u.origin)) return url;
    if (process.env.NODE_ENV !== "production" && /^(localhost|127\.0\.0\.1|10\.|192\.168\.)/.test(u.hostname)) return url;
  } catch {
    /* not a URL */
  }
  return undefined;
}

/**
 * GET /api/auth/sso/start?school=CODE[&next=/path][&client=mobile&redirect=lessonplan://sso][&test=1]
 * Begins the provider sign-in for a school. The PKCE verifier, state and nonce travel in
 * a short-lived signed cookie and are checked in the callback.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const code = (q.get("school") ?? "").trim().toUpperCase();
  const school = code ? await db.school.findUnique({ where: { code } }) : null;
  if (!school || !school.isActive) return NextResponse.redirect(new URL(`/login?error=sso&reason=school`, req.url));
  if (!ssoConfigured(school)) return NextResponse.json({ error: "This school does not use single sign-on" }, { status: 400 });

  const next = q.get("next") ?? "";
  const client = q.get("client") === "mobile" ? "mobile" : "web";
  const flow = newFlow({ school: code, next: /^\/[^/\\]/.test(next) ? next : "", client, redirect: client === "mobile" ? allowedMobileRedirect(q.get("redirect")) : undefined, test: q.get("test") === "1" });
  const redirectUri = `${publicOrigin(req)}/api/auth/sso/callback`;
  try {
    const url = await authorizationUrl(school, flow, redirectUri);
    const res = NextResponse.redirect(url);
    res.cookies.set(SSO_COOKIE, await signFlow(flow), flowCookieOptions);
    return res;
  } catch (e) {
    console.error("sso start", e);
    return NextResponse.redirect(new URL(`/login?school=${encodeURIComponent(code)}&error=sso&reason=provider`, req.url));
  }
}
