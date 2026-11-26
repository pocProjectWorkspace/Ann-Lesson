import { notFound } from "next/navigation";
import { requireSchoolRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { lessonInsights } from "@/lib/insights";
import { Card, Empty, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/utils";

const fmt = (ms: number | null | undefined) => (!ms ? "–" : ms >= 90_000 ? `${Math.round(ms / 60_000)} min` : `${Math.round(ms / 1000)} s`);

/** Teacher: where the class slows down or stops in one book, and who needs a hand on which page. */
export default async function LessonInsights({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSchoolRole("TEACHER");
  const { id } = await params;
  const teaches = await db.lesson.findFirst({ where: { id, subject: { class: { teachers: { some: { teacherId: session.userId } } } } }, select: { id: true } });
  if (!teaches) notFound();
  const ins = await lessonInsights(id);
  if (!ins) notFound();
  const n = ins.studentCount;
  const maxMs = Math.max(1, ...ins.pages.map((p) => p.avgMs ?? 0));

  return (
    <>
      <PageHeader crumbs={[{ href: "/teacher", label: "My classes" }, { href: `/teacher/classes/${ins.classId}`, label: ins.className }, { href: `/teacher/lessons/${ins.id}`, label: ins.title }, { label: "Page insights" }]} title={`${ins.title}: page insights`} subtitle={`${ins.opened} of ${n} opened it, ${ins.finished} finished. Time per page comes from the viewer while the book is on screen.`} />

      {ins.pageCount === 0 ? (
        <Empty>Nobody has opened this book yet. Insights appear after the first child reads it.</Empty>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Callout label="Hardest page" value={ins.hardest ? `Page ${ins.hardest}` : "Not enough data"} hint={ins.hardest ? `Children spend about ${fmt(ins.pages[ins.hardest - 1]?.avgMs)} here, more than on any other page. Worth reading aloud together or recording a read-to-me clip for it.` : "Shown once two or more children have read a page."} />
            <Callout label="Where children stop" value={ins.dropOff ? `Page ${ins.dropOff}` : "No drop-off"} hint={ins.dropOff ? `${ins.pages[ins.dropOff - 1]?.stoppedHere} children have this as their furthest page. Send it to their desks from the board, or check the page loads well on their devices.` : "Children who open the book tend to carry on through it."} />
          </div>

          <div className="mt-6">
            <Card title="Page by page" description="Dark bar: how many children reached the page. Amber bar: average time on the page. A red marker means children stopped there." padded={false}>
              <ol className="border-t border-ink-100" aria-label="Pages">
                {ins.pages.map((p) => (
                  <li key={p.page} className="grid items-center gap-x-4 gap-y-1 border-t border-ink-100 px-5 py-2.5 first:border-t-0 sm:grid-cols-[4rem_1fr_1fr_6rem]">
                    <span className="font-display text-ink-900">
                      p.{p.page}
                      {p.page === ins.hardest && <span className="ml-1 text-xs text-amber-700">hardest</span>}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-ink-600">
                      <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink-100" role="img" aria-label={`${p.reached} of ${n} reached page ${p.page}`}>
                        <span className="block h-full rounded-full bg-ink-800" style={{ width: `${n ? (p.reached / n) * 100 : 0}%` }} />
                      </span>
                      <span className="w-16 tabular-nums">{p.reached} of {n}</span>
                    </span>
                    <span className="flex items-center gap-2 text-xs text-ink-600">
                      <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink-100" role="img" aria-label={`Average ${fmt(p.avgMs)} on page ${p.page}`}>
                        <span className="block h-full rounded-full bg-amber-400" style={{ width: `${p.avgMs ? (p.avgMs / maxMs) * 100 : 0}%` }} />
                      </span>
                      <span className="w-16 tabular-nums">{fmt(p.avgMs)}</span>
                    </span>
                    <span className="text-xs sm:text-right">{p.stoppedHere > 0 && p.page < ins.pageCount ? <span className={`rounded-full px-2 py-0.5 font-semibold ${p.page === ins.dropOff ? "bg-rose-100 text-rose-800" : "bg-ink-100 text-ink-700"}`}>{p.stoppedHere} stopped</span> : null}</span>
                  </li>
                ))}
              </ol>
            </Card>
          </div>

          <div className="mt-6">
            <Card title="Each child" description="Furthest page, time in the book, and the page that took them longest compared with the class." padded={false}>
              <table className="w-full border-t border-ink-100 text-sm">
                <thead>
                  <tr className="text-left text-xs text-ink-500">
                    <th className="px-5 py-2.5 font-semibold">Child</th>
                    <th className="px-3 py-2.5 font-semibold">Progress</th>
                    <th className="px-3 py-2.5 font-semibold">Time in book</th>
                    <th className="px-3 py-2.5 font-semibold">Needs a hand on</th>
                    <th className="px-5 py-2.5 text-right font-semibold">Last read</th>
                  </tr>
                </thead>
                <tbody>
                  {ins.students.map((s) => (
                    <tr key={s.id} className="border-t border-ink-100">
                      <td className="px-5 py-2.5 font-semibold text-ink-900">{s.name}</td>
                      <td className="px-3 py-2.5 text-ink-700">{s.finished ? "Finished" : s.maxPage ? `Page ${s.maxPage} of ${ins.pageCount}, ${s.percent}%` : "Not opened"}</td>
                      <td className="px-3 py-2.5 tabular-nums text-ink-700">{fmt(s.totalMs)}</td>
                      <td className="px-3 py-2.5">{s.slowest ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Page {s.slowest.page}: {fmt(s.slowest.ms)} vs {fmt(s.slowest.classMs)}</span> : <span className="text-ink-400">–</span>}</td>
                      <td className="px-5 py-2.5 text-right text-xs text-ink-500">{s.lastViewedAt ? formatDate(s.lastViewedAt) : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        </>
      )}
    </>
  );
}

function Callout({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-ink-200/80 bg-white px-5 py-4 shadow-card">
      <div className="text-xs font-semibold text-ink-500">{label}</div>
      <div className="mt-0.5 font-display text-2xl text-ink-950">{value}</div>
      <p className="mt-1 text-sm text-ink-600">{hint}</p>
    </div>
  );
}
