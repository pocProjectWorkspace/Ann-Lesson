import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { isAuthMode, providerLabel, ssoConfigured, type AuthMode } from "@/lib/sso";

/**
 * GET /api/auth/login-options?code=SCHOOLCODE
 * Tells the login page (web and mobile) how this school signs in, so it can show the
 * provider button for staff and the form for students. Public, by design: it reveals
 * nothing beyond what the school's own login page shows.
 */
export async function GET(req: NextRequest) {
  const code = (req.nextUrl.searchParams.get("code") ?? "").trim().toUpperCase();
  if (!code) return NextResponse.json({ error: "Missing school code" }, { status: 400 });
  const school = await db.school.findUnique({ where: { code }, select: { name: true, isActive: true, authMode: true, ssoTenant: true, ssoClientId: true, ssoClientSecret: true, ssoStudents: true } });
  if (!school || !school.isActive) return NextResponse.json({ error: "School code not found" }, { status: 404 });
  const mode: AuthMode = isAuthMode(school.authMode) && ssoConfigured(school) ? school.authMode : "FORM";
  return NextResponse.json(
    { code, name: school.name, mode, provider: mode === "FORM" ? null : providerLabel[mode], studentsSso: mode !== "FORM" && school.ssoStudents },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
