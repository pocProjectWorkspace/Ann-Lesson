"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, requireRole, revokeSchoolSessions, revokeUserSessions } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { PLANS, planKeys, type PlanKey } from "@/lib/plans";
import { notifyUsers } from "@/lib/notify";
import type { ActionState } from "@/lib/utils";

const codeSchema = z
  .string()
  .trim()
  .min(3, "Code must be at least 3 characters")
  .max(20, "Code must be at most 20 characters")
  .regex(/^[A-Za-z0-9_-]+$/, "Code may contain letters, numbers, - and _ only")
  .transform((s) => s.toUpperCase());

const passwordSchema = z.string().min(8, "Password must be at least 8 characters").max(100);
const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Invalid input";

const createSchoolSchema = z.object({
  name: z.string().trim().min(2, "School name is required").max(120),
  code: codeSchema,
  plan: z.enum(["TRIAL", "BASIC", "PRO"]).default("TRIAL"),
  adminName: z.string().trim().min(2, "Admin name is required").max(120),
  adminUsername: z.string().trim().min(3, "Admin username is required").max(120),
  adminEmail: z.string().trim().email("Enter a valid email").or(z.literal("")).optional(),
  adminPassword: passwordSchema,
});

export async function createSchool(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireRole("SUPER_ADMIN");
  const parsed = createSchoolSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const d = parsed.data;
  if (await db.school.findUnique({ where: { code: d.code } })) return { error: `School code ${d.code} is already taken` };

  const plan = PLANS[d.plan];
  const school = await db.school.create({
    data: {
      name: d.name,
      code: d.code,
      plan: d.plan,
      planExpiresAt: new Date(Date.now() + plan.days * 86_400_000),
      maxStudents: plan.maxStudents,
      maxTeachers: plan.maxTeachers,
      maxStorageMb: plan.maxStorageMb,
      users: { create: { role: "SCHOOL_ADMIN", name: d.adminName, username: d.adminUsername, email: d.adminEmail || null, passwordHash: await hashPassword(d.adminPassword) } },
    },
  });
  await audit(session, { schoolId: school.id, action: "school.create", targetType: "School", targetId: school.id, summary: `Created school ${d.name} (${d.code}) on ${plan.label}` });
  revalidatePath("/admin");
  return { success: `School ${d.name} created with code ${d.code}` };
}

export async function toggleSchoolActive(formData: FormData) {
  const session = await requireRole("SUPER_ADMIN");
  const id = String(formData.get("id") ?? "");
  const school = await db.school.findUnique({ where: { id } });
  if (!school) return;
  await db.school.update({ where: { id }, data: { isActive: !school.isActive } });
  if (school.isActive) await revokeSchoolSessions(id);
  await audit(session, { schoolId: id, action: school.isActive ? "school.deactivate" : "school.activate", targetType: "School", targetId: id, summary: `${school.isActive ? "Deactivated" : "Activated"} ${school.name}` });
  revalidatePath("/admin");
  revalidatePath(`/admin/schools/${id}`);
}

/**
 * What still ties a school to data. A school can be deleted only when every
 * count is zero; school admins and settled invoices do not block deletion.
 */
export async function schoolDeleteBlockers(schoolId: string) {
  const [classes, subjects, lessons, files, teachers, students, unpaidInvoices] = await Promise.all([
    db.class.count({ where: { schoolId } }),
    db.subject.count({ where: { schoolId } }),
    db.lesson.count({ where: { schoolId } }),
    db.lessonFile.count({ where: { schoolId } }),
    db.user.count({ where: { schoolId, role: "TEACHER" } }),
    db.user.count({ where: { schoolId, role: "STUDENT" } }),
    db.invoice.count({ where: { schoolId, paidAt: null } }),
  ]);
  const items = [
    [classes, "class", "classes"],
    [subjects, "subject", "subjects"],
    [lessons, "lesson", "lessons"],
    [files, "PDF", "PDFs"],
    [teachers, "teacher", "teachers"],
    [students, "student", "students"],
    [unpaidInvoices, "unpaid invoice", "unpaid invoices"],
  ] as const;
  return items.filter(([n]) => n > 0).map(([n, one, many]) => `${n} ${n === 1 ? one : many}`);
}

/** Owner only. Removes an empty school (no classes, teachers, students, lessons, PDFs or unpaid invoices) together with its admin accounts and audit history. */
export async function deleteSchool(formData: FormData) {
  const session = await requireRole("SUPER_ADMIN");
  const id = String(formData.get("id") ?? "");
  const school = await db.school.findUnique({ where: { id }, select: { id: true, name: true, code: true } });
  if (!school) return;
  const blockers = await schoolDeleteBlockers(id);
  if (blockers.length > 0) {
    // The page hides the button in this case; refuse quietly if it is called anyway.
    revalidatePath(`/admin/schools/${id}`);
    return;
  }
  await revokeSchoolSessions(id);
  // Cascades remove the school admins, paid invoices and the school's own audit rows.
  await db.school.delete({ where: { id } });
  await audit(session, { schoolId: null, action: "school.delete", targetType: "School", targetId: id, summary: `Deleted empty school ${school.name} (${school.code})` });
  revalidatePath("/admin");
  redirect("/admin?deleted=" + encodeURIComponent(school.name));
}

const planSchema = z.object({
  schoolId: z.string().uuid(),
  plan: z.string().refine((p) => planKeys.includes(p as PlanKey), "Unknown plan"),
  planExpiresAt: z.string().optional().default(""),
  maxStudents: z.coerce.number().int().min(0).max(1_000_000),
  maxTeachers: z.coerce.number().int().min(0).max(100_000),
  maxStorageMb: z.coerce.number().int().min(0).max(10_000_000),
});

export async function updateSchoolPlan(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireRole("SUPER_ADMIN");
  const parsed = planSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const d = parsed.data;
  const school = await db.school.findUnique({ where: { id: d.schoolId } });
  if (!school) return { error: "School not found" };
  const expires = d.planExpiresAt ? new Date(d.planExpiresAt) : null;
  if (d.planExpiresAt && Number.isNaN(expires!.getTime())) return { error: "Expiry date is not valid" };
  await db.school.update({ where: { id: school.id }, data: { plan: d.plan, planExpiresAt: expires, maxStudents: d.maxStudents, maxTeachers: d.maxTeachers, maxStorageMb: d.maxStorageMb } });
  await audit(session, {
    schoolId: school.id,
    action: "school.plan.update",
    targetType: "School",
    targetId: school.id,
    summary: `Set ${school.name} to ${PLANS[d.plan as PlanKey].label}${expires ? ` until ${expires.toISOString().slice(0, 10)}` : ""}, limits ${d.maxStudents} students, ${d.maxTeachers} teachers, ${d.maxStorageMb} MB`,
  });
  const admins = await db.user.findMany({ where: { schoolId: school.id, role: "SCHOOL_ADMIN" }, select: { id: true } });
  await notifyUsers(admins.map((a) => a.id), { title: `Your plan is now ${PLANS[d.plan as PlanKey].label}`, href: "/school/billing" });
  revalidatePath(`/admin/schools/${school.id}`);
  revalidatePath("/admin");
  return { success: "Plan updated" };
}

/** Apply a preset plan's limits and a fresh term. */
export async function applyPlanPreset(formData: FormData) {
  const session = await requireRole("SUPER_ADMIN");
  const parsed = z.object({ schoolId: z.string().uuid(), plan: z.enum(["TRIAL", "BASIC", "PRO"]) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const p = PLANS[parsed.data.plan];
  const school = await db.school.update({
    where: { id: parsed.data.schoolId },
    data: { plan: parsed.data.plan, planExpiresAt: new Date(Date.now() + p.days * 86_400_000), maxStudents: p.maxStudents, maxTeachers: p.maxTeachers, maxStorageMb: p.maxStorageMb },
  });
  await audit(session, { schoolId: school.id, action: "school.plan.update", targetType: "School", targetId: school.id, summary: `Applied ${p.label} preset to ${school.name} for ${p.days} days` });
  revalidatePath(`/admin/schools/${school.id}`);
  revalidatePath("/admin");
}

/* ---------------- Invoices ---------------- */

const invoiceSchema = z.object({
  schoolId: z.string().uuid(),
  description: z.string().trim().min(2, "Describe what the invoice is for").max(200),
  amount: z.coerce.number().positive("Amount must be more than 0").max(100_000_000),
  currency: z.string().trim().toUpperCase().length(3, "Currency is a 3-letter code"),
  dueAt: z.string().min(1, "Due date is required"),
  note: z.string().trim().max(500).optional(),
});

export async function createInvoice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireRole("SUPER_ADMIN");
  const parsed = invoiceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const d = parsed.data;
  const school = await db.school.findUnique({ where: { id: d.schoolId } });
  if (!school) return { error: "School not found" };
  const due = new Date(d.dueAt);
  if (Number.isNaN(due.getTime())) return { error: "Due date is not valid" };
  const year = new Date().getFullYear();
  const count = await db.invoice.count({ where: { number: { startsWith: `INV-${year}-` } } });
  const number = `INV-${year}-${String(count + 1).padStart(4, "0")}`;
  const invoice = await db.invoice.create({
    data: { schoolId: school.id, number, description: d.description, amountCents: Math.round(d.amount * 100), currency: d.currency, dueAt: due, note: d.note || null },
  });
  await audit(session, { schoolId: school.id, action: "invoice.create", targetType: "Invoice", targetId: invoice.id, summary: `Raised ${number} for ${school.name}: ${d.currency} ${d.amount.toFixed(2)}` });
  const admins = await db.user.findMany({ where: { schoolId: school.id, role: "SCHOOL_ADMIN" }, select: { id: true } });
  await notifyUsers(admins.map((a) => a.id), { title: `Invoice ${number} issued`, body: `${d.currency} ${d.amount.toFixed(2)}, due ${due.toLocaleDateString()}`, href: "/school/billing" });
  revalidatePath(`/admin/schools/${school.id}`);
  return { success: `Invoice ${number} created` };
}

export async function markInvoicePaid(formData: FormData) {
  const session = await requireRole("SUPER_ADMIN");
  const id = String(formData.get("id") ?? "");
  const invoice = await db.invoice.findUnique({ where: { id }, include: { school: true } });
  if (!invoice) return;
  const paid = !invoice.paidAt;
  await db.invoice.update({ where: { id }, data: { paidAt: paid ? new Date() : null } });
  await audit(session, { schoolId: invoice.schoolId, action: paid ? "invoice.paid" : "invoice.unpaid", targetType: "Invoice", targetId: id, summary: `Marked ${invoice.number} as ${paid ? "paid" : "unpaid"}` });
  revalidatePath(`/admin/schools/${invoice.schoolId}`);
}

export async function deleteInvoice(formData: FormData) {
  const session = await requireRole("SUPER_ADMIN");
  const id = String(formData.get("id") ?? "");
  const invoice = await db.invoice.findUnique({ where: { id } });
  if (!invoice || invoice.paidAt) return;
  await db.invoice.delete({ where: { id } });
  await audit(session, { schoolId: invoice.schoolId, action: "invoice.delete", targetType: "Invoice", targetId: id, summary: `Deleted ${invoice.number}` });
  revalidatePath(`/admin/schools/${invoice.schoolId}`);
}

/* ---------------- Admin users ---------------- */

const addAdminSchema = z.object({
  schoolId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  username: z.string().trim().min(3).max(120),
  email: z.string().trim().email().or(z.literal("")).optional(),
  password: passwordSchema,
});

export async function addSchoolAdmin(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireRole("SUPER_ADMIN");
  const parsed = addAdminSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const d = parsed.data;
  const clash = await db.user.findFirst({ where: { schoolId: d.schoolId, username: { equals: d.username, mode: "insensitive" } } });
  if (clash) return { error: "That username already exists in this school" };
  const user = await db.user.create({ data: { schoolId: d.schoolId, role: "SCHOOL_ADMIN", name: d.name, username: d.username, email: d.email || null, passwordHash: await hashPassword(d.password) } });
  await audit(session, { schoolId: d.schoolId, action: "admin.create", targetType: "User", targetId: user.id, summary: `Added school admin ${d.name} (${d.username})` });
  revalidatePath(`/admin/schools/${d.schoolId}`);
  return { success: "School admin added" };
}

export async function resetUserPassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireRole("SUPER_ADMIN");
  const parsed = z.object({ userId: z.string().uuid(), password: passwordSchema }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const user = await db.user.update({ where: { id: parsed.data.userId }, data: { passwordHash: await hashPassword(parsed.data.password) } });
  await revokeUserSessions(user.id);
  await audit(session, { schoolId: user.schoolId, action: "user.password.reset", targetType: "User", targetId: user.id, summary: `Reset password for ${user.name}` });
  if (user.schoolId) revalidatePath(`/admin/schools/${user.schoolId}`);
  return { success: `Password reset for ${user.name}` };
}

export async function toggleUserActive(formData: FormData) {
  const session = await requireRole("SUPER_ADMIN");
  const id = String(formData.get("id") ?? "");
  const user = await db.user.findUnique({ where: { id } });
  if (!user || user.role === "SUPER_ADMIN") return;
  await db.user.update({ where: { id }, data: { isActive: !user.isActive } });
  if (user.isActive) await revokeUserSessions(id);
  await audit(session, { schoolId: user.schoolId, action: user.isActive ? "user.deactivate" : "user.activate", targetType: "User", targetId: id, summary: `${user.isActive ? "Deactivated" : "Activated"} ${user.name}` });
  if (user.schoolId) revalidatePath(`/admin/schools/${user.schoolId}`);
}
