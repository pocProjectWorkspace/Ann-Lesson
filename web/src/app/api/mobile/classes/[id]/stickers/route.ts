import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, json, readJson, withAuth } from "@/lib/api";
import { classStickers, giveSticker, TEACHER_STICKERS } from "@/lib/stickers";

async function assertTeaches(teacherId: string, classId: string) {
  const a = await db.teacherAssignment.findFirst({ where: { teacherId, classId }, select: { id: true } });
  if (!a) throw new ApiError(404, "Class not found");
}

/** GET /api/mobile/classes/:id/stickers (teacher) → the sticker kinds, and every student's streak and shelf. */
export const GET = withAuth<{ id: string }>(["TEACHER"], async (_req, session, { id }) => {
  await assertTeaches(session.userId, id);
  return json({ kinds: TEACHER_STICKERS, students: await classStickers(id) });
});

/** POST /api/mobile/classes/:id/stickers  { studentIds: string[], kind, note? } (teacher) */
export const POST = withAuth<{ id: string }>(["TEACHER"], async (req, session, { id }) => {
  await assertTeaches(session.userId, id);
  const body = z.object({ studentIds: z.array(z.string().uuid()).min(1).max(60), kind: z.enum(TEACHER_STICKERS.map((s) => s.kind) as [string, ...string[]]), note: z.string().trim().max(120).optional() }).safeParse(await readJson(req));
  if (!body.success) throw new ApiError(400, "Body must be { studentIds, kind, note? }");
  const given = await giveSticker(session, id, body.data.studentIds, body.data.kind, body.data.note || null);
  if (!given.length) throw new ApiError(404, "No such students in this class");
  return json({ ok: true, given: given.map((s) => s.id) });
});
