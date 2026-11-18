"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSchoolRole } from "@/lib/auth";
import type { ActionState } from "@/lib/utils";

/**
 * Students can mark a lesson learnt only after opening its PDF (a progress row
 * exists from the file route). A teacher can then confirm it.
 */
export async function markLessonLearnt(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSchoolRole("STUDENT");
  const parsed = z.object({ lessonId: z.string().uuid(), learnt: z.enum(["yes", "no"]) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid request" };

  const me = await db.user.findUnique({ where: { id: session.userId }, select: { classId: true } });
  if (!me?.classId) return { error: "You are not in a class" };
  const lesson = await db.lesson.findFirst({ where: { id: parsed.data.lessonId, subject: { classId: me.classId } }, select: { id: true, subjectId: true } });
  if (!lesson) return { error: "Lesson not found" };

  const existing = await db.lessonProgress.findUnique({ where: { studentId_lessonId: { studentId: session.userId, lessonId: lesson.id } } });
  if (parsed.data.learnt === "yes" && !existing) return { error: "Open the lesson and read it before marking it as learnt." };
  if (existing?.confirmedAt && parsed.data.learnt === "no") return { error: "Your teacher has confirmed this lesson, so it cannot be undone." };

  const learntAt = parsed.data.learnt === "yes" ? new Date() : null;
  await db.lessonProgress.upsert({
    where: { studentId_lessonId: { studentId: session.userId, lessonId: lesson.id } },
    create: { studentId: session.userId, lessonId: lesson.id, learntAt },
    update: { learntAt, lastViewedAt: new Date() },
  });
  revalidatePath(`/student/lessons/${lesson.id}`);
  revalidatePath(`/student/subjects/${lesson.subjectId}`);
  revalidatePath("/student");
  return { success: learntAt ? "Marked as learnt" : "Marked as not learnt" };
}
