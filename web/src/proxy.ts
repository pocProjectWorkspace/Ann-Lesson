import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PROTECTED: Array<{ prefix: string; roles: string[] }> = [
  { prefix: "/admin", roles: ["SUPER_ADMIN"] },
  { prefix: "/school", roles: ["SCHOOL_ADMIN"] },
  { prefix: "/teacher", roles: ["TEACHER"] },
  { prefix: "/student", roles: ["STUDENT"] },
  { prefix: "/account", roles: ["SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER", "STUDENT"] },
  { prefix: "/api/files", roles: ["SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER", "STUDENT"] },
  { prefix: "/api/uploads", roles: ["SCHOOL_ADMIN"] },
];

const HOME: Record<string, string> = {
  SUPER_ADMIN: "/admin",
  SCHOOL_ADMIN: "/school",
  TEACHER: "/teacher",
  STUDENT: "/student",
};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/*
 * CORS for the token-authenticated API, so the mobile web build served from
 * another origin can call it. Allowed origins come from CORS_ORIGINS
 * (comma-separated). In development any local-network origin is allowed.
 */
const CORS_PATHS = ["/api/mobile", "/api/files", "/api/exports", "/api/health"];
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)(:\d+)?$/;

function corsOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  const allowed = (process.env.CORS_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (allowed.includes(origin)) return origin;
  if (process.env.NODE_ENV !== "production" && LOCAL_ORIGIN.test(origin)) return origin;
  return null;
}

function withCors(res: NextResponse, origin: string) {
  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Authorization,Content-Type,Accept");
  res.headers.set("Access-Control-Expose-Headers", "Content-Disposition");
  res.headers.set("Access-Control-Max-Age", "600");
  res.headers.append("Vary", "Origin");
  return res;
}

/**
 * Cross-site request check for cookie-authenticated writes. Browsers always send
 * Origin on cross-site POSTs; if it does not match our host, refuse.
 * Token-authenticated calls (bearer header) are exempt; they cannot be forged by a page.
 */
function crossSite(req: NextRequest) {
  if (SAFE_METHODS.has(req.method)) return false;
  if (req.headers.get("authorization")?.toLowerCase().startsWith("bearer ")) return false;
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const corsPath = CORS_PATHS.some((p) => pathname.startsWith(p));
  const origin = corsPath ? corsOrigin(req) : null;
  if (corsPath && req.method === "OPTIONS") {
    return origin ? withCors(new NextResponse(null, { status: 204 }), origin) : new NextResponse(null, { status: 403 });
  }
  // Calls from an allowed CORS origin to the token API never carry a usable cookie
  // (no credentials in CORS, SameSite=Lax), so the cookie CSRF guard does not apply to them.
  if (!(corsPath && origin) && crossSite(req)) return new NextResponse("Cross-site request refused", { status: 403 });
  const finish = (res: NextResponse) => (origin ? withCors(res, origin) : res);

  const rule = PROTECTED.find((r) => pathname.startsWith(r.prefix));
  if (!rule) return finish(NextResponse.next());

  // First gate: a validly signed token. Pages and routes then check the session table.
  const auth = req.headers.get("authorization");
  const bearer = pathname.startsWith("/api/") && auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : undefined;
  const queryToken = pathname.startsWith("/api/files/") ? req.nextUrl.searchParams.get("t") ?? undefined : undefined;
  const token = bearer ?? queryToken ?? req.cookies.get("lp_session")?.value;
  let role: string | null = null;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET ?? ""));
      // Session tokens have no purpose; the file route also accepts the web-view hand-off token.
      if (!payload.purpose || (payload.purpose === "webview" && queryToken)) role = String(payload.role);
    } catch {
      role = null;
    }
  }

  if (!role) {
    if (pathname.startsWith("/api/")) return finish(new NextResponse("Unauthorized", { status: 401 }));
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (!rule.roles.includes(role)) {
    if (pathname.startsWith("/api/")) return finish(new NextResponse("Forbidden", { status: 403 }));
    return NextResponse.redirect(new URL(HOME[role] ?? "/login", req.url));
  }
  return finish(NextResponse.next());
}

export const config = {
  matcher: ["/login", "/account/:path*", "/admin/:path*", "/school/:path*", "/teacher/:path*", "/student/:path*", "/api/files/:path*", "/api/uploads/:path*", "/api/mobile/:path*", "/api/exports/:path*", "/api/health"],
};
