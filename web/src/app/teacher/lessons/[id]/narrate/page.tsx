import { notFound } from "next/navigation";
import { requireSchoolRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { lessonForUser } from "@/lib/data";
import { narrationClips } from "@/lib/narration";
import { Empty, PageHeader } from "@/components/ui";
import { Narrator } from "@/components/narrator";

/** Teacher: record a read-to-me clip for each page of the lesson's book. */
export default async function NarrateLesson({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ file?: string }> }) {
  const session = await requireSchoolRole("TEACHER");
  const { id } = await params;
  const { file: fileParam } = await searchParams;
  const lesson = await lessonForUser({ id: session.userId, role: "TEACHER", schoolId: session.schoolId }, id);
  if (!lesson) notFound();
  const current = lesson.files.find((f) => f.id === fileParam) ?? lesson.files[0];
  // The page count comes from whichever student has opened the book; otherwise the
  // recorder learns it from the PDF itself.
  const known = current ? await db.lessonProgress.findFirst({ where: { lessonId: lesson.id, pageCount: { not: null } }, select: { pageCount: true } }) : null;
  const clips = current ? await narrationClips(current.id) : [];

  return (
    <>
      <PageHeader crumbs={[{ href: "/teacher", label: "My classes" }, { href: `/teacher/classes/${lesson.class.id}`, label: lesson.class.name }, { href: `/teacher/lessons/${lesson.id}`, label: lesson.title }, { label: "Read to me" }]} title={`Read to me: ${lesson.title}`} subtitle="Record your voice reading each page. Children get a Read to me button in the book that plays your voice and turns the pages for them." />
      {lesson.files.length > 1 && (
        <nav aria-label="Files" className="mb-4 flex flex-wrap gap-2">
          {lesson.files.map((f) => (
            <a key={f.id} href={`?file=${f.id}`} aria-current={f.id === current?.id ? "true" : undefined} className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${f.id === current?.id ? "bg-accent text-accent-fg" : "border border-ink-200 bg-white text-ink-700"}`}>
              {f.fileName}
            </a>
          ))}
        </nav>
      )}
      {current ? <Narrator fileId={current.id} pageCount={known?.pageCount ?? null} initialClips={clips} /> : <Empty>No PDF has been uploaded for this lesson yet.</Empty>}
    </>
  );
}
