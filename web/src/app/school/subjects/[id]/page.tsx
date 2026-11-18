import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSchoolRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { className } from "@/lib/data";
import { Badge, Card, Empty, Field, Input, Numeral, PageHeader, Textarea } from "@/components/ui";
import { ActionForm, InlineAction } from "@/components/forms";
import { createLesson, deleteSubject, reorderLesson, updateSubject } from "../../actions";

export default async function SubjectDetail({ params }: { params: Promise<{ id: string }> }) {
  const { schoolId } = await requireSchoolRole("SCHOOL_ADMIN");
  const { id } = await params;
  const subject = await db.subject.findFirst({
    where: { id, schoolId },
    include: { class: true, lessons: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], include: { _count: { select: { files: true, progress: true } } } } },
  });
  if (!subject) notFound();
  const classTitle = className(subject.class);
  const n = subject.lessons.length;

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/school/classes", label: "Classes" }, { href: `/school/classes/${subject.classId}`, label: classTitle }, { label: subject.name }]}
        title={subject.name}
        subtitle={`${classTitle}, ${n} lesson${n === 1 ? "" : "s"}. Students see lessons in this order, once each has a PDF.`}
        actions={<InlineAction action={deleteSubject} hidden={{ id: subject.id }} label="Delete subject" variant="danger" confirm={`Delete ${subject.name} and all its lessons and PDFs?`} />}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div>
          {n === 0 ? (
            <Empty>No lessons yet. Add the first one on the right, then upload its PDF.</Empty>
          ) : (
            <ol className="overflow-hidden rounded-[var(--radius-card)] border border-ink-200/80 bg-white shadow-card" aria-label="Lessons in order">
              {subject.lessons.map((l, i) => (
                <li key={l.id} className="flex items-center gap-4 border-t border-ink-100 px-5 py-3.5 first:border-t-0">
                  <Numeral n={i + 1} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/school/lessons/${l.id}`} className="block truncate font-display text-[17px] text-ink-950 hover:text-accent">
                      {l.title}
                    </Link>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
                      {l.description && <span className="truncate">{l.description}</span>}
                      <span>{l._count.progress} student{l._count.progress === 1 ? "" : "s"} opened</span>
                    </div>
                  </div>
                  {l._count.files === 0 ? <Badge tone="amber">No PDF</Badge> : <Badge tone="green">{l._count.files} PDF{l._count.files === 1 ? "" : "s"}</Badge>}
                  <div className="flex items-center gap-0.5" aria-label={`Reorder ${l.title}`}>
                    <InlineAction action={reorderLesson} hidden={{ id: l.id, direction: "up" }} label="↑" ariaLabel={`Move ${l.title} up`} />
                    <InlineAction action={reorderLesson} hidden={{ id: l.id, direction: "down" }} label="↓" ariaLabel={`Move ${l.title} down`} />
                  </div>
                  <Link href={`/school/lessons/${l.id}`} className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-800 hover:bg-ink-100">
                    Edit
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="space-y-6">
          <Card title="Add a lesson">
            <ActionForm action={createLesson} submitLabel="Add lesson">
              <input type="hidden" name="subjectId" value={subject.id} />
              <Field label="Lesson title">
                <Input name="title" required placeholder="Letter A: Apple" />
              </Field>
              <Field label="Description (optional)">
                <Textarea name="description" rows={3} />
              </Field>
            </ActionForm>
          </Card>
          <Card title="Rename subject">
            <ActionForm action={updateSubject} submitLabel="Save" resetOnSuccess={false}>
              <input type="hidden" name="id" value={subject.id} />
              <Field label="Subject name">
                <Input name="name" required defaultValue={subject.name} />
              </Field>
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
