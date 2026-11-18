import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { readLocal, signedUrl } from "@/lib/storage";

/**
 * Serves a lesson PDF to an authorised user.
 * - Super admin: any file.
 * - School admin: files in their school.
 * - Teacher: files in classes they teach.
 * - Student: files in lessons of their own class, view only (no download hint,
 *   no caching). Session validity is checked on every request, so a revoked
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
  const isStudent = session.role === "STUDENT";
  const wantsDownload = !isStudent && req.nextUrl.searchParams.get("download") === "1";
  const disposition = !isPdf || wantsDownload ? "attachment" : "inline";

  const url = await signedUrl(file.storageKey, file.fileName, disposition);
  if (url) return NextResponse.redirect(url, 302);

  const bytes = await readLocal(file.storageKey);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": isPdf ? "application/pdf" : "application/octet-stream",
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `${disposition}; filename="${encodeURIComponent(file.fileName)}"`,
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
    },
  });
}
