import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, json, readJson, withAuth } from "@/lib/api";
import { classGradebook, ratingLabel } from "@/lib/grades";
import { audit } from "@/lib/audit";
import { notifyUsers } from "@/lib/notify";
import { notifyGuardians } from "@/lib/family";

async function assertTeaches(teacherId: string, classId: string) {
  const a = await db.teacherAssignment.findFirst({ where: { teacherId, classId }, select: { id: true } });
  if (!a) throw new ApiError(404, "Class not found");
}

/** GET /api/mobile/classes/:id/grades (teacher) → subjects, students with ratings, overall and rank. */
export const GET = withAuth<{ id: string }>(["TEACHER"], async (_req, session, { id }) => {
  await assertTeaches(session.userId, id);
  const book = await classGradebook(id);
  if (!book) throw new ApiError(404, "Class not found");
  return json(book);
});

/** POST /api/mobile/classes/:id/grades  { studentId, subjectId, rating: 1..5 | null } (teacher) */
export const POST = withAuth<{ id: string }>(["TEACHER"], async (req, session, { id }) => {
  await assertTeaches(session.userId, id);
  const body = z.object({ studentId: z.string().uuid(), subjectId: z.string().uuid(), rating: z.number().int().min(1).max(5).nullable(), comment: z.string().max(500).optional() }).safeParse(await readJson(req));
  if (!body.success) throw new ApiError(400, "Body must be { studentId, subjectId, rating: 1-5 or null }");
  const { studentId, subjectId, rating, comment } = body.data;
  const [student, subject] = await Promise.all([
    db.user.findFirst({ where: { id: studentId, classId: id, role: "STUDENT" }, select: { id: true, name: true } }),
    db.subject.findFirst({ where: { id: subjectId, classId: id }, select: { id: true, name: true } }),
  ]);
  if (!student || !subject) throw new ApiError(404, "Student or subject not in this class");

  const where = { subjectId_studentId: { subjectId, studentId } };
  const before = await db.subjectGrade.findUnique({ where, select: { rating: true } });
  if (rating === null) {
    if (before) await db.subjectGrade.delete({ where });
  } else {
    await db.subjectGrade.upsert({ where, create: { schoolId: session.schoolId, subjectId, studentId, teacherId: session.userId, rating, comment: comment ?? null }, update: { rating, teacherId: session.userId, ...(comment !== undefined ? { comment: comment || null } : {}) } });
  }
  if ((before?.rating ?? null) !== rating) {
    await audit(session, { action: "grade.update", targetType: "User", targetId: studentId, summary: `${student.name}: ${subject.name} ${rating ? `rated ${rating} (${ratingLabel(rating)})` : "grade removed"}`, meta: { subjectId, rating } });
    if (rating) {
      await notifyUsers([studentId], { title: `New grade in ${subject.name}`, body: `${rating} · ${ratingLabel(rating)}`, href: "/student" });
      await notifyGuardians([studentId], (child) => ({ title: `${child} got stars in ${subject.name}`, body: `${"★".repeat(rating)} ${ratingLabel(rating)}` }));
    }
  }
  const book = await classGradebook(id);
  const me = book?.students.find((s) => s.id === studentId);
  return json({ studentId, subjectId, rating, overall: me?.overall ?? null, rank: me?.rank ?? null });
});
