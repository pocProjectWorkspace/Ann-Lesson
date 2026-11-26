import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, json, readJson, withAuth } from "@/lib/api";
import { strokeSchema } from "@/lib/strokes";

/**
 * A child's colouring of a page of a book, kept per child, file and page.
 * GET  /api/mobile/lessons/:id/colouring?fileId=…[&page=N]
 *      student → their own pages of that file; teacher → every child's, for the gallery.
 * POST /api/mobile/lessons/:id/colouring  { fileId, page, strokes }  (student)
 * Accepts the web-view hand-off token (?t=) like the position endpoint, see proxy.ts.
 */

async function fileInLesson(lessonId: string, fileId: string) {
  const f = await db.lessonFile.findFirst({ where: { id: fileId, lessonId }, select: { id: true, lesson: { select: { subject: { select: { classId: true } } } } } });
  if (!f) throw new ApiError(404, "Book not found");
  return f;
}

export const GET = withAuth<{ id: string }>(["STUDENT", "TEACHER", "SCHOOL_ADMIN"], async (req, session, { id }) => {
  const q = z.object({ fileId: z.string().uuid(), page: z.coerce.number().int().min(1).optional() }).safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) throw new ApiError(400, "fileId is required");
  const file = await fileInLesson(id, q.data.fileId);
  const classId = file.lesson.subject.classId;
  if (session.role === "STUDENT") {
    const me = await db.user.findUnique({ where: { id: session.userId }, select: { classId: true } });
    if (me?.classId !== classId) throw new ApiError(404, "Book not found");
    const rows = await db.pageColouring.findMany({ where: { studentId: session.userId, fileId: file.id, ...(q.data.page ? { page: q.data.page } : {}) }, select: { page: true, strokes: true, updatedAt: true }, orderBy: { page: "asc" } });
    return json({ pages: rows.map((r) => ({ page: r.page, strokes: r.strokes, updatedAt: r.updatedAt.toISOString() })) });
  }
  if (session.role === "TEACHER" && !(await db.teacherAssignment.findFirst({ where: { teacherId: session.userId, classId }, select: { id: true } }))) throw new ApiError(404, "Book not found");
  if (session.role === "SCHOOL_ADMIN" && !(await db.lesson.findFirst({ where: { id, schoolId: session.schoolId ?? "" }, select: { id: true } }))) throw new ApiError(404, "Book not found");
  const rows = await db.pageColouring.findMany({ where: { fileId: file.id, ...(q.data.page ? { page: q.data.page } : {}) }, include: { student: { select: { id: true, name: true } } }, orderBy: [{ updatedAt: "desc" }] });
  return json({ gallery: rows.map((r) => ({ studentId: r.student.id, studentName: r.student.name, page: r.page, strokes: r.strokes, updatedAt: r.updatedAt.toISOString() })) });
});

export const POST = withAuth<{ id: string }>(["STUDENT"], async (req, session, { id }) => {
  const body = z.object({ fileId: z.string().uuid(), page: z.number().int().min(1).max(5000), strokes: z.array(strokeSchema).max(600) }).safeParse(await readJson(req));
  if (!body.success) throw new ApiError(400, "Body must be { fileId, page, strokes }");
  const file = await fileInLesson(id, body.data.fileId);
  const me = await db.user.findUnique({ where: { id: session.userId }, select: { classId: true } });
  if (me?.classId !== file.lesson.subject.classId) throw new ApiError(404, "Book not found");
  const where = { studentId_fileId_page: { studentId: session.userId, fileId: file.id, page: body.data.page } };
  if (body.data.strokes.length === 0) {
    await db.pageColouring.deleteMany({ where: { studentId: session.userId, fileId: file.id, page: body.data.page } });
    return json({ ok: true, cleared: true });
  }
  const row = await db.pageColouring.upsert({ where, create: { studentId: session.userId, lessonId: id, fileId: file.id, page: body.data.page, strokes: body.data.strokes }, update: { strokes: body.data.strokes } });
  return json({ ok: true, page: row.page, updatedAt: row.updatedAt.toISOString() });
});
