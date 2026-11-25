import { notFound } from "next/navigation";
import { requireSchoolRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge, Card, Empty, Field, Input, PageHeader, Select, Table, Td, Textarea } from "@/components/ui";
import { ActionForm, InlineAction } from "@/components/forms";
import { PdfViewer } from "@/components/pdf-viewer";
import { LessonUploadForm } from "@/components/upload-form";
import { deleteLesson, deleteLessonFile, publishLesson, updateLesson } from "../../actions";
import { formatBytes, formatDate } from "@/lib/utils";

export default async function LessonDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ file?: string }> }) {
  const { schoolId } = await requireSchoolRole("SCHOOL_ADMIN");
  const { id } = await params;
  const { file: fileParam } = await searchParams;
  const lesson = await db.lesson.findFirst({ where: { id, schoolId }, include: { subject: { include: { class: true } }, files: { orderBy: { createdAt: "asc" } } } });
  if (!lesson) notFound();
  const subjects = await db.subject.findMany({ where: { schoolId }, include: { class: true }, orderBy: [{ class: { sortOrder: "asc" } }, { sortOrder: "asc" }] });
  const classTitle = `${lesson.subject.class.name}${lesson.subject.class.section ? " " + lesson.subject.class.section : ""}`;
  const current = lesson.files.find((f) => f.id === fileParam) ?? lesson.files[0];

  return (
    <>
      <PageHeader
        crumbs={[
          { href: "/school/classes", label: "Classes" },
          { href: `/school/classes/${lesson.subject.classId}`, label: classTitle },
          { href: `/school/subjects/${lesson.subjectId}`, label: lesson.subject.name },
          { label: lesson.title },
        ]}
        title={lesson.title}
        subtitle={lesson.description ?? undefined}
        actions={
          <>
            {lesson.publishedAt ? <Badge tone="green">Published {formatDate(lesson.publishedAt)}</Badge> : <Badge tone="amber">Draft, hidden from students</Badge>}
            {lesson.publishedAt ? (
              <InlineAction action={publishLesson} hidden={{ id: lesson.id, publish: "no" }} label="Unpublish" variant="secondary" confirm={`Hide "${lesson.title}" from students again?`} />
            ) : lesson.files.length > 0 ? (
              <InlineAction action={publishLesson} hidden={{ id: lesson.id, publish: "yes" }} label="Publish to students" variant="primary" confirm={`Publish "${lesson.title}" to ${classTitle}? Students and teachers will be notified.`} />
            ) : null}
            {current && <a href={`/board/${lesson.id}?file=${current.id}`} className="rounded-full border border-ink-200 bg-white px-3.5 py-1.5 text-sm font-semibold text-ink-900 hover:bg-ink-100">Open on smart board</a>}
            <InlineAction action={deleteLesson} hidden={{ id: lesson.id }} label="Delete lesson" variant="danger" confirm={`Delete "${lesson.title}" and its PDFs?`} />
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={`PDF files (${lesson.files.length})`}>
            {lesson.files.length === 0 ? (
              <Empty>No PDF uploaded yet. Upload the book, check it opens below, then publish the lesson so students can see it.</Empty>
            ) : (
              <Table head={["File", "Size", "Uploaded", ""]}>
                {lesson.files.map((f) => (
                  <tr key={f.id} className={f.id === current?.id ? "bg-accent-soft/40" : undefined}>
                    <Td>
                      <a href={`?file=${f.id}`} className="font-semibold text-ink-900 hover:text-accent">
                        {f.fileName}
                      </a>
                    </Td>
                    <Td>{formatBytes(f.sizeBytes)}</Td>
                    <Td>{formatDate(f.createdAt)}</Td>
                    <Td className="text-right">
                      <InlineAction action={deleteLessonFile} hidden={{ id: f.id }} label="Delete" variant="danger" confirm={`Delete ${f.fileName}?`} />
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
          {current && !lesson.publishedAt && <p className="rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Review the book below. When it looks right, use <strong>Publish to students</strong> at the top. Nobody is notified until then.</p>}
          {current && <PdfViewer fileId={current.id} title={current.fileName} />}
        </div>

        <div className="space-y-6">
          <Card title="Edit lesson">
            <ActionForm action={updateLesson} submitLabel="Save changes" resetOnSuccess={false}>
              <input type="hidden" name="id" value={lesson.id} />
              <Field label="Lesson title">
                <Input name="title" required defaultValue={lesson.title} />
              </Field>
              <Field label="Description">
                <Textarea name="description" rows={3} defaultValue={lesson.description ?? ""} />
              </Field>
              <Field label="Subject" hint="Move the lesson to another subject or class.">
                <Select name="subjectId" defaultValue={lesson.subjectId}>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.class.name}
                      {s.class.section ? ` ${s.class.section}` : ""}: {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </ActionForm>
          </Card>
          <Card title="Upload PDF">
            <LessonUploadForm lessonId={lesson.id} />
          </Card>
        </div>
      </div>
    </>
  );
}
