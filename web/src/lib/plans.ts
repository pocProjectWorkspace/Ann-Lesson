import "server-only";
import type { School } from "@prisma/client";
import { db } from "./db";

export const PLANS = {
  TRIAL: { label: "Trial", maxStudents: 50, maxTeachers: 5, maxStorageMb: 1024, days: 30 },
  BASIC: { label: "Basic", maxStudents: 500, maxTeachers: 40, maxStorageMb: 10 * 1024, days: 365 },
  PRO: { label: "Pro", maxStudents: 100_000, maxTeachers: 5_000, maxStorageMb: 50 * 1024, days: 365 },
  CUSTOM: { label: "Custom", maxStudents: 0, maxTeachers: 0, maxStorageMb: 0, days: 0 },
} as const;
export type PlanKey = keyof typeof PLANS;
export const planKeys = Object.keys(PLANS) as PlanKey[];
export const planLabel = (p: string) => PLANS[p as PlanKey]?.label ?? p;

export type PlanStatus = {
  plan: string;
  label: string;
  expiresAt: Date | null;
  expired: boolean;
  daysLeft: number | null;
  students: { used: number; max: number };
  teachers: { used: number; max: number };
  storage: { usedMb: number; maxMb: number };
};

export async function planStatus(school: Pick<School, "id" | "plan" | "planExpiresAt" | "maxStudents" | "maxTeachers" | "maxStorageMb">): Promise<PlanStatus> {
  const [students, teachers, storage] = await Promise.all([
    db.user.count({ where: { schoolId: school.id, role: "STUDENT" } }),
    db.user.count({ where: { schoolId: school.id, role: "TEACHER" } }),
    db.lessonFile.aggregate({ where: { schoolId: school.id }, _sum: { sizeBytes: true } }),
  ]);
  const now = Date.now();
  const expired = !!school.planExpiresAt && school.planExpiresAt.getTime() < now;
  return {
    plan: school.plan,
    label: planLabel(school.plan),
    expiresAt: school.planExpiresAt,
    expired,
    daysLeft: school.planExpiresAt ? Math.ceil((school.planExpiresAt.getTime() - now) / 86_400_000) : null,
    students: { used: students, max: school.maxStudents },
    teachers: { used: teachers, max: school.maxTeachers },
    storage: { usedMb: Math.round(((storage._sum.sizeBytes ?? 0) / (1024 * 1024)) * 10) / 10, maxMb: school.maxStorageMb },
  };
}

export class PlanLimitError extends Error {}

/** Throws PlanLimitError with a friendly message if the school may not add `count` more of `kind`. */
export async function assertWithinPlan(schoolId: string, kind: "students" | "teachers" | "storage", count: number) {
  const school = await db.school.findUniqueOrThrow({ where: { id: schoolId } });
  const s = await planStatus(school);
  if (s.expired) throw new PlanLimitError(`Your ${s.label} plan expired on ${s.expiresAt!.toLocaleDateString()}. Existing users can still sign in, but nothing new can be added until it is renewed.`);
  if (kind === "students" && s.students.used + count > s.students.max) throw new PlanLimitError(`Your ${s.label} plan allows ${s.students.max} students. You have ${s.students.used} and are trying to add ${count}.`);
  if (kind === "teachers" && s.teachers.used + count > s.teachers.max) throw new PlanLimitError(`Your ${s.label} plan allows ${s.teachers.max} teachers. You have ${s.teachers.used}.`);
  if (kind === "storage" && s.storage.usedMb + count / (1024 * 1024) > s.storage.maxMb) throw new PlanLimitError(`Your ${s.label} plan includes ${s.storage.maxMb} MB of storage and ${s.storage.usedMb} MB is used. Delete old files or upgrade the plan.`);
}
