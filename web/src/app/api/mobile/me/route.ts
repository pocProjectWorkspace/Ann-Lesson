import { db } from "@/lib/db";
import { json, withAuth } from "@/lib/api";
import { className } from "@/lib/data";

/** GET /api/mobile/me → current user, school and class. */
export const GET = withAuth(["STUDENT", "TEACHER"], async (_req, session) => {
  const user = await db.user.findUniqueOrThrow({ where: { id: session.userId }, include: { school: true, class: true } });
  return json({
    id: user.id,
    name: user.name,
    role: user.role,
    username: user.username,
    school: user.school ? { id: user.school.id, name: user.school.name, code: user.school.code } : null,
    class: user.class ? { id: user.class.id, name: className(user.class) } : null,
  });
});
