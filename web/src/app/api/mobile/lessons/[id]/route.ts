import { ApiError, json, withAuth } from "@/lib/api";
import { lessonForUser } from "@/lib/data";

/**
 * GET /api/mobile/lessons/:id
 * Student → lesson, files and own progress (must be in the lesson's class).
 * Teacher → lesson, files and every student's progress (must teach the class).
 */
export const GET = withAuth<{ id: string }>(["STUDENT", "TEACHER"], async (_req, session, { id }) => {
  const role = session.role === "STUDENT" ? "STUDENT" : "TEACHER";
  const l = await lessonForUser({ id: session.userId, role, schoolId: session.schoolId }, id);
  if (!l) throw new ApiError(404, "Lesson not found");
  const base = {
    id: l.id,
    title: l.title,
    description: l.description,
    subject: l.subject,
    class: l.class,
    files: l.files.map((f) => ({ id: f.id, fileName: f.fileName, sizeBytes: f.sizeBytes, url: `/api/files/${f.id}`, viewerPath: `/embed/viewer/${f.id}` })),
    prevLessonId: l.prev?.id ?? null,
    nextLessonId: l.next?.id ?? null,
  };
  if (role === "STUDENT") return json({ ...base, progress: l.progress });
  return json({ ...base, students: l.students });
});
