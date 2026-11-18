import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSchoolRole } from "@/lib/auth";
import { studentSubject } from "@/lib/data";
import { Badge, Empty, Numeral, PageHeader, ProgressBar } from "@/components/ui";

export default async function StudentSubject({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSchoolRole("STUDENT");
  const { id } = await params;
  const subject = await studentSubject(session.userId, id);
  if (!subject) notFound();
  const { lessonCount: total, learntCount: done } = subject;

  return (
    <>
      <PageHeader crumbs={[{ href: "/student", label: "My subjects" }, { label: subject.name }]} title={subject.name} subtitle={total === 0 ? "No lessons yet" : `${done} of ${total} lesson${total === 1 ? "" : "s"} learnt`} />
      {total > 0 && <ProgressBar value={(done / total) * 100} className="mb-6 max-w-md" label={`${subject.name} progress`} />}
      {total === 0 ? (
        <Empty>No lessons have been published in this subject yet.</Empty>
      ) : (
        <ol className="overflow-hidden rounded-[var(--radius-card)] border border-ink-200/80 bg-white shadow-card" aria-label="Lessons">
          {subject.lessons.map((l, i) => (
            <li key={l.id} className="border-t border-ink-100 first:border-t-0">
              <Link href={`/student/lessons/${l.id}`} className="flex items-center gap-4 px-5 py-4 transition hover:bg-paper/70">
                <Numeral n={i + 1} done={l.learnt} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-[17px] text-ink-950">{l.title}</span>
                  {l.description && <span className="mt-0.5 block truncate text-sm text-ink-500">{l.description}</span>}
                </span>
                {l.state === "confirmed" ? <Badge tone="green">Confirmed</Badge> : l.state === "learnt" ? <Badge tone="green">Learnt</Badge> : l.state === "viewed" ? <Badge tone="accent">In progress</Badge> : <Badge>New</Badge>}
              </Link>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
