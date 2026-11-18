"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSchoolRole } from "@/lib/auth";
import { notifyUsers } from "@/lib/notify";

async function teacherLesson(teacherId: string, lessonId: string) {
  return db.lesson.findFirst({ where: { id: lessonId, subject: { class: { teachers: { some: { teacherId } } } } }, include: { subject: { select: { classId: true, name: true } } } });
}

/** Teacher confirms (or withdraws confirmation of) a student's "learnt". */
export async function confirmLearnt(formData: FormData) {
  const session = await requireSchoolRole("TEACHER");
  const parsed = z.object({ lessonId: z.string().uuid(), studentId: z.string().uuid(), confirm: z.enum(["yes", "no"]) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const lesson = await teacherLesson(session.userId, parsed.data.lessonId);
  if (!lesson) return;
  const student = await db.user.findFirst({ where: { id: parsed.data.studentId, classId: lesson.subject.classId, role: "STUDENT" } });
  if (!student) return;
  const confirming = parsed.data.confirm === "yes";
  await db.lessonProgress.upsert({
    where: { studentId_lessonId: { studentId: student.id, lessonId: lesson.id } },
    create: { studentId: student.id, lessonId: lesson.id, learntAt: new Date(), confirmedAt: new Date(), confirmedById: session.userId },
    update: confirming ? { learntAt: { set: new Date() }, confirmedAt: new Date(), confirmedById: session.userId } : { confirmedAt: null, confirmedById: null },
  });
  if (confirming) await notifyUsers([student.id], { title: `${session.name} confirmed you learnt "${lesson.title}"`, href: `/student/lessons/${lesson.id}` });
  revalidatePath(`/teacher/lessons/${lesson.id}`);
  revalidatePath(`/teacher/classes/${lesson.subject.classId}`);
}

/** Confirm everyone who has marked the lesson learnt but is not yet confirmed. */
export async function confirmAllLearnt(formData: FormData) {
  const session = await requireSchoolRole("TEACHER");
  const lessonId = String(formData.get("lessonId") ?? "");
  const lesson = await teacherLesson(session.userId, lessonId);
  if (!lesson) return;
  const pending = await db.lessonProgress.findMany({ where: { lessonId: lesson.id, learntAt: { not: null }, confirmedAt: null }, select: { id: true, studentId: true } });
  if (pending.length === 0) return;
  await db.lessonProgress.updateMany({ where: { id: { in: pending.map((p) => p.id) } }, data: { confirmedAt: new Date(), confirmedById: session.userId } });
  await notifyUsers(pending.map((p) => p.studentId), { title: `${session.name} confirmed you learnt "${lesson.title}"`, href: `/student/lessons/${lesson.id}` });
  revalidatePath(`/teacher/lessons/${lesson.id}`);
  revalidatePath(`/teacher/classes/${lesson.subject.classId}`);
}
