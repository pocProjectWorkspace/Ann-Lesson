import { json, withAuth } from "@/lib/api";
import { studentHome, teacherClasses } from "@/lib/data";

/**
 * GET /api/mobile/home
 * Student → their class with subjects, lessons and own progress.
 * Teacher → their assigned classes with counts.
 */
export const GET = withAuth(["STUDENT", "TEACHER"], async (_req, session) => {
  if (session.role === "STUDENT") {
    const h = await studentHome(session.userId);
    return json({ role: "STUDENT", class: h.class, totals: h.totals, continueLessonId: h.continueLesson?.id ?? null, subjects: h.subjects });
  }
  return json({ role: "TEACHER", classes: await teacherClasses(session.userId) });
});
