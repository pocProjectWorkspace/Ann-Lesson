import { revokeSession } from "@/lib/auth";
import { json, withAuth } from "@/lib/api";

/** POST /api/mobile/logout → revokes this device's session. */
export const POST = withAuth(["STUDENT", "TEACHER", "PARENT"], async (_req, session) => {
  await revokeSession(session.sid);
  return json({ ok: true });
});
