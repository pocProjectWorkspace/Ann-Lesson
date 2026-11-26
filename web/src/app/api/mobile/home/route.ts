import { json, withAuth } from "@/lib/api";
import { studentHome, teacherClasses } from "@/lib/data";
import { studentGrades } from "@/lib/grades";
import { studentStickers } from "@/lib/stickers";

/**
 * GET /api/mobile/home
 * Student → their class with subjects, lessons and own progress.
 * Teacher → their assigned classes with counts.
 */
export const GET = withAuth(["STUDENT", "TEACHER"], async (_req, session) => {
  if (session.role === "STUDENT") {
    const [h, grades, stickers] = await Promise.all([studentHome(session.userId), studentGrades(session.userId), studentStickers(session.userId)]);
    return json({ role: "STUDENT", class: h.class, totals: h.totals, continueLessonId: h.continueLesson?.id ?? null, subjects: h.subjects, grades, stickers });
  }
  return json({ role: "TEACHER", classes: await teacherClasses(session.userId) });
});
