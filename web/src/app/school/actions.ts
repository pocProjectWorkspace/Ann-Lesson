"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, requireSchoolRole, revokeUserSessions, type Session } from "@/lib/auth";
import { copyObject, deleteObject, makeKey } from "@/lib/storage";
import { audit } from "@/lib/audit";
import { assertWithinPlan, PlanLimitError } from "@/lib/plans";
import { notifyLessonPublished, notifyUsers, removeNotificationsFor } from "@/lib/notify";
import { columnIndex, parseCsv } from "@/lib/csv";
import { className } from "@/lib/data";
import type { ActionState } from "@/lib/utils";

type SchoolSession = Session & { schoolId: string };

const passwordSchema = z.string().min(8, "Password must be at least 8 characters").max(100);
const nameSchema = z.string().trim().min(1, "Name is required").max(120);
const usernameSchema = z
  .string()
  .trim()
  .min(2, "Username must be at least 2 characters")
  .max(120)
  .regex(/^[A-Za-z0-9@._-]+$/, "Username may contain letters, numbers, @ . _ -");
const optionalEmail = z.string().trim().email("Enter a valid email").or(z.literal("")).optional();
const uuid = z.string().uuid();

const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Invalid input";

/** Run `fn`, turning plan-limit errors into a friendly form error. */
async function guarded(fn: () => Promise<ActionState>): Promise<ActionState> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof PlanLimitError) return { error: e.message };
    throw e;
  }
}

/* ---------------- Teachers ---------------- */

export async function createTeacher(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSchoolRole("SCHOOL_ADMIN");
  const { schoolId } = session;
  const parsed = z.object({ name: nameSchema, username: usernameSchema, email: optionalEmail, password: passwordSchema }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const d = parsed.data;
  return guarded(async () => {
    await assertWithinPlan(schoolId, "teachers", 1);
    if (await db.user.findFirst({ where: { schoolId, username: { equals: d.username, mode: "insensitive" } } })) return { error: "That username is already used in your school" };
    const user = await db.user.create({ data: { schoolId, role: "TEACHER", name: d.name, username: d.username, email: d.email || null, passwordHash: await hashPassword(d.password) } });
    await audit(session, { action: "teacher.create", targetType: "User", targetId: user.id, summary: `Added teacher ${d.name} (${d.username})` });
    revalidatePath("/school/teachers");
    return { success: `Teacher ${d.name} added` };
  });
}

export async function assignTeacherToClass(formData: FormData) {
  const session = await requireSchoolRole("SCHOOL_ADMIN");
  const { schoolId } = session;
  const parsed = z.object({ teacherId: uuid, classId: uuid }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const [teacher, cls] = await Promise.all([
    db.user.findFirst({ where: { id: parsed.data.teacherId, schoolId, role: "TEACHER" } }),
    db.class.findFirst({ where: { id: parsed.data.classId, schoolId } }),
  ]);
  if (!teacher || !cls) return;
  await db.teacherAssignment.upsert({ where: { teacherId_classId: { teacherId: teacher.id, classId: cls.id } }, create: { teacherId: teacher.id, classId: cls.id }, update: {} });
  await audit(session, { action: "teacher.assign", targetType: "User", targetId: teacher.id, summary: `Assigned ${teacher.name} to ${className(cls)}` });
  await notifyUsers([teacher.id], { title: `You now teach ${className(cls)}`, href: `/teacher/classes/${cls.id}` });
  revalidatePath(`/school/classes/${cls.id}`);
  revalidatePath("/school/teachers");
}

export async function unassignTeacherFromClass(formData: FormData) {
  const session = await requireSchoolRole("SCHOOL_ADMIN");
  const { schoolId } = session;
  const parsed = z.object({ teacherId: uuid, classId: uuid }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const cls = await db.class.findFirst({ where: { id: parsed.data.classId, schoolId } });
  const teacher = await db.user.findFirst({ where: { id: parsed.data.teacherId, schoolId } });
  if (!cls || !teacher) return;
  await db.teacherAssignment.deleteMany({ where: { teacherId: teacher.id, classId: cls.id } });
  await audit(session, { action: "teacher.unassign", targetType: "User", targetId: teacher.id, summary: `Removed ${teacher.name} from ${className(cls)}` });
  revalidatePath(`/school/classes/${cls.id}`);
  revalidatePath("/school/teachers");
}

/* ---------------- Students ---------------- */

export async function createStudent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSchoolRole("SCHOOL_ADMIN");
  const { schoolId } = session;
  const parsed = z
    .object({ name: nameSchema, username: usernameSchema, email: optionalEmail, password: passwordSchema, classId: uuid.or(z.literal("")) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const d = parsed.data;
  return guarded(async () => {
    await assertWithinPlan(schoolId, "students", 1);
    if (await db.user.findFirst({ where: { schoolId, username: { equals: d.username, mode: "insensitive" } } })) return { error: "That username or student ID is already used in your school" };
    if (d.classId && !(await db.class.findFirst({ where: { id: d.classId, schoolId } }))) return { error: "Class not found" };
    const user = await db.user.create({
      data: { schoolId, role: "STUDENT", name: d.name, username: d.username, email: d.email || null, classId: d.classId || null, passwordHash: await hashPassword(d.password) },
    });
    await audit(session, { action: "student.create", targetType: "User", targetId: user.id, summary: `Added student ${d.name} (${d.username})` });
    revalidatePath("/school/students");
    if (d.classId) revalidatePath(`/school/classes/${d.classId}`);
    return { success: `Student ${d.name} added` };
  });
}

type ImportRow = { name: string; username: string; password: string; email: string; line: number };

/** Shared by the paste box and the CSV upload. */
async function importRows(session: SchoolSession, classId: string, rows: ImportRow[]): Promise<ActionState> {
  const { schoolId } = session;
  const cls = await db.class.findFirst({ where: { id: classId, schoolId } });
  if (!cls) return { error: "Class not found" };
  if (rows.length === 0) return { error: "No student rows found" };
  return guarded(async () => {
    const valid: ImportRow[] = [];
    const errors: string[] = [];
    const seen = new Set<string>();
    for (const r of rows) {
      const check = z.object({ name: nameSchema, username: usernameSchema, password: passwordSchema, email: optionalEmail }).safeParse(r);
      if (!check.success) {
        errors.push(`Line ${r.line}: ${firstIssue(check.error)}`);
        continue;
      }
      const key = r.username.toLowerCase();
      if (seen.has(key)) {
        errors.push(`Line ${r.line}: ${r.username} appears twice in the file`);
        continue;
      }
      seen.add(key);
      valid.push(r);
    }
    const existing = await db.user.findMany({ where: { schoolId, username: { in: valid.map((v) => v.username), mode: "insensitive" } }, select: { username: true } });
    const taken = new Set(existing.map((e) => e.username.toLowerCase()));
    const toCreate = valid.filter((v) => {
      if (taken.has(v.username.toLowerCase())) {
        errors.push(`Line ${v.line}: ${v.username} already exists`);
        return false;
      }
      return true;
    });
    await assertWithinPlan(schoolId, "students", toCreate.length);
    for (const v of toCreate) {
      await db.user.create({ data: { schoolId, role: "STUDENT", name: v.name, username: v.username, email: v.email || null, classId: cls.id, passwordHash: await hashPassword(v.password) } });
    }
    await audit(session, { action: "student.import", targetType: "Class", targetId: cls.id, summary: `Imported ${toCreate.length} students into ${className(cls)}`, meta: { errors: errors.length } });
    revalidatePath("/school/students");
    revalidatePath(`/school/classes/${cls.id}`);
    if (errors.length) return { error: `${toCreate.length} added. Problems: ${errors.slice(0, 6).join("; ")}${errors.length > 6 ? ` and ${errors.length - 6} more` : ""}` };
    return { success: `${toCreate.length} students added to ${className(cls)}` };
  });
}

/** Paste box: "Name, StudentID, Password[, Email]" per line. */
export async function importStudents(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSchoolRole("SCHOOL_ADMIN");
  const parsed = z.object({ classId: uuid, rows: z.string().min(1, "Paste at least one line") }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const rows = parsed.data.rows
    .split(/\r?\n/)
    .map((l, i) => ({ line: i + 1, cells: l.split(",").map((s) => s.trim()) }))
    .filter((r) => r.cells.some(Boolean))
    .map((r) => ({ line: r.line, name: r.cells[0] ?? "", username: r.cells[1] ?? "", password: r.cells[2] ?? "", email: r.cells[3] ?? "" }));
  return importRows(session, parsed.data.classId, rows);
}

/** CSV file with a header row. Columns: name, student id (or username), password, email (optional). */
export async function importStudentsCsv(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSchoolRole("SCHOOL_ADMIN");
  const classId = String(formData.get("classId") ?? "");
  if (!uuid.safeParse(classId).success) return { error: "Choose a class" };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file" };
  if (file.size > 2 * 1024 * 1024) return { error: "CSV is larger than 2 MB" };
  const table = parseCsv(await file.text());
  if (table.length < 2) return { error: "The file needs a header row and at least one student" };
  const header = table[0];
  const iName = columnIndex(header, "name", "student name", "full name");
  const iUser = columnIndex(header, "student id", "studentid", "username", "id", "admission no", "admission number", "roll no");
  const iPass = columnIndex(header, "password", "pass");
  const iMail = columnIndex(header, "email", "e-mail");
  if (iName < 0 || iUser < 0) return { error: `Could not find the Name and Student ID columns. Header row was: ${header.join(", ")}` };
  const defaultPassword = String(formData.get("defaultPassword") ?? "").trim();
  const rows: ImportRow[] = table.slice(1).map((cells, i) => ({
    line: i + 2,
    name: (cells[iName] ?? "").trim(),
    username: (cells[iUser] ?? "").trim(),
    password: (iPass >= 0 ? (cells[iPass] ?? "").trim() : "") || defaultPassword,
    email: iMail >= 0 ? (cells[iMail] ?? "").trim() : "",
  }));
  return importRows(session, classId, rows);
}

export async function moveStudentToClass(formData: FormData) {
  const session = await requireSchoolRole("SCHOOL_ADMIN");
  const { schoolId } = session;
  const parsed = z.object({ studentId: uuid, classId: uuid.or(z.literal("")) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const student = await db.user.findFirst({ where: { id: parsed.data.studentId, schoolId, role: "STUDENT" } });
  if (!student) return;
  const cls = parsed.data.classId ? await db.class.findFirst({ where: { id: parsed.data.classId, schoolId } }) : null;
  if (parsed.data.classId && !cls) return;
  await db.user.update({ where: { id: student.id }, data: { classId: cls?.id ?? null } });
  await audit(session, { action: "student.move", targetType: "User", targetId: student.id, summary: `Moved ${student.name} to ${cls ? className(cls) : "no class"}` });
  revalidatePath("/school/students");
}

/* ---------------- Shared user actions ---------------- */

export async function toggleSchoolUserActive(formData: FormData) {
  const session = await requireSchoolRole("SCHOOL_ADMIN");
  const id = String(formData.get("id") ?? "");
  const user = await db.user.findFirst({ where: { id, schoolId: session.schoolId, role: { in: ["TEACHER", "STUDENT"] } } });
  if (!user) return;
  await db.user.update({ where: { id }, data: { isActive: !user.isActive } });
  if (user.isActive) await revokeUserSessions(id);
  await audit(session, { action: user.isActive ? "user.deactivate" : "user.activate", targetType: "User", targetId: id, summary: `${user.isActive ? "Deactivated" : "Activated"} ${user.name}` });
  revalidatePath("/school/teachers");
  revalidatePath("/school/students");
}

export async function resetSchoolUserPassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSchoolRole("SCHOOL_ADMIN");
  const parsed = z.object({ userId: uuid, password: passwordSchema }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const user = await db.user.findFirst({ where: { id: parsed.data.userId, schoolId: session.schoolId, role: { in: ["TEACHER", "STUDENT"] } } });
  if (!user) return { error: "User not found" };
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(parsed.data.password) } });
  await revokeUserSessions(user.id);
  await audit(session, { action: "user.password.reset", targetType: "User", targetId: user.id, summary: `Reset password for ${user.name}` });
  return { success: `Password reset for ${user.name}` };
}

export async function deleteSchoolUser(formData: FormData) {
  const session = await requireSchoolRole("SCHOOL_ADMIN");
  const id = String(formData.get("id") ?? "");
  const user = await db.user.findFirst({ where: { id, schoolId: session.schoolId, role: { in: ["TEACHER", "STUDENT"] } } });
  if (!user) return;
  await db.user.delete({ where: { id } });
  await audit(session, { action: "user.delete", targetType: "User", targetId: id, summary: `Deleted ${user.role.toLowerCase()} ${user.name} (${user.username})` });
  revalidatePath("/school/teachers");
  revalidatePath("/school/students");
}

/* ---------------- Classes ---------------- */

const classSchema = z.object({ name: nameSchema, section: z.string().trim().max(20).optional(), academicYear: z.string().trim().max(20).optional() });

export async function createClass(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSchoolRole("SCHOOL_ADMIN");
  const parsed = classSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const count = await db.class.count({ where: { schoolId: session.schoolId } });
  const cls = await db.class.create({ data: { schoolId: session.schoolId, name: parsed.data.name, section: parsed.data.section || null, academicYear: parsed.data.academicYear || null, sortOrder: count } });
  await audit(session, { action: "class.create", targetType: "Class", targetId: cls.id, summary: `Created class ${className(cls)}` });
  revalidatePath("/school/classes");
  return { success: `Class ${className(cls)} created` };
}

export async function updateClass(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSchoolRole("SCHOOL_ADMIN");
  const parsed = classSchema.extend({ id: uuid }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const cls = await db.class.findFirst({ where: { id: parsed.data.id, schoolId: session.schoolId } });
  if (!cls) return { error: "Class not found" };
  const updated = await db.class.update({ where: { id: cls.id }, data: { name: parsed.data.name, section: parsed.data.section || null, academicYear: parsed.data.academicYear || null } });
  await audit(session, { action: "class.update", targetType: "Class", targetId: cls.id, summary: `Renamed class ${className(cls)} to ${className(updated)}` });
  revalidatePath(`/school/classes/${cls.id}`);
  revalidatePath("/school/classes");
  return { success: "Class updated" };
}

export async function deleteClass(formData: FormData) {
  const session = await requireSchoolRole("SCHOOL_ADMIN");
  const id = String(formData.get("id") ?? "");
  const cls = await db.class.findFirst({ where: { id, schoolId: session.schoolId }, include: { subjects: { include: { lessons: { include: { files: true } } } } } });
  if (!cls) return;
  for (const s of cls.subjects) for (const l of s.lessons) for (const f of l.files) await deleteObject(f.storageKey);
  await removeNotificationsFor({ classIds: [id], lessonIds: cls.subjects.flatMap((s) => s.lessons.map((l) => l.id)) });
  await db.class.delete({ where: { id } });
  await audit(session, { action: "class.delete", targetType: "Class", targetId: id, summary: `Deleted class ${className(cls)} with ${cls.subjects.length} subjects` });
  revalidatePath("/school/classes");
  redirect("/school/classes");
}

/**
 * Year rollover: create the next year's class, move every student into it, and
 * optionally copy the syllabus (subjects, lessons and PDFs) so it can be reused.
 * The old class stays, empty of students, as the record of last year.
 */
export async function promoteClass(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSchoolRole("SCHOOL_ADMIN");
  const { schoolId } = session;
  const parsed = classSchema.extend({ id: uuid, copySyllabus: z.enum(["yes", "no"]).default("no"), keepTeachers: z.enum(["yes", "no"]).default("yes") }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const source = await db.class.findFirst({
    where: { id: parsed.data.id, schoolId },
    include: { students: { select: { id: true } }, teachers: true, subjects: { orderBy: { sortOrder: "asc" }, include: { lessons: { orderBy: { sortOrder: "asc" }, include: { files: true } } } } },
  });
  if (!source) return { error: "Class not found" };
  if (source.students.length === 0) return { error: "This class has no students to promote" };
  const d = parsed.data;

  const count = await db.class.count({ where: { schoolId } });
  const target = await db.class.create({ data: { schoolId, name: d.name, section: d.section || null, academicYear: d.academicYear || null, sortOrder: count } });
  await db.user.updateMany({ where: { id: { in: source.students.map((s) => s.id) } }, data: { classId: target.id } });
  if (d.keepTeachers === "yes") {
    await db.teacherAssignment.createMany({ data: source.teachers.map((t) => ({ teacherId: t.teacherId, classId: target.id })), skipDuplicates: true });
  }
  let copiedLessons = 0;
  if (d.copySyllabus === "yes") {
    for (const s of source.subjects) {
      const subject = await db.subject.create({ data: { schoolId, classId: target.id, name: s.name, sortOrder: s.sortOrder } });
      for (const l of s.lessons) {
        const lesson = await db.lesson.create({ data: { schoolId, subjectId: subject.id, title: l.title, description: l.description, sortOrder: l.sortOrder, publishedAt: l.publishedAt } });
        for (const f of l.files) {
          const key = makeKey(schoolId, lesson.id, f.fileName);
          await copyObject(f.storageKey, key);
          await db.lessonFile.create({ data: { schoolId, lessonId: lesson.id, fileName: f.fileName, storageKey: key, mimeType: f.mimeType, sizeBytes: f.sizeBytes } });
        }
        copiedLessons++;
      }
    }
  }
  await audit(session, {
    action: "class.promote",
    targetType: "Class",
    targetId: target.id,
    summary: `Promoted ${source.students.length} students from ${className(source)} to ${className(target)}${copiedLessons ? `, copied ${copiedLessons} lessons` : ""}`,
    meta: { sourceClassId: source.id },
  });
  await notifyUsers(
    source.students.map((s) => s.id),
    { title: `You are now in ${className(target)}`, body: d.academicYear ? `Academic year ${d.academicYear}` : undefined, href: "/student" },
  );
  revalidatePath("/school/classes");
  redirect(`/school/classes/${target.id}`);
}

/* ---------------- Subjects ---------------- */

export async function createSubject(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSchoolRole("SCHOOL_ADMIN");
  const parsed = z.object({ classId: uuid, name: nameSchema }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const cls = await db.class.findFirst({ where: { id: parsed.data.classId, schoolId: session.schoolId } });
  if (!cls) return { error: "Class not found" };
  const count = await db.subject.count({ where: { classId: cls.id } });
  const subject = await db.subject.create({ data: { schoolId: session.schoolId, classId: cls.id, name: parsed.data.name, sortOrder: count } });
  await audit(session, { action: "subject.create", targetType: "Subject", targetId: subject.id, summary: `Added subject ${subject.name} to ${className(cls)}` });
  revalidatePath(`/school/classes/${cls.id}`);
  return { success: `Subject ${parsed.data.name} added` };
}

export async function updateSubject(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSchoolRole("SCHOOL_ADMIN");
  const parsed = z.object({ id: uuid, name: nameSchema }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const subject = await db.subject.findFirst({ where: { id: parsed.data.id, schoolId: session.schoolId } });
  if (!subject) return { error: "Subject not found" };
  await db.subject.update({ where: { id: subject.id }, data: { name: parsed.data.name } });
  await audit(session, { action: "subject.update", targetType: "Subject", targetId: subject.id, summary: `Renamed subject ${subject.name} to ${parsed.data.name}` });
  revalidatePath(`/school/subjects/${subject.id}`);
  revalidatePath(`/school/classes/${subject.classId}`);
  return { success: "Subject updated" };
}

export async function deleteSubject(formData: FormData) {
  const session = await requireSchoolRole("SCHOOL_ADMIN");
  const id = String(formData.get("id") ?? "");
  const subject = await db.subject.findFirst({ where: { id, schoolId: session.schoolId }, include: { lessons: { include: { files: true } } } });
  if (!subject) return;
  for (const l of subject.lessons) for (const f of l.files) await deleteObject(f.storageKey);
  await removeNotificationsFor({ lessonIds: subject.lessons.map((l) => l.id) });
  await db.subject.delete({ where: { id } });
  await audit(session, { action: "subject.delete", targetType: "Subject", targetId: id, summary: `Deleted subject ${subject.name} with ${subject.lessons.length} lessons` });
  revalidatePath(`/school/classes/${subject.classId}`);
  redirect(`/school/classes/${subject.classId}`);
}

/* ---------------- Lessons ---------------- */

const lessonSchema = z.object({ title: nameSchema, description: z.string().trim().max(2000).optional() });

export async function createLesson(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSchoolRole("SCHOOL_ADMIN");
  const parsed = lessonSchema.extend({ subjectId: uuid }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const subject = await db.subject.findFirst({ where: { id: parsed.data.subjectId, schoolId: session.schoolId } });
  if (!subject) return { error: "Subject not found" };
  const count = await db.lesson.count({ where: { subjectId: subject.id } });
  const lesson = await db.lesson.create({ data: { schoolId: session.schoolId, subjectId: subject.id, title: parsed.data.title, description: parsed.data.description || null, sortOrder: count } });
  await audit(session, { action: "lesson.create", targetType: "Lesson", targetId: lesson.id, summary: `Added lesson "${lesson.title}" to ${subject.name}` });
  revalidatePath(`/school/subjects/${subject.id}`);
  return { success: `Lesson "${parsed.data.title}" added` };
}

export async function updateLesson(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSchoolRole("SCHOOL_ADMIN");
  const parsed = lessonSchema.extend({ id: uuid, subjectId: uuid.optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const lesson = await db.lesson.findFirst({ where: { id: parsed.data.id, schoolId: session.schoolId }, include: { subject: true } });
  if (!lesson) return { error: "Lesson not found" };
  let subjectId = lesson.subjectId;
  if (parsed.data.subjectId && parsed.data.subjectId !== lesson.subjectId) {
    const target = await db.subject.findFirst({ where: { id: parsed.data.subjectId, schoolId: session.schoolId } });
    if (!target) return { error: "Target subject not found" };
    subjectId = target.id;
  }
  const sortOrder = subjectId === lesson.subjectId ? lesson.sortOrder : await db.lesson.count({ where: { subjectId } });
  await db.lesson.update({ where: { id: lesson.id }, data: { title: parsed.data.title, description: parsed.data.description || null, subjectId, sortOrder } });
  await audit(session, { action: "lesson.update", targetType: "Lesson", targetId: lesson.id, summary: `Updated lesson "${parsed.data.title}"${subjectId !== lesson.subjectId ? " and moved it to another subject" : ""}` });
  revalidatePath(`/school/lessons/${lesson.id}`);
  revalidatePath(`/school/subjects/${lesson.subjectId}`);
  if (subjectId !== lesson.subjectId) revalidatePath(`/school/subjects/${subjectId}`);
  return { success: "Lesson updated" };
}

export async function reorderLesson(formData: FormData) {
  const { schoolId } = await requireSchoolRole("SCHOOL_ADMIN");
  const parsed = z.object({ id: uuid, direction: z.enum(["up", "down"]) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const lesson = await db.lesson.findFirst({ where: { id: parsed.data.id, schoolId } });
  if (!lesson) return;
  const siblings = await db.lesson.findMany({ where: { subjectId: lesson.subjectId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  const idx = siblings.findIndex((l) => l.id === lesson.id);
  const swapWith = parsed.data.direction === "up" ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= siblings.length) return;
  const reordered = [...siblings];
  [reordered[idx], reordered[swapWith]] = [reordered[swapWith], reordered[idx]];
  await db.$transaction(reordered.map((l, i) => db.lesson.update({ where: { id: l.id }, data: { sortOrder: i } })));
  revalidatePath(`/school/subjects/${lesson.subjectId}`);
}

export async function deleteLesson(formData: FormData) {
  const session = await requireSchoolRole("SCHOOL_ADMIN");
  const id = String(formData.get("id") ?? "");
  const lesson = await db.lesson.findFirst({ where: { id, schoolId: session.schoolId }, include: { files: true } });
  if (!lesson) return;
  for (const f of lesson.files) await deleteObject(f.storageKey);
  await removeNotificationsFor({ lessonIds: [id] });
  await db.lesson.delete({ where: { id } });
  await audit(session, { action: "lesson.delete", targetType: "Lesson", targetId: id, summary: `Deleted lesson "${lesson.title}"` });
  revalidatePath(`/school/subjects/${lesson.subjectId}`);
  redirect(`/school/subjects/${lesson.subjectId}`);
}

/* ---------------- Lesson files ---------------- */

/**
 * Publish makes a lesson visible to its class and notifies students and teachers; it
 * needs at least one PDF. Unpublish hides it again (progress is kept).
 */
export async function publishLesson(formData: FormData) {
  const session = await requireSchoolRole("SCHOOL_ADMIN");
  const id = String(formData.get("id") ?? "");
  const publish = String(formData.get("publish") ?? "yes") === "yes";
  const lesson = await db.lesson.findFirst({ where: { id, schoolId: session.schoolId }, include: { _count: { select: { files: true } }, subject: { select: { name: true } } } });
  if (!lesson) return;
  if (publish && lesson._count.files === 0) return; // the page hides the button in this case
  if (publish === !!lesson.publishedAt) return;
  await db.lesson.update({ where: { id }, data: { publishedAt: publish ? new Date() : null } });
  await audit(session, { action: publish ? "lesson.publish" : "lesson.unpublish", targetType: "Lesson", targetId: id, summary: `${publish ? "Published" : "Unpublished"} "${lesson.title}" in ${lesson.subject.name}` });
  if (publish) await notifyLessonPublished(id);
  revalidatePath(`/school/lessons/${id}`);
  revalidatePath(`/school/subjects/${lesson.subjectId}`);
  revalidatePath("/school");
}

export async function deleteLessonFile(formData: FormData) {
  const session = await requireSchoolRole("SCHOOL_ADMIN");
  const id = String(formData.get("id") ?? "");
  const file = await db.lessonFile.findFirst({ where: { id, schoolId: session.schoolId } });
  if (!file) return;
  await deleteObject(file.storageKey);
  await db.lessonFile.delete({ where: { id } });
  await audit(session, { action: "lesson.file.delete", targetType: "LessonFile", targetId: id, summary: `Deleted ${file.fileName}` });
  revalidatePath(`/school/lessons/${file.lessonId}`);
}

/** School admin preference: whether students see their class rank or only their own stars. */
export async function setStudentRankVisibility(formData: FormData) {
  const session = await requireSchoolRole("SCHOOL_ADMIN");
  const show = String(formData.get("show") ?? "yes") === "yes";
  await db.school.update({ where: { id: session.schoolId }, data: { showStudentRank: show } });
  await audit(session, { action: "school.preference", targetType: "School", targetId: session.schoolId, summary: show ? "Students now see their class rank" : "Students now see only their own grades, not their rank" });
  revalidatePath("/school");
  revalidatePath("/student");
}
