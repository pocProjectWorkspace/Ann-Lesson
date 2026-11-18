import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, json, readJson, withAuth } from "@/lib/api";
import { notifyUsers } from "@/lib/notify";

/** POST /api/mobile/lessons/:id/confirm { studentId, confirm } (teacher) */
export const POST = withAuth<{ id: string }>(["TEACHER"], async (req, session, { id }) => {
  const body = z.object({ studentId: z.string().uuid(), confirm: z.boolean() }).safeParse(await readJson(req));
  if (!body.success) throw new ApiError(400, "Body must be { studentId, confirm }");
  const lesson = await db.lesson.findFirst({ where: { id, subject: { class: { teachers: { some: { teacherId: session.userId } } } } }, include: { subject: { select: { classId: true } } } });
  if (!lesson) throw new ApiError(404, "Lesson not found");
  const student = await db.user.findFirst({ where: { id: body.data.studentId, classId: lesson.subject.classId, role: "STUDENT" } });
  if (!student) throw new ApiError(404, "Student not found in this class");
  const p = await db.lessonProgress.upsert({
    where: { studentId_lessonId: { studentId: student.id, lessonId: lesson.id } },
    create: { studentId: student.id, lessonId: lesson.id, learntAt: new Date(), confirmedAt: new Date(), confirmedById: session.userId },
    update: body.data.confirm ? { learntAt: new Date(), confirmedAt: new Date(), confirmedById: session.userId } : { confirmedAt: null, confirmedById: null },
  });
  if (body.data.confirm) await notifyUsers([student.id], { title: `${session.name} confirmed you learnt "${lesson.title}"`, href: `/student/lessons/${lesson.id}` });
  return json({ studentId: student.id, learntAt: p.learntAt, confirmedAt: p.confirmedAt });
});
