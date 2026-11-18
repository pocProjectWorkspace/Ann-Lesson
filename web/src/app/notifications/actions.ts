"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function markAllRead() {
  const session = await getSession();
  if (!session) return;
  await db.notification.updateMany({ where: { userId: session.userId, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/notifications");
}

export async function markRead(formData: FormData) {
  const session = await getSession();
  if (!session) return;
  const id = String(formData.get("id") ?? "");
  await db.notification.updateMany({ where: { id, userId: session.userId }, data: { readAt: new Date() } });
  revalidatePath("/notifications");
}
