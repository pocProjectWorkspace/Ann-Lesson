import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { readLocal, signedUrl } from "@/lib/storage";
import { hitPublic } from "@/lib/rate-limit";

/** GET /api/brand/:code/logo → the school's logo for the login page. Public, like a school's website logo. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  if (hitPublic(req.headers, "brand-logo")) return new NextResponse("Too many requests", { status: 429 });
  const { code } = await ctx.params;
  const school = await db.school.findUnique({ where: { code: code.toUpperCase() }, select: { logoKey: true, isActive: true } });
  if (!school?.logoKey || !school.isActive) return new NextResponse("Not found", { status: 404 });
  const url = await signedUrl(school.logoKey, "logo", "inline");
  if (url) return NextResponse.redirect(url, 302);
  try {
    const buf = await readLocal(school.logoKey);
    const ext = school.logoKey.split(".").pop();
    const type = ext === "svg" ? "image/svg+xml" : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": type, "Cache-Control": "public, max-age=3600", "Content-Security-Policy": "sandbox; default-src 'none'", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
