import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { readLocalRange, signedUrl, statLocal } from "@/lib/storage";

/**
 * Serves a lesson PDF to an authorised user.
 * - Super admin: any file.
 * - School admin: files in their school.
 * - Teacher: files in classes they teach, view only.
 * - Student: files in lessons of their own class, view only.
 * Download (attachment) is available to school admins and the owner only. Session validity is checked on every request, so a revoked
 *   session stops working immediately.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;

  const file = await db.lessonFile.findUnique({ where: { id }, include: { lesson: { include: { subject: { select: { classId: true } } } } } });
  if (!file) return new NextResponse("Not found", { status: 404 });

  let allowed = false;
  if (session.role === "SUPER_ADMIN") allowed = true;
  else if (session.schoolId !== file.schoolId) allowed = false;
  else if (session.role === "SCHOOL_ADMIN") allowed = true;
  else if (session.role === "TEACHER") {
    allowed = !!(await db.teacherAssignment.findFirst({ where: { teacherId: session.userId, classId: file.lesson.subject.classId }, select: { id: true } }));
  } else if (session.role === "STUDENT") {
    const me = await db.user.findUnique({ where: { id: session.userId }, select: { classId: true } });
    allowed = !!me?.classId && me.classId === file.lesson.subject.classId;
    if (allowed) {
      await db.lessonProgress.upsert({
        where: { studentId_lessonId: { studentId: session.userId, lessonId: file.lessonId } },
        create: { studentId: session.userId, lessonId: file.lessonId },
        update: { lastViewedAt: new Date() },
      });
    }
  }
  if (!allowed) return new NextResponse("Forbidden", { status: 403 });

  // Only PDFs are ever rendered inline. Anything else (which the upload path
  // should never create) is served as an opaque download, and every response
  // carries a sandboxing CSP so same-origin active content cannot run.
  const isPdf = file.mimeType === "application/pdf";
  // Only the people who manage content may save the file; teachers and students view only.
  const canDownload = session.role === "SCHOOL_ADMIN" || session.role === "SUPER_ADMIN";
  const wantsDownload = canDownload && req.nextUrl.searchParams.get("download") === "1";
  const disposition = !isPdf || wantsDownload ? "attachment" : "inline";

  const url = await signedUrl(file.storageKey, file.fileName, disposition);
  if (url) return NextResponse.redirect(url, 302);

  // Local driver: stream from disk and honour Range requests, so the book viewer can
  // fetch the first pages of a large PDF without downloading the whole file first.
  const size = await statLocal(file.storageKey);
  if (size === null) return new NextResponse("File missing from storage", { status: 404 });
  const headers: Record<string, string> = {
    "Content-Type": isPdf ? "application/pdf" : "application/octet-stream",
    "Content-Disposition": `${disposition}; filename="${encodeURIComponent(file.fileName)}"`,
    "Content-Security-Policy": "sandbox; default-src 'none'",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex",
    "Accept-Ranges": "bytes",
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    // "bytes=a-b", "bytes=a-" (to the end) or "bytes=-n" (last n bytes).
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = Math.min(range[1] && range[2] ? Number(range[2]) : size - 1, size - 1);
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
      return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    return new NextResponse(readLocalRange(file.storageKey, start, end), {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  if (req.method === "HEAD") return new NextResponse(null, { headers: { ...headers, "Content-Length": String(size) } });
  return new NextResponse(readLocalRange(file.storageKey, 0, size - 1), { headers: { ...headers, "Content-Length": String(size) } });
}

/** pdf.js probes with HEAD before asking for ranges; same checks and headers as GET. */
export const HEAD = GET;
