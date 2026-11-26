import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSchoolRole } from "@/lib/auth";
import { lessonForUser } from "@/lib/data";
import { narrationFor } from "@/lib/narration";
import { Empty, PageHeader } from "@/components/ui";
import { FollowingBook } from "@/components/live/follow-teacher";
import { LearntForm } from "./learnt-form";

export default async function StudentLesson({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ file?: string }> }) {
  const session = await requireSchoolRole("STUDENT");
  const { id } = await params;
  const { file: fileParam } = await searchParams;
  const lesson = await lessonForUser({ id: session.userId, role: "STUDENT", schoolId: session.schoolId }, id);
  if (!lesson) notFound();
  const current = lesson.files.find((f) => f.id === fileParam) ?? lesson.files[0];
  const narration = current ? await narrationFor(current.id) : undefined;

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/student", label: "My subjects" }, { href: `/student/subjects/${lesson.subject.id}`, label: lesson.subject.name }, { label: `Lesson ${lesson.position}` }]}
        title={lesson.title}
        subtitle={lesson.description ?? undefined}
        actions={<LearntForm lessonId={lesson.id} learnt={lesson.progress.learnt} confirmed={!!lesson.progress.confirmedAt} finished={lesson.progress.finished} percent={lesson.progress.percent} pageCount={lesson.progress.pageCount} />}
      />

      {lesson.files.length > 1 && (
        <nav aria-label="Files" className="mb-4 flex flex-wrap gap-2">
          {lesson.files.map((f) => (
            <a key={f.id} href={`?file=${f.id}`} aria-current={f.id === current?.id ? "true" : undefined} className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${f.id === current?.id ? "bg-accent text-accent-fg" : "border border-ink-200 bg-white text-ink-700 hover:bg-ink-100"}`}>
              {f.fileName}
            </a>
          ))}
        </nav>
      )}

      {current ? (
        <section className="overflow-hidden rounded-[var(--radius-card)] border border-ink-200/80 bg-white shadow-card" onContextMenu={undefined}>
          <header className="flex items-center justify-between gap-2 border-b border-ink-100 px-4 py-2.5 text-sm">
            <span className="truncate font-semibold text-ink-800">{current.fileName}</span>
            {narration && <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">Your teacher can read this to you</span>}
          </header>
          <div className="p-2 sm:p-3">
            <FollowingBook classId={lesson.class.id} lessonId={lesson.id} fileId={current.id} src={`/api/files/${current.id}`} title={current.fileName} watermark={session.name} track={{ lessonId: lesson.id, startPage: lesson.progress.lastPage || 1 }} hrefTemplate="/student/lessons/{lessonId}?file={fileId}" narration={narration} />
          </div>
        </section>
      ) : (
        <Empty>This lesson has no PDF yet.</Empty>
      )}

      <nav aria-label="Previous and next lesson" className="mt-6 grid gap-3 sm:grid-cols-2">
        {lesson.prev ? (
          <Link href={`/student/lessons/${lesson.prev.id}`} className="rounded-[var(--radius-card)] border border-ink-200/80 bg-white px-5 py-4 shadow-card transition hover:shadow-lift">
            <span className="text-xs font-semibold text-ink-500">Previous</span>
            <span className="mt-0.5 block truncate font-display text-[16px] text-ink-950">{lesson.prev.title}</span>
          </Link>
        ) : (
          <span />
        )}
        {lesson.next ? (
          <Link href={`/student/lessons/${lesson.next.id}`} className="rounded-[var(--radius-card)] border border-ink-200/80 bg-white px-5 py-4 text-right shadow-card transition hover:shadow-lift">
            <span className="text-xs font-semibold text-ink-500">Next</span>
            <span className="mt-0.5 block truncate font-display text-[16px] text-ink-950">{lesson.next.title}</span>
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </>
  );
}
