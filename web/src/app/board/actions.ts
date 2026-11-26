"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { requireSchoolRole } from "@/lib/auth";
import { strokeSchema, type Stroke } from "@/lib/strokes";
export type { Stroke };

/** Can this staff member open this file on the board? Teachers of the class and school admins. */
async function boardFile(session: { userId: string; role: string; schoolId: string }, fileId: string) {
  return db.lessonFile.findFirst({
    where: {
      id: fileId,
      schoolId: session.schoolId,
      ...(session.role === "TEACHER" ? { lesson: { subject: { class: { teachers: { some: { teacherId: session.userId } } } } } } : {}),
    },
    select: { id: true },
  });
}

/** Save what the teacher drew on one page. An empty list removes the note. */
export async function saveBoardNotes(fileId: string, page: number, strokes: Stroke[]): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSchoolRole("TEACHER", "SCHOOL_ADMIN");
  const parsed = z.object({ fileId: z.string().uuid(), page: z.number().int().min(1).max(5000), strokes: z.array(strokeSchema).max(500) }).safeParse({ fileId, page, strokes });
  if (!parsed.success) return { ok: false, error: "Could not save the drawing" };
  if (!(await boardFile(session, fileId))) return { ok: false, error: "Not allowed" };
  const where = { fileId_page_teacherId: { fileId, page, teacherId: session.userId } };
  if (parsed.data.strokes.length === 0) {
    await db.boardNote.deleteMany({ where: { fileId, page, teacherId: session.userId } });
  } else {
    await db.boardNote.upsert({ where, create: { schoolId: session.schoolId, fileId, page, teacherId: session.userId, strokes: parsed.data.strokes }, update: { strokes: parsed.data.strokes } });
  }
  return { ok: true };
}
