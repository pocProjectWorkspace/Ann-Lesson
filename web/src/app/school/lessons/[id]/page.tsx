import { notFound } from "next/navigation";
import { requireSchoolRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, Empty, Field, Input, PageHeader, Select, Table, Td, Textarea } from "@/components/ui";
import { ActionForm, InlineAction } from "@/components/forms";
import { PdfViewer } from "@/components/pdf-viewer";
import { LessonUploadForm } from "@/components/upload-form";
import { deleteLesson, deleteLessonFile, updateLesson } from "../../actions";
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
        actions={<InlineAction action={deleteLesson} hidden={{ id: lesson.id }} label="Delete lesson" variant="danger" confirm={`Delete "${lesson.title}" and its PDFs?`} />}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={`PDF files (${lesson.files.length})`}>
            {lesson.files.length === 0 ? (
              <Empty>No PDF uploaded yet. Students will not see this lesson, and will be notified when the first PDF arrives.</Empty>
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
