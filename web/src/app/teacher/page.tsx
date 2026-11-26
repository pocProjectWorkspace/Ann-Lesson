import Link from "next/link";
import { requireSchoolRole } from "@/lib/auth";
import { teacherClasses } from "@/lib/data";
import { Empty, PageHeader, spineColor } from "@/components/ui";
import { syncSupportAlerts } from "@/lib/insights";

export default async function TeacherHome() {
  const session = await requireSchoolRole("TEACHER");
  const classes = await teacherClasses(session.userId);
  const alertCounts = new Map(await Promise.all(classes.map(async (c) => [c.id, new Set((await syncSupportAlerts(c.id)).map((a) => a.studentId)).size] as const)));

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
                  {c.lessonCount > 0 && <Spines count={c.lessonCount} percent={c.learntPercent} />}
                  <div className="mt-3 text-sm text-ink-500">{c.lessonCount && c.studentCount ? `${c.learntPercent}% of lessons learnt across the class` : "No progress yet"}</div>
                  {(alertCounts.get(c.id) ?? 0) > 0 && <div className="mt-2 inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">{alertCounts.get(c.id)} {alertCounts.get(c.id) === 1 ? "child needs" : "children need"} a hand</div>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** The class's books as spines on a shelf; the learnt share is coloured in. */
function Spines({ count, percent }: { count: number; percent: number }) {
  const n = Math.min(count, 24);
  const filled = Math.round((percent / 100) * n);
  return (
    <div className="mt-4" role="img" aria-label={`${count} lessons, ${percent}% learnt`}>
      <div className="flex items-end gap-[3px]">
        {Array.from({ length: n }, (_, i) => (
          <span key={i} className={`w-2 rounded-t-sm ${i < filled ? "bg-accent" : "bg-ink-200"}`} style={{ height: 14 + ((i * 7) % 3) * 3 }} />
        ))}
      </div>
      <div className="h-1.5 rounded-sm" style={{ background: "linear-gradient(#c58d55, #a8703f)" }} />
    </div>
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
