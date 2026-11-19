import { notFound } from "next/navigation";
import { requireSchoolRole } from "@/lib/auth";
import { lessonForUser } from "@/lib/data";
import { Badge, Card, Empty, LinkButton, PageHeader, ProgressBar, Table, Td } from "@/components/ui";
import { InlineAction } from "@/components/forms";
import { PdfViewer } from "@/components/pdf-viewer";
import { confirmAllLearnt, confirmLearnt } from "../../actions";
import { formatDate } from "@/lib/utils";

export default async function TeacherLesson({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ file?: string }> }) {
  const session = await requireSchoolRole("TEACHER");
  const { id } = await params;
  const { file: fileParam } = await searchParams;
  const lesson = await lessonForUser({ id: session.userId, role: "TEACHER", schoolId: session.schoolId }, id);
  if (!lesson) notFound();

  const current = lesson.files.find((f) => f.id === fileParam) ?? lesson.files[0];
  const n = lesson.students.length;
  const opened = lesson.students.filter((s) => s.state !== "none").length;
  const learnt = lesson.students.filter((s) => s.learntAt).length;
  const confirmed = lesson.students.filter((s) => s.confirmedAt).length;
  const pending = learnt - confirmed;

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/teacher", label: "My classes" }, { href: `/teacher/classes/${lesson.class.id}`, label: lesson.class.name }, { label: lesson.subject.name }]}
        title={lesson.title}
        subtitle={lesson.description ?? undefined}
        actions={<LinkButton href={`/api/exports/progress.csv?classId=${lesson.class.id}`}>Export class progress</LinkButton>}
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <div className="space-y-4">
          {lesson.files.length > 1 && (
            <nav aria-label="Files" className="flex flex-wrap gap-2">
              {lesson.files.map((f) => (
                <a key={f.id} href={`?file=${f.id}`} aria-current={f.id === current?.id ? "true" : undefined} className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${f.id === current?.id ? "bg-accent text-accent-fg" : "border border-ink-200 bg-white text-ink-700"}`}>
                  {f.fileName}
                </a>
              ))}
            </nav>
          )}
          {current ? <PdfViewer fileId={current.id} title={current.fileName} restricted viewerName={session.name} /> : <Empty>No PDF has been uploaded for this lesson yet.</Empty>}
        </div>
        <Card title="Who has read it" description={n ? `${confirmed} confirmed, ${learnt} marked learnt, ${opened} opened, of ${n}` : undefined} actions={pending > 0 ? <InlineAction action={confirmAllLearnt} hidden={{ lessonId: lesson.id }} label={`Confirm ${pending}`} variant="primary" /> : undefined}>
          {n > 0 && <ProgressBar value={(confirmed / n) * 100} className="mb-4" label="Confirmed share of class" />}
          {n === 0 ? (
            <Empty>No students in this class.</Empty>
          ) : (
            <Table head={["Student", "Status", "Action"]} caption={`Progress of ${n} students on ${lesson.title}`}>
              {lesson.students.map((s) => (
                <tr key={s.id}>
                  <Td>
                    <div className="font-semibold text-ink-900">{s.name}</div>
                    <div className="text-xs text-ink-500">{s.viewedAt ? `Opened ${formatDate(s.viewedAt)}` : "Not opened"}</div>
                  </Td>
                  <Td>
                    {s.state === "confirmed" && <Badge tone="green">Confirmed {formatDate(s.confirmedAt)}</Badge>}
                    {s.state === "learnt" && <Badge tone="accent">Says learnt</Badge>}
                    {s.state === "finished" && <Badge tone="accent">Finished reading</Badge>}
                    {s.state === "viewed" && <Badge>{s.percent ? `Reading, ${s.percent}%` : "Opened"}</Badge>}
                    {s.state === "none" && <Badge tone="amber">Not yet</Badge>}
                  </Td>
                  <Td className="text-right">
                    {s.state === "confirmed" ? (
                      <InlineAction action={confirmLearnt} hidden={{ lessonId: lesson.id, studentId: s.id, confirm: "no" }} label="Undo" ariaLabel={`Undo confirmation for ${s.name}`} />
                    ) : (
                      <InlineAction action={confirmLearnt} hidden={{ lessonId: lesson.id, studentId: s.id, confirm: "yes" }} label="Confirm" variant="secondary" ariaLabel={`Confirm ${s.name} has learnt this lesson`} />
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          )}
          <p className="mt-3 text-xs text-ink-500">Confirming records that you checked the student has learnt this lesson, for example through classwork or a quick question. Students cannot undo a confirmed lesson.</p>
        </Card>
      </div>
    </>
  );
}
