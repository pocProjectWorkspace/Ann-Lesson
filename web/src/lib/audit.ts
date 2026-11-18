import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import type { Session } from "./auth";
import { reportError } from "./report-error";

export type AuditInput = {
  action: string; // "student.create", "lesson.file.upload", "school.plan.change" ...
  summary: string;
  schoolId?: string | null;
  targetType?: string;
  targetId?: string;
  meta?: Prisma.InputJsonValue;
};

/** Record an admin action. Never throws; a failed audit write must not break the action. */
export async function audit(actor: Pick<Session, "userId" | "name" | "schoolId">, input: AuditInput) {
  try {
    await db.auditLog.create({
      data: {
        schoolId: input.schoolId === undefined ? actor.schoolId : input.schoolId,
        actorId: actor.userId,
        actorName: actor.name,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        summary: input.summary,
        meta: input.meta,
      },
    });
  } catch (e) {
    reportError(e, { where: "audit", extra: { action: input.action } });
  }
}
