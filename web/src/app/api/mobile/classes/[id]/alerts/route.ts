import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, json, readJson, withAuth } from "@/lib/api";
import { handleAlert, syncSupportAlerts } from "@/lib/insights";

async function assertTeaches(teacherId: string, classId: string) {
  const a = await db.teacherAssignment.findFirst({ where: { teacherId, classId }, select: { id: true } });
  if (!a) throw new ApiError(404, "Class not found");
}

/** GET /api/mobile/classes/:id/alerts (teacher) → open early-support alerts, freshly evaluated. */
export const GET = withAuth<{ id: string }>(["TEACHER"], async (_req, session, { id }) => {
  await assertTeaches(session.userId, id);
  return json({ alerts: await syncSupportAlerts(id) });
});

/** POST /api/mobile/classes/:id/alerts  { alertId } (teacher) → mark handled. */
export const POST = withAuth<{ id: string }>(["TEACHER"], async (req, session, { id }) => {
  await assertTeaches(session.userId, id);
  const body = z.object({ alertId: z.string().uuid() }).safeParse(await readJson(req));
  if (!body.success) throw new ApiError(400, "Body must be { alertId }");
  if (!(await handleAlert(body.data.alertId, id, session.userId))) throw new ApiError(404, "Alert not found");
  return json({ ok: true });
});
