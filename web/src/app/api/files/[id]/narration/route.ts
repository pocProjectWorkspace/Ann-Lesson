import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { readLocalRange, signedUrl, statLocal } from "@/lib/storage";
import { parentMayReadClass } from "@/lib/family";

/**
 * GET /api/files/:id/narration?page=N → the teacher's voice clip for that page.
 * Same audience as the PDF: the owner, the school's admins, teachers of the class and
 * students of the class. Accepts the web-view hand-off token (?t=) like /api/files/:id.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const page = Number(req.nextUrl.searchParams.get("page"));
  if (!Number.isInteger(page) || page < 1) return new NextResponse("Bad page", { status: 400 });

  const file = await db.lessonFile.findUnique({ where: { id }, select: { id: true, schoolId: true, lesson: { select: { subject: { select: { classId: true } } } } } });
  if (!file) return new NextResponse("Not found", { status: 404 });
  let allowed = false;
  if (session.role === "SUPER_ADMIN") allowed = true;
  else if (session.schoolId !== file.schoolId) allowed = false;
  else if (session.role === "SCHOOL_ADMIN") allowed = true;
  else if (session.role === "TEACHER") allowed = !!(await db.teacherAssignment.findFirst({ where: { teacherId: session.userId, classId: file.lesson.subject.classId }, select: { id: true } }));
  else if (session.role === "PARENT") allowed = await parentMayReadClass(session.userId, file.lesson.subject.classId);
  else if (session.role === "STUDENT") {
    const me = await db.user.findUnique({ where: { id: session.userId }, select: { classId: true } });
    allowed = !!me?.classId && me.classId === file.lesson.subject.classId;
  }
  if (!allowed) return new NextResponse("Forbidden", { status: 403 });

  const clip = await db.pageAudio.findUnique({ where: { fileId_page: { fileId: file.id, page } } });
  if (!clip) return new NextResponse("No recording for this page", { status: 404 });

  const url = await signedUrl(clip.storageKey, `page-${page}`, "inline");
  if (url) return NextResponse.redirect(url, 302);

  const size = await statLocal(clip.storageKey);
  if (size === null) return new NextResponse("Recording missing from storage", { status: 404 });
  const headers: Record<string, string> = {
    "Content-Type": clip.mimeType,
    "Content-Security-Policy": "sandbox; default-src 'none'",
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = Math.min(range[1] && range[2] ? Number(range[2]) : size - 1, size - 1);
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    return new NextResponse(readLocalRange(clip.storageKey, start, end), { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
  }
  if (req.method === "HEAD") return new NextResponse(null, { headers: { ...headers, "Content-Length": String(size) } });
  return new NextResponse(readLocalRange(clip.storageKey, 0, size - 1), { headers: { ...headers, "Content-Length": String(size) } });
}

export const HEAD = GET;
