import { notFound } from "next/navigation";
import { requireSchoolRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { lessonForUser } from "@/lib/data";
import { Empty, PageHeader } from "@/components/ui";
import { StrokeThumb } from "@/components/live/stroke-thumb";
import { formatDate } from "@/lib/utils";
import type { Stroke } from "@/app/board/actions";

/** Teacher: every page the children have coloured in this lesson's books, newest first. */
export default async function LessonGallery({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSchoolRole("TEACHER");
  const { id } = await params;
  const lesson = await lessonForUser({ id: session.userId, role: "TEACHER", schoolId: session.schoolId }, id);
  if (!lesson) notFound();
  const rows = await db.pageColouring.findMany({ where: { lessonId: id }, include: { student: { select: { name: true } } }, orderBy: [{ updatedAt: "desc" }], take: 200 });
  const byStudent = new Map<string, typeof rows>();
  for (const r of rows) byStudent.set(r.student.name, [...(byStudent.get(r.student.name) ?? []), r]);

  return (
    <>
      <PageHeader crumbs={[{ href: "/teacher", label: "My classes" }, { href: `/teacher/classes/${lesson.class.id}`, label: lesson.class.name }, { href: `/teacher/lessons/${lesson.id}`, label: lesson.title }, { label: "Gallery" }]} title={`${lesson.title}: gallery`} subtitle={`${rows.length} coloured page${rows.length === 1 ? "" : "s"} by ${byStudent.size} ${byStudent.size === 1 ? "child" : "children"}. Children colour from the Colour button in the book; it saves on its own.`} />
      {rows.length === 0 ? (
        <Empty>Nothing coloured yet. When a child presses Colour on a page of this book and fills it in, it appears here.</Empty>
      ) : (
        <div className="space-y-6">
          {[...byStudent.entries()].map(([name, items]) => (
            <section key={name} aria-label={name}>
              <h2 className="mb-2 font-display text-xl text-ink-950">
                {name} <span className="text-base text-ink-400">· {items.length}</span>
              </h2>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {items.map((r) => (
                  <li key={r.id} className="overflow-hidden rounded-xl border border-ink-200/80 bg-white shadow-card">
                    <StrokeThumb src={`/api/files/${r.fileId}`} page={r.page} strokes={r.strokes as Stroke[]} width={240} className="w-full" />
                    <div className="flex items-center justify-between px-2.5 py-1.5 text-xs text-ink-600">
                      <span className="font-semibold text-ink-900">Page {r.page}</span>
                      <span>{formatDate(r.updatedAt)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
