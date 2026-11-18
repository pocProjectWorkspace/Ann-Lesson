"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { getSession, hashPassword, revokeSession, revokeUserSessions, verifyPassword } from "@/lib/auth";
import type { ActionState } from "@/lib/utils";
import { revalidatePath } from "next/cache";

export async function changePassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: "You are signed out. Sign in again." };
  const parsed = z
    .object({
      current: z.string().min(1, "Enter your current password"),
      next: z.string().min(8, "New password must be at least 8 characters").max(100),
      confirm: z.string(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { current, next, confirm } = parsed.data;
  if (next !== confirm) return { error: "The two new passwords do not match" };
  if (next === current) return { error: "Choose a password you have not used before" };

  const user = await db.user.findUniqueOrThrow({ where: { id: session.userId } });
  if (!(await verifyPassword(current, user.passwordHash))) return { error: "Current password is incorrect" };
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next) } });
  await revokeUserSessions(user.id, session.sid);
  revalidatePath("/account");
  return { success: "Password changed. Other devices have been signed out." };
}

export async function signOutDevice(formData: FormData) {
  const session = await getSession();
  if (!session) return;
  const sid = String(formData.get("sid") ?? "");
  const row = await db.session.findFirst({ where: { id: sid, userId: session.userId } });
  if (row) await revokeSession(row.id);
  revalidatePath("/account");
}

export async function signOutEverywhereElse() {
  const session = await getSession();
  if (!session) return;
  await revokeUserSessions(session.userId, session.sid);
  revalidatePath("/account");
}
