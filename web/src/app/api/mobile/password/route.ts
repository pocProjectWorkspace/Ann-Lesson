import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, revokeUserSessions, verifyPassword } from "@/lib/auth";
import { ApiError, json, readJson, withAuth } from "@/lib/api";

/** POST /api/mobile/password { currentPassword, newPassword } → signs out other devices. */
export const POST = withAuth(["STUDENT", "TEACHER", "PARENT"], async (req, session) => {
  const body = z
    .object({ currentPassword: z.string().min(1), newPassword: z.string().min(8, "New password must be at least 8 characters").max(100) })
    .safeParse(await readJson(req));
  if (!body.success) throw new ApiError(400, body.error.issues[0]?.message ?? "Invalid input");
  const user = await db.user.findUniqueOrThrow({ where: { id: session.userId } });
  if (!(await verifyPassword(body.data.currentPassword, user.passwordHash))) throw new ApiError(400, "Current password is incorrect");
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(body.data.newPassword) } });
  await revokeUserSessions(user.id, session.sid);
  return json({ ok: true });
});
