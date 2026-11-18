import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, json, readJson, withAuth } from "@/lib/api";

/** POST /api/mobile/lessons/:id/learnt  { learnt: boolean }  (student) */
export const POST = withAuth<{ id: string }>(["STUDENT"], async (req, session, { id }) => {
  const body = z.object({ learnt: z.boolean() }).safeParse(await readJson(req));
  if (!body.success) throw new ApiError(400, "Body must be { learnt: true | false }");

  const me = await db.user.findUnique({ where: { id: session.userId }, select: { classId: true } });
  if (!me?.classId) throw new ApiError(404, "Lesson not found");
  const lesson = await db.lesson.findFirst({ where: { id, subject: { classId: me.classId } }, select: { id: true } });
  if (!lesson) throw new ApiError(404, "Lesson not found");

  const existing = await db.lessonProgress.findUnique({ where: { studentId_lessonId: { studentId: session.userId, lessonId: lesson.id } } });
  if (body.data.learnt && !existing) throw new ApiError(409, "Open the lesson and read it before marking it as learnt.");
  if (existing?.confirmedAt && !body.data.learnt) throw new ApiError(409, "Your teacher has confirmed this lesson, so it cannot be undone.");
  const learntAt = body.data.learnt ? new Date() : null;
  const p = await db.lessonProgress.upsert({
    where: { studentId_lessonId: { studentId: session.userId, lessonId: lesson.id } },
    create: { studentId: session.userId, lessonId: lesson.id, learntAt },
    update: { learntAt, lastViewedAt: new Date() },
  });
  return json({ viewed: true, learnt: !!p.learntAt, learntAt: p.learntAt, lastViewedAt: p.lastViewedAt, confirmedAt: p.confirmedAt });
});
