import { Badge, Card, Empty } from "./ui";
import { ratingLabel } from "@/lib/grades";

type Book = NonNullable<Awaited<ReturnType<typeof import("@/lib/grades").classGradebook>>>;

const tone = (overall: number | null) => (overall === null ? "slate" : overall >= 80 ? "green" : overall >= 60 ? "accent" : overall >= 40 ? "amber" : "red") as "slate" | "green" | "accent" | "amber" | "red";

/**
 * Class ranking and subject averages, shared by the teacher's grades page and the school
 * admin's read-only view. Server component; the bars are plain CSS so they print and
 * read with assistive tech.
 */
export function GradeDashboard({ book }: { book: Book }) {
  const graded = book.students.filter((s) => s.overall !== null);
  const ungraded = book.students.filter((s) => s.overall === null);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <Card title="Class ranking" description={graded.length ? `${graded.length} of ${book.students.length} students graded, class average ${book.classAverage}%` : "No grades yet. Rate students below and the ranking appears here."} padded={false}>
        {graded.length === 0 ? (
          <div className="px-5 pb-5">
            <Empty>Nothing to rank yet.</Empty>
          </div>
        ) : (
          <ol className="divide-y divide-ink-100 border-t border-ink-100" aria-label="Students ranked by overall grade">
            {graded.map((s) => (
              <li key={s.id} className="grid items-center gap-x-4 gap-y-1 px-5 py-3 sm:grid-cols-[2.5rem_1fr_minmax(10rem,18rem)_5rem]">
                <span className="font-display text-xl text-ink-400" aria-label={`Rank ${s.rank}`}>
                  {s.rank}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-ink-900">{s.name}</span>
                  <span className="block text-xs text-ink-500">
                    {s.ratings.filter((r) => r.rating).length} of {book.subjects.length} subjects graded · {s.readPercent}% read · {s.confirmedCount} confirmed
                  </span>
                </span>
                <span className="h-2.5 w-full overflow-hidden rounded-full bg-ink-100" role="img" aria-label={`${s.name}, overall ${s.overall}%`}>
                  <span className="block h-full rounded-full bg-accent" style={{ width: `${s.overall}%` }} />
                </span>
                <span className="text-right">
                  <Badge tone={tone(s.overall)}>{s.overall}%</Badge>
                </span>
              </li>
            ))}
            {ungraded.map((s) => (
              <li key={s.id} className="grid items-center gap-x-4 px-5 py-3 text-ink-400 sm:grid-cols-[2.5rem_1fr_minmax(10rem,18rem)_5rem]">
                <span aria-hidden>–</span>
                <span className="truncate">{s.name}</span>
                <span />
                <span className="text-right text-xs">not graded</span>
              </li>
            ))}
          </ol>
        )}
      </Card>
      <Card title="Subject averages" description="Across the students graded in each subject.">
        {book.subjects.length === 0 ? (
          <Empty>No subjects.</Empty>
        ) : (
          <ul className="space-y-3">
            {book.subjects.map((s) => (
              <li key={s.id}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate font-semibold text-ink-900">{s.name}</span>
                  <span className="shrink-0 text-ink-500">{s.average === null ? "not graded" : `${s.average}% · ${ratingLabel(Math.round((s.average / 100) * 5))}`}</span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-ink-100" role="img" aria-label={`${s.name} average ${s.average ?? 0}%`}>
                  <div className="h-full rounded-full bg-ink-700" style={{ width: `${s.average ?? 0}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
