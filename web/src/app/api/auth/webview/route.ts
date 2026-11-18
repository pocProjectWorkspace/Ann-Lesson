import { NextResponse, type NextRequest } from "next/server";
import { exchangeWebviewToken } from "@/lib/auth";

/**
 * GET /api/auth/webview?t=<short-lived token>&next=/embed/viewer/<fileId>
 * Exchanges the token for the session cookie inside the mobile app's web view,
 * then redirects to the requested same-origin path.
 */
export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get("t") ?? "";
  const next = req.nextUrl.searchParams.get("next") ?? "/";
  const session = await exchangeWebviewToken(t);
  if (!session) return new NextResponse("This viewer link has expired. Go back and open the lesson again.", { status: 401 });
  const safeNext = /^\/[^/\\]/.test(next) ? next : "/";
  return NextResponse.redirect(new URL(safeNext, req.url), 303);
}
