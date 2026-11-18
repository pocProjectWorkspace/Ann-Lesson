import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, json, readJson, withAuth } from "@/lib/api";

/** GET /api/mobile/notifications → latest 50 plus unread count. */
export const GET = withAuth(["STUDENT", "TEACHER"], async (_req, session) => {
  const [items, unread] = await Promise.all([
    db.notification.findMany({ where: { userId: session.userId }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.notification.count({ where: { userId: session.userId, readAt: null } }),
  ]);
  return json({ unread, items });
});

/** POST /api/mobile/notifications { ids?: string[] } → marks given (or all) as read. */
export const POST = withAuth(["STUDENT", "TEACHER"], async (req, session) => {
  const body = z.object({ ids: z.array(z.string().uuid()).optional() }).safeParse(await readJson(req).catch(() => ({})));
  if (!body.success) throw new ApiError(400, "ids must be a list of ids");
  await db.notification.updateMany({ where: { userId: session.userId, readAt: null, ...(body.data.ids ? { id: { in: body.data.ids } } : {}) }, data: { readAt: new Date() } });
  return json({ ok: true });
});
