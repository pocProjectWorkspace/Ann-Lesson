import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, json, readJson, withAuth } from "@/lib/api";
import { progressState, readPercent } from "@/lib/data";
import { awardBadges, recordReadingDay } from "@/lib/stickers";

/**
 * POST /api/mobile/lessons/:id/position  { page, pageCount, day? }  (student)
 * "day" is the device's local date (YYYY-MM-DD) and counts towards the reading streak;
 * the response carries the streak and any badges this page turn earned.
 * Called by the book viewer as the student turns pages. Records the current page, the
 * furthest page reached and the page count; reaching the last page marks the lesson as
 * finished reading (distinct from "learnt", which the student claims and the teacher
 * confirms). Accepts the web-view hand-off token (?t=) as well as a session, see proxy.ts.
 */
export const POST = withAuth<{ id: string }>(["STUDENT"], async (req, session, { id }) => {
  const body = z.object({ page: z.number().int().min(1).max(100_000), pageCount: z.number().int().min(1).max(100_000), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).safeParse(await readJson(req));
  if (!body.success) throw new ApiError(400, "Body must be { page, pageCount }");
  const page = Math.min(body.data.page, body.data.pageCount);
  const pageCount = body.data.pageCount;

  const me = await db.user.findUnique({ where: { id: session.userId }, select: { classId: true } });
  if (!me?.classId) throw new ApiError(404, "Lesson not found");
  const lesson = await db.lesson.findFirst({ where: { id, subject: { classId: me.classId } }, select: { id: true } });
  if (!lesson) throw new ApiError(404, "Lesson not found");

  const where = { studentId_lessonId: { studentId: session.userId, lessonId: lesson.id } };
  const existing = await db.lessonProgress.findUnique({ where });
  const maxPage = Math.max(existing?.maxPage ?? 0, page);
  const finishedAt = existing?.finishedAt ?? (maxPage >= pageCount ? new Date() : null);
  const p = await db.lessonProgress.upsert({
    where,
    create: { studentId: session.userId, lessonId: lesson.id, lastPage: page, maxPage, pageCount, finishedAt },
    update: { lastPage: page, maxPage, pageCount, finishedAt, lastViewedAt: new Date() },
  });
  const streak = await recordReadingDay(session.userId, body.data.day, existing?.lastPage !== page);
  const earned = await awardBadges(session.userId, { lessonId: lesson.id });
  return json({
    streak,
    earned,
    viewed: true,
    lastPage: p.lastPage,
    maxPage: p.maxPage,
    pageCount: p.pageCount,
    percent: readPercent(p),
    finished: !!p.finishedAt,
    finishedAt: p.finishedAt,
    learnt: !!p.learntAt,
    learntAt: p.learntAt,
    confirmedAt: p.confirmedAt,
    lastViewedAt: p.lastViewedAt,
    state: progressState(p),
  });
});
