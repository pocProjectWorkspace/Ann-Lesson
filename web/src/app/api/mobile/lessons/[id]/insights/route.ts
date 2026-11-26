import { db } from "@/lib/db";
import { ApiError, json, withAuth } from "@/lib/api";
import { lessonInsights } from "@/lib/insights";

/** GET /api/mobile/lessons/:id/insights (teacher) → per-page attention and per-child detail for one book. */
export const GET = withAuth<{ id: string }>(["TEACHER"], async (_req, session, { id }) => {
  const teaches = await db.lesson.findFirst({ where: { id, subject: { class: { teachers: { some: { teacherId: session.userId } } } } }, select: { id: true } });
  if (!teaches) throw new ApiError(404, "Lesson not found");
  const ins = await lessonInsights(id);
  if (!ins) throw new ApiError(404, "Lesson not found");
  return json(ins);
});
