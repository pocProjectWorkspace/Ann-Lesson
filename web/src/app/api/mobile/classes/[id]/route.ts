import { ApiError, json, withAuth } from "@/lib/api";
import { teacherClass } from "@/lib/data";
import { syncSupportAlerts } from "@/lib/insights";

/** GET /api/mobile/classes/:id (teacher) → subjects and lessons with class-wide progress counts. */
export const GET = withAuth<{ id: string }>(["TEACHER"], async (_req, session, { id }) => {
  const c = await teacherClass(session.userId, id);
  if (!c) throw new ApiError(404, "Class not found");
  return json({ ...c, alerts: await syncSupportAlerts(id) });
});
