import Link from "next/link";
import { requireSchoolRole } from "@/lib/auth";
import { teacherClasses } from "@/lib/data";
import { Empty, PageHeader, spineColor } from "@/components/ui";

export default async function TeacherHome() {
  const session = await requireSchoolRole("TEACHER");
  const classes = await teacherClasses(session.userId);

  return (
    <>
      <PageHeader title={`Welcome, ${session.name.split(" ")[0]}`} subtitle="The classes your school has assigned to you." />
      {classes.length === 0 ? (
        <Empty>You have not been assigned to any class yet. Ask your school admin.</Empty>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {classes.map((c, i) => (
            <li key={c.id}>
              <Link href={`/teacher/classes/${c.id}`} className="group flex h-full overflow-hidden rounded-[var(--radius-card)] border border-ink-200/80 bg-white shadow-card transition hover:-translate-y-0.5 hover:shadow-lift">
                <span aria-hidden className="w-3 shrink-0" style={{ background: spineColor(i) }} />
                <div className="flex-1 px-5 py-5">
                  <div className="font-display text-[22px] leading-tight text-ink-950">{c.name}</div>
                  {c.academicYear && <div className="text-sm text-ink-500">{c.academicYear}</div>}
                  <dl className="mt-4 grid grid-cols-3 gap-2">
                    <Stat label="Subjects" value={c.subjectCount} />
                    <Stat label="Lessons" value={c.lessonCount} />
                    <Stat label="Students" value={c.studentCount} />
                  </dl>
                  <div className="mt-4 text-sm text-ink-500">{c.lessonCount && c.studentCount ? `${c.learntPercent}% of lessons learnt across the class` : "No progress yet"}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className="font-display text-xl text-ink-950">{value}</dd>
    </div>
  );
}
