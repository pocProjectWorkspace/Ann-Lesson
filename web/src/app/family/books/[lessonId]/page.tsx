import { notFound } from "next/navigation";
import { requireSchoolRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { parentMayReadClass } from "@/lib/family";
import { narrationFor } from "@/lib/narration";
import { PdfViewer } from "@/components/pdf-viewer";
import { Empty, PageHeader } from "@/components/ui";

/**
 * A parent opens one of their child's books to read it together. Read-only: nothing is
 * written to the child's progress, so the teacher still sees what the child did alone.
 */
export default async function FamilyBook({ params, searchParams }: { params: Promise<{ lessonId: string }>; searchParams: Promise<{ file?: string; child?: string }> }) {
  const session = await requireSchoolRole("PARENT");
  const { lessonId } = await params;
  const { file: fileParam, child } = await searchParams;
  const lesson = await db.lesson.findFirst({ where: { id: lessonId, schoolId: session.schoolId, publishedAt: { not: null } }, select: { id: true, title: true, description: true, subject: { select: { name: true, classId: true } }, files: { orderBy: { createdAt: "asc" }, select: { id: true, fileName: true } } } });
  if (!lesson || !(await parentMayReadClass(session.userId, lesson.subject.classId))) notFound();
  const current = lesson.files.find((f) => f.id === fileParam) ?? lesson.files[0];
  const narration = current ? await narrationFor(current.id) : undefined;
  const kid = child ? await db.guardianLink.findFirst({ where: { parentId: session.userId, studentId: child }, select: { student: { select: { name: true } } } }) : null;

  return (
    <>
      <PageHeader crumbs={[{ href: "/family", label: "Family" }, { label: lesson.title }]} title={lesson.title} subtitle={`${lesson.subject.name}${kid ? ` · ${kid.student.name.split(" ")[0]}'s class book` : ""}. Reading here does not change ${kid ? kid.student.name.split(" ")[0] + "'s" : "your child's"} own progress.${narration ? " Press Read to me to hear the teacher." : ""}`} />
      {current ? <PdfViewer fileId={current.id} title={current.fileName} restricted viewerName={session.name} narration={narration} /> : <Empty>This book has no PDF yet.</Empty>}
    </>
  );
}
