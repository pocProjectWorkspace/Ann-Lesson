"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSchoolRole } from "@/lib/auth";
import { notifyUsers } from "@/lib/notify";
import { audit } from "@/lib/audit";
import type { ActionState } from "@/lib/utils";
import { giveSticker, isTeacherSticker, stickerKind } from "@/lib/stickers";
import { handleAlert } from "@/lib/insights";

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

/**
 * Save the whole grade table of a class in one go. Fields are named
 * "g:<studentId>:<subjectId>" with a value of 1-5 or "" for not graded. Only changed
 * cells are written; students whose grades changed get one notification each.
 */
export async function saveGrades(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSchoolRole("TEACHER");
  const classId = String(formData.get("classId") ?? "");
  const teaches = await db.teacherAssignment.findFirst({ where: { teacherId: session.userId, classId }, select: { id: true } });
  if (!teaches) return { error: "You do not teach this class" };
  const [students, subjects, existing] = await Promise.all([
    db.user.findMany({ where: { classId, role: "STUDENT" }, select: { id: true, name: true } }),
    db.subject.findMany({ where: { classId }, select: { id: true, name: true } }),
    db.subjectGrade.findMany({ where: { subject: { classId } }, select: { studentId: true, subjectId: true, rating: true } }),
  ]);
  const studentIds = new Set(students.map((s) => s.id));
  const subjectIds = new Set(subjects.map((s) => s.id));
  const current = new Map(existing.map((g) => [`${g.studentId}:${g.subjectId}`, g.rating]));
  const changed = new Map<string, Set<string>>(); // studentId -> subject names
  let writes = 0;
  for (const [key, raw] of formData.entries()) {
    const m = /^g:([0-9a-f-]{36}):([0-9a-f-]{36})$/.exec(key);
    if (!m || !studentIds.has(m[1]) || !subjectIds.has(m[2])) continue;
    const rating = String(raw) === "" ? null : Number(raw);
    if (rating !== null && !(Number.isInteger(rating) && rating >= 1 && rating <= 5)) return { error: "Ratings must be 1 to 5" };
    const [studentId, subjectId] = [m[1], m[2]];
    const before = current.get(`${studentId}:${subjectId}`) ?? null;
    if (before === rating) continue;
    const where = { subjectId_studentId: { subjectId, studentId } };
    if (rating === null) await db.subjectGrade.delete({ where });
    else await db.subjectGrade.upsert({ where, create: { schoolId: session.schoolId, subjectId, studentId, teacherId: session.userId, rating }, update: { rating, teacherId: session.userId } });
    writes++;
    const set = changed.get(studentId) ?? new Set<string>();
    set.add(subjects.find((s) => s.id === subjectId)?.name ?? "");
    changed.set(studentId, set);
  }
  if (writes) {
    await audit(session, { action: "grade.update", targetType: "Class", targetId: classId, summary: `Updated ${writes} grade${writes === 1 ? "" : "s"} for ${changed.size} student${changed.size === 1 ? "" : "s"}`, meta: { classId } });
    await Promise.all([...changed].map(([studentId, names]) => notifyUsers([studentId], { title: "Your grades were updated", body: [...names].filter(Boolean).join(", "), href: "/student" })));
  }
  revalidatePath(`/teacher/classes/${classId}/grades`);
  revalidatePath(`/teacher/classes/${classId}`);
  revalidatePath("/student");
  return { success: writes ? `Saved ${writes} grade${writes === 1 ? "" : "s"}` : "No changes to save" };
}

/** Teacher gives one sticker kind to the ticked children of a class they teach. */
export async function giveStickers(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSchoolRole("TEACHER");
  const classId = String(formData.get("classId") ?? "");
  const kind = String(formData.get("kind") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 120) || null;
  if (!isTeacherSticker(kind)) return { error: "Pick a sticker" };
  const teaches = await db.teacherAssignment.findFirst({ where: { teacherId: session.userId, classId }, select: { id: true } });
  if (!teaches) return { error: "You do not teach this class" };
  const studentIds = [...formData.keys()].map((k) => /^s:([0-9a-f-]{36})$/.exec(k)?.[1]).filter((x): x is string => !!x);
  if (!studentIds.length) return { error: "Tick at least one child" };
  const given = await giveSticker(session, classId, studentIds, kind, note);
  revalidatePath(`/teacher/classes/${classId}/stickers`);
  revalidatePath("/student");
  const k = stickerKind(kind);
  return { success: `${k.emoji} ${k.label} given to ${given.map((s) => s.name.split(" ")[0]).join(", ")}` };
}

/** Teacher marks an early-support alert as handled. */
export async function markAlertHandled(formData: FormData) {
  const session = await requireSchoolRole("TEACHER");
  const parsed = z.object({ alertId: z.string().uuid(), classId: z.string().uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const teaches = await db.teacherAssignment.findFirst({ where: { teacherId: session.userId, classId: parsed.data.classId }, select: { id: true } });
  if (!teaches) return;
  await handleAlert(parsed.data.alertId, parsed.data.classId, session.userId);
  revalidatePath(`/teacher/classes/${parsed.data.classId}`);
  revalidatePath("/teacher");
}
