import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, json, readJson, withAuth } from "@/lib/api";
import { audit } from "@/lib/audit";

const schema = z.object({ token: z.string().min(10).max(200).regex(/^(ExponentPushToken|ExpoPushToken)\[.+\]$/, "Not an Expo push token"), platform: z.enum(["ios", "android", "web"]).optional() });

/**
 * POST /api/mobile/push-token { token, platform } → registers this device for push.
 *
 * A push token identifies a device, not a person. If the same token arrives from a
 * different signed-in user, the device has changed hands (a shared phone, or a
 * sign-out that never reached the server), so it is rebound to the current user.
 * Leaving it bound to the previous user would send their notifications to someone
 * else's phone. Presenting the token proves possession of the device: Expo issues
 * it only to that app install and this API never returns it. Rebinding is audited.
 */
export const POST = withAuth(["STUDENT", "TEACHER"], async (req, session) => {
  const body = schema.safeParse(await readJson(req));
  if (!body.success) throw new ApiError(400, body.error.issues[0]?.message ?? "Invalid token");
  const existing = await db.pushToken.findUnique({ where: { token: body.data.token }, select: { userId: true } });
  if (existing && existing.userId !== session.userId) {
    await audit(session, { action: "push.token.rebind", targetType: "User", targetId: session.userId, summary: `Push device moved from another account to ${session.name}`, meta: { previousUserId: existing.userId, platform: body.data.platform } });
  }
  await db.pushToken.upsert({
    where: { token: body.data.token },
    create: { token: body.data.token, userId: session.userId, platform: body.data.platform },
    update: { userId: session.userId, platform: body.data.platform, lastSeenAt: new Date() },
  });
  return json({ ok: true });
});

/** DELETE /api/mobile/push-token { token } → stops push to this device (sign-out). */
export const DELETE = withAuth(["STUDENT", "TEACHER"], async (req, session) => {
  const body = z.object({ token: z.string().min(1) }).safeParse(await readJson(req));
  if (!body.success) throw new ApiError(400, "token is required");
  await db.pushToken.deleteMany({ where: { token: body.data.token, userId: session.userId } });
  return json({ ok: true });
});
