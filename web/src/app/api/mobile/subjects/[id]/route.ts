import { ApiError, json, withAuth } from "@/lib/api";
import { studentSubject } from "@/lib/data";

/** GET /api/mobile/subjects/:id (student) → one subject with its published lessons and own progress. */
export const GET = withAuth<{ id: string }>(["STUDENT"], async (_req, session, { id }) => {
  const subject = await studentSubject(session.userId, id);
  if (!subject) throw new ApiError(404, "Subject not found");
  return json(subject);
});
