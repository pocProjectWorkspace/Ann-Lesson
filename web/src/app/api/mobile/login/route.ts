import { z } from "zod";
import { mustUseSso, providerLabel, type AuthMode } from "@/lib/sso";
import { db } from "@/lib/db";
import { createMobileSession, verifyPassword } from "@/lib/auth";
import { fail, json } from "@/lib/api";
import { LOGIN_PER_ACCOUNT, LOGIN_PER_IP, blockedFor, clientIpFrom, humanWait, recordFailure, recordSuccess } from "@/lib/rate-limit";

const schema = z.object({
  schoolCode: z.string().trim().min(1, "School code is required").max(40),
  username: z.string().trim().min(1, "Username is required").max(120),
  password: z.string().min(1, "Password is required"),
});

/** POST /api/mobile/login  → { token, user } for teachers and students. */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, "Invalid JSON body");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "Invalid input");
  const { schoolCode, username, password } = parsed.data;

  const ipKey = `login:ip:${clientIpFrom(req.headers)}`;
  const accountKey = `login:acct:${schoolCode.toUpperCase()}|${username.toLowerCase()}`;
  const wait = Math.max(blockedFor(ipKey), blockedFor(accountKey));
  if (wait) return fail(429, `Too many sign-in attempts. Try again in ${humanWait(wait)}.`);
  const failed = (status: number, message: string) => {
    const w = Math.max(recordFailure(ipKey, LOGIN_PER_IP), recordFailure(accountKey, LOGIN_PER_ACCOUNT));
    return fail(w ? 429 : status, w ? `${message} Sign-in is paused for ${humanWait(w)}.` : message);
  };

  const school = await db.school.findUnique({ where: { code: schoolCode.toUpperCase() } });
  if (!school) return failed(401, "School code not found.");
  if (!school.isActive) return fail(403, "This school is currently inactive.");

  const user = await db.user.findFirst({ where: { schoolId: school.id, username: { equals: username, mode: "insensitive" } }, include: { class: true } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) return failed(401, "Incorrect username or password.");
  if (!user.isActive) return fail(403, "Your account is inactive. Contact your school admin.");
  if (user.role !== "STUDENT" && user.role !== "TEACHER") return fail(403, "The mobile app is for teachers and students. Admins use the web app.");
  if (mustUseSso(school, user)) return fail(403, `${school.name} signs in with ${providerLabel[school.authMode as AuthMode]}. Use the school account button.`);

  recordSuccess(ipKey);
  recordSuccess(accountKey);
  const { token } = await createMobileSession(user);
  return json({
    token,
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      username: user.username,
      school: { id: school.id, name: school.name, code: school.code },
      class: user.class ? { id: user.class.id, name: `${user.class.name}${user.class.section ? " " + user.class.section : ""}` } : null,
    },
  });
}
