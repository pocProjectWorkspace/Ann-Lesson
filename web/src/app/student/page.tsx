import Link from "next/link";
import { requireSchoolRole } from "@/lib/auth";
import { studentHome } from "@/lib/data";
import { studentGrades } from "@/lib/grades";
import { LiveBanner } from "@/components/live/live-banner";
import { Empty, ProgressBar, spineColor } from "@/components/ui";
import { now } from "@/lib/time";

function greeting(d: Date) {
  const h = d.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function StudentHome() {
  const session = await requireSchoolRole("STUDENT");
  const [home, grades] = await Promise.all([studentHome(session.userId), studentGrades(session.userId)]);
  const firstName = session.name.split(" ")[0];
  const hello = greeting(now());

  if (!home.class) {
    return (
      <>
        <h1 className="text-[30px] text-ink-950">
          {hello}, {firstName}
        </h1>
        <div className="mt-6">
          <Empty>You have not been placed in a class yet. Ask your school admin to add you to one.</Empty>
        </div>
      </>
    );
  }

  const pct = home.totals.readPercent;
  const cont = home.continueLesson;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-[15px] text-ink-500">
            {home.class.name}
            {home.class.academicYear ? `, ${home.class.academicYear}` : ""}
          </p>
          <h1 className="mt-1 text-[30px] leading-tight text-ink-950 sm:text-[36px]">
            {hello}, {firstName}
          </h1>
        </div>
        <div className="flex items-center gap-4 rounded-[var(--radius-card)] border border-ink-200/80 bg-white px-5 py-3.5 shadow-card" role="group" aria-label="Overall progress">
          <Ring pct={pct} />
          <div className="leading-tight">
            <div className="font-display text-2xl text-ink-950">
              {home.totals.learnt}
              <span className="text-ink-400"> / {home.totals.lessons}</span>
            </div>
            <div className="text-sm text-ink-500">lessons learnt, {pct}% read</div>
          </div>
        </div>
      </div>

      <LiveBanner classId={home.class.id} />

      {cont && (
        <Link href={`/student/lessons/${cont.id}`} className="mt-7 flex items-center gap-4 rounded-[var(--radius-card)] border border-accent/30 bg-accent-soft/60 px-5 py-4 transition hover:border-accent/60">
          <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-accent-fg">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-accent">Continue reading</div>
            <div className="truncate font-display text-lg text-ink-950">{cont.title}</div>
            <div className="text-sm text-ink-500">
              {cont.subjectName}
              {cont.pageCount ? ` · page ${Math.max(1, cont.lastPage)} of ${cont.pageCount}, ${cont.percent}% read` : ""}
            </div>
          </div>
        </Link>
      )}

      {grades && grades.subjects.some((s) => s.rating) && (
        <section className="mt-8 rounded-[var(--radius-card)] border border-ink-200/80 bg-white px-5 py-4 shadow-card" aria-label="My grades">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl text-ink-900">My grades</h2>
            <p className="text-sm text-ink-500">
              Overall <span className="font-semibold text-ink-900">{grades.overall}%</span>
              {grades.rank ? ` · rank ${grades.rank} of ${grades.gradedStudents}` : ""}
            </p>
          </div>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {grades.subjects.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 rounded-lg bg-paper/70 px-3.5 py-2.5 text-sm">
                <span className="truncate font-semibold text-ink-900">{s.name}</span>
                <span className="shrink-0 text-ink-600" aria-label={`${s.name}: ${s.label}`}>
                  <span className="text-accent" aria-hidden>{s.rating ? "★".repeat(s.rating) + "☆".repeat(5 - s.rating) : "☆☆☆☆☆"}</span> {s.label}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 className="mt-10 mb-4 text-xl text-ink-900">Your subjects</h2>
      {home.subjects.length === 0 ? (
        <Empty>No subjects have been published for your class yet. Check back once your teacher has added lessons.</Empty>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {home.subjects.map((s, i) => {
            const p = s.readPercent;
            return (
              <li key={s.id}>
                <Link href={`/student/subjects/${s.id}`} className="group relative flex h-full overflow-hidden rounded-[var(--radius-card)] border border-ink-200/80 bg-white shadow-card transition hover:-translate-y-0.5 hover:shadow-lift">
                  <span aria-hidden className="w-3 shrink-0" style={{ background: spineColor(i) }} />
                  <div className="flex min-w-0 flex-1 flex-col px-5 py-5">
                    <div className="font-display text-[22px] leading-tight text-ink-950">{s.name}</div>
                    <div className="mt-1 text-sm text-ink-500">{s.lessonCount === 0 ? "No lessons yet" : s.learntCount === s.lessonCount ? "All lessons learnt" : `${s.learntCount} of ${s.lessonCount} lesson${s.lessonCount === 1 ? "" : "s"} learnt, ${p}% read`}</div>
                    <div className="mt-auto pt-5">
                      <ProgressBar value={p} label={`${s.name} progress`} />
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function Ring({ pct }: { pct: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" role="img" aria-label={`${pct} percent read`}>
      <circle cx="28" cy="28" r={r} fill="none" stroke="var(--color-ink-100)" strokeWidth="6" />
      <circle cx="28" cy="28" r={r} fill="none" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} transform="rotate(-90 28 28)" />
      <text x="28" y="32" textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--color-ink-900)">
        {pct}%
      </text>
    </svg>
  );
}
