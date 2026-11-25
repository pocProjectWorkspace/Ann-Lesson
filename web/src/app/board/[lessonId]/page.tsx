import { notFound } from "next/navigation";
import { requireSchoolRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { SmartBoard } from "@/components/board/smart-board";
import type { Stroke } from "../actions";

/**
 * Smart board mode: a full-screen view of a lesson's book for the interactive panel at
 * the front of the class, with pen, highlighter, spotlight, cover, timer and a name
 * picker. Teachers of the class and school admins can open it. Drawings are saved per
 * teacher, file and page, so tomorrow's lesson starts where today's ended.
 */
export default async function BoardPage({ params, searchParams }: { params: Promise<{ lessonId: string }>; searchParams: Promise<{ file?: string }> }) {
  const session = await requireSchoolRole("TEACHER", "SCHOOL_ADMIN");
  const { lessonId } = await params;
  const { file: fileParam } = await searchParams;
  const lesson = await db.lesson.findFirst({
    where: {
      id: lessonId,
      schoolId: session.schoolId,
      ...(session.role === "TEACHER" ? { subject: { class: { teachers: { some: { teacherId: session.userId } } } } } : {}),
    },
    include: {
      files: { orderBy: { createdAt: "asc" }, select: { id: true, fileName: true } },
      subject: { select: { name: true, class: { select: { id: true, name: true, section: true, students: { where: { isActive: true }, orderBy: { name: "asc" }, select: { name: true } } } } } },
    },
  });
  if (!lesson) notFound();
  const current = lesson.files.find((f) => f.id === fileParam) ?? lesson.files[0];
  const notes = current ? await db.boardNote.findMany({ where: { fileId: current.id, teacherId: session.userId }, select: { page: true, strokes: true } }) : [];
  const saved: Record<number, Stroke[]> = {};
  for (const n of notes) saved[n.page] = n.strokes as Stroke[];
  const cls = lesson.subject.class;
  const backHref = session.role === "TEACHER" ? `/teacher/lessons/${lesson.id}` : `/school/lessons/${lesson.id}`;

  return (
    <SmartBoard
      lesson={{ id: lesson.id, title: lesson.title, subject: lesson.subject.name, className: `${cls.name}${cls.section ? " " + cls.section : ""}`, classId: cls.id }}
      files={lesson.files}
      currentFileId={current?.id ?? null}
      students={cls.students.map((s) => s.name)}
      saved={saved}
      backHref={backHref}
    />
  );
}
