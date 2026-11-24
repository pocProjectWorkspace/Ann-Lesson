import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSchoolRole } from "@/lib/auth";
import { teacherClass } from "@/lib/data";
import { Badge, Card, Empty, LinkButton, PageHeader, ProgressBar } from "@/components/ui";

export default async function TeacherClass({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSchoolRole("TEACHER");
  const { id } = await params;
  const cls = await teacherClass(session.userId, id);
  if (!cls) notFound();
  const n = cls.studentCount;

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/teacher", label: "My classes" }, { label: cls.name }]}
        title={cls.name}
        subtitle={`${n} student${n === 1 ? "" : "s"}${cls.academicYear ? `, ${cls.academicYear}` : ""}`}
        actions={
          <>
            <LinkButton href={`/teacher/classes/${cls.id}/grades`} variant="primary">Grades and ranking</LinkButton>
            <LinkButton href={`/api/exports/progress.csv?classId=${cls.id}`}>Export progress</LinkButton>
          </>
        }
      />
      {cls.subjects.length === 0 ? (
        <Empty>No subjects have been added to this class yet.</Empty>
      ) : (
        <div className="space-y-5">
          {cls.subjects.map((s) => (
            <Card key={s.id} title={s.name} description={`${s.lessons.length} lesson${s.lessons.length === 1 ? "" : "s"}`} padded={false}>
              {s.lessons.length === 0 ? (
                <div className="px-5 pb-5">
                  <Empty>No lessons yet.</Empty>
                </div>
              ) : (
                <ol className="border-t border-ink-100" aria-label={`${s.name} lessons`}>
                  {s.lessons.map((l, i) => (
                    <li key={l.id} className="border-t border-ink-100 first:border-t-0">
                      <Link href={`/teacher/lessons/${l.id}`} className="grid items-center gap-x-4 gap-y-2 px-5 py-3.5 transition hover:bg-paper/70 sm:grid-cols-[2rem_1fr_12rem_8rem]">
                        <span className="hidden font-display text-ink-400 sm:block" aria-hidden>
                          {i + 1}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-ink-900">{l.title}</span>
                          <span className="block text-xs text-ink-500">
                            {l.viewedCount} opened, {l.finishedCount} finished reading, {l.learntCount} learnt, {l.confirmedCount} confirmed · {l.readPercent}% read on average
                          </span>
                        </span>
                        <ProgressBar value={n ? (l.confirmedCount / n) * 100 : 0} label={`${l.title} confirmed`} />
                        <span className="sm:text-right">{l.fileCount === 0 ? <Badge tone="amber">No PDF</Badge> : !l.published ? <Badge tone="amber">Draft, not yet published</Badge> : <Badge tone="slate">{n ? Math.round((l.confirmedCount / n) * 100) : 0}% confirmed</Badge>}</span>
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
