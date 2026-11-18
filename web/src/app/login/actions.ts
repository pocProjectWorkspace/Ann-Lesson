"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { createWebSession, destroySession, homeFor, verifyPassword } from "@/lib/auth";
import { LOGIN_PER_ACCOUNT, LOGIN_PER_IP, blockedFor, clientIpFrom, humanWait, recordFailure, recordSuccess } from "@/lib/rate-limit";
import type { ActionState } from "@/lib/utils";

const schema = z.object({
  schoolCode: z.string().trim().max(40).optional().default(""),
  username: z.string().trim().min(1, "Enter your username or email").max(120),
  password: z.string().min(1, "Enter your password"),
  next: z.string().optional().default(""),
});

export type LoginState = (ActionState & { schoolCode?: string; username?: string }) | undefined;

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { schoolCode, username, password, next } = parsed.data;
  const fail = (error: string): LoginState => ({ error, schoolCode, username });

  const ip = clientIpFrom(await headers());
  const ipKey = `login:ip:${ip}`;
  const accountKey = `login:acct:${schoolCode.toUpperCase()}|${username.toLowerCase()}`;
  const wait = Math.max(blockedFor(ipKey), blockedFor(accountKey));
  if (wait) return fail(`Too many sign-in attempts. Try again in ${humanWait(wait)}.`);

  const failed = (message: string) => {
    const w = Math.max(recordFailure(ipKey, LOGIN_PER_IP), recordFailure(accountKey, LOGIN_PER_ACCOUNT));
    return fail(w ? `${message} Too many attempts, so sign-in is paused for ${humanWait(w)}.` : message);
  };

  let user;
  if (schoolCode) {
    const school = await db.school.findUnique({ where: { code: schoolCode.toUpperCase() } });
    if (!school) return failed("School code not found.");
    if (!school.isActive) return fail("This school is currently inactive.");
    user = await db.user.findFirst({ where: { schoolId: school.id, username: { equals: username, mode: "insensitive" } } });
  } else {
    user = await db.user.findFirst({ where: { role: "SUPER_ADMIN", username: { equals: username, mode: "insensitive" } } });
    if (!user) return failed("Enter your school code, or use the platform owner login.");
  }

  if (!user || !(await verifyPassword(password, user.passwordHash))) return failed("Incorrect username or password.");
  if (!user.isActive) return fail("Your account is inactive. Contact your school admin.");

  recordSuccess(ipKey);
  recordSuccess(accountKey);
  await createWebSession(user);
  const safeNext = /^\/[^/\\]/.test(next) ? next : homeFor[user.role];
  redirect(safeNext);
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
