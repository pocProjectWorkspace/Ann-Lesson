import { addDays } from "./streaks";

/**
 * Pure rules behind page attention analytics and early-support alerts. Everything here
 * takes plain data and returns plain data, so it is unit-tested without a database and
 * the thresholds below are the whole policy.
 *
 * Thresholds (kindergarten pace, region-agnostic):
 * - quiet:     no reading day in the last 7 days while at least half the class has one
 * - stuck:     opened a book, not finished, untouched for 4 days, while 60% of the class finished it
 * - behind:    overall read % at least 30 points under the class median, over 3+ books
 * - slow-page: 3x the class median time on one page (45 s or more), with 3+ children measured
 */
export const QUIET_DAYS = 7;
export const STUCK_DAYS = 4;
export const STUCK_CLASS_SHARE = 0.6;
export const BEHIND_GAP = 30;
export const SLOW_RATIO = 3;
export const SLOW_MIN_MS = 45_000;
export const MAX_DWELL_MS = 10 * 60_000;

export type Student = { id: string; name: string };
export type LessonRef = { id: string; title: string; subjectName: string };
export type ProgressRow = { studentId: string; lessonId: string; maxPage: number; pageCount: number | null; finishedAt: Date | null; learntAt: Date | null; confirmedAt: Date | null; lastViewedAt: Date };
export type DwellRow = { studentId: string; lessonId: string; page: number; ms: number; visits?: number };
/** Time per visit, so a child who re-reads a favourite book is not mistaken for a struggling one. */
const perVisit = (d: DwellRow) => d.ms / Math.max(1, d.visits ?? 1);
export type SignalKind = "quiet" | "stuck" | "behind" | "slow-page";
export type Signal = { studentId: string; kind: SignalKind; lessonId: string | null; page: number | null; detail: string; action: string };

export const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const percentOf = (p: ProgressRow | undefined) => {
  if (!p) return 0;
  if (p.finishedAt || p.learntAt || p.confirmedAt) return 100;
  if (!p.pageCount || !p.maxPage) return 0;
  return Math.max(0, Math.min(100, Math.round((p.maxPage / p.pageCount) * 100)));
};
const done = (p: ProgressRow) => !!(p.finishedAt || p.learntAt || p.confirmedAt);
const daysBetween = (a: Date, b: Date) => Math.floor(Math.abs(b.getTime() - a.getTime()) / 86_400_000);
const fmtSec = (ms: number) => (ms >= 90_000 ? `${Math.round(ms / 60_000)} min` : `${Math.round(ms / 1000)} s`);

export type SignalInput = { students: Student[]; lessons: LessonRef[]; progress: ProgressRow[]; dwell: DwellRow[]; readingDays: { studentId: string; day: string }[]; today: string; now: Date };

/** The children who may need a hand right now, and why. At most one alert per kind per child. */
export function supportSignals({ students, lessons, progress, dwell, readingDays, today, now }: SignalInput): Signal[] {
  const out: Signal[] = [];
  if (students.length < 2) return out;
  const byLesson = new Map(lessons.map((l) => [l.id, l]));
  const prog = (sid: string, lid: string) => progress.find((p) => p.studentId === sid && p.lessonId === lid);

  // quiet
  const since = addDays(today, -QUIET_DAYS);
  const activeIds = new Set(readingDays.filter((d) => d.day > since).map((d) => d.studentId));
  const everIds = new Set(readingDays.map((d) => d.studentId));
  if (lessons.length > 0 && activeIds.size >= Math.max(2, Math.ceil(students.length / 2))) {
    for (const s of students) {
      if (activeIds.has(s.id)) continue;
      const started = everIds.has(s.id);
      out.push({ studentId: s.id, kind: "quiet", lessonId: null, page: null, detail: started ? `No reading in the last ${QUIET_DAYS} days` : "Has not started reading yet", action: started ? "Check the device works at home, and read a page together to restart the habit" : "Open a book with them on a class device so the first page is done" });
    }
  }

  // stuck
  if (students.length >= 3) {
    for (const s of students) {
      let best: { signal: Signal; at: number } | null = null;
      for (const l of lessons) {
        const rows = progress.filter((p) => p.lessonId === l.id);
        const finished = rows.filter(done).length;
        if (finished / students.length < STUCK_CLASS_SHARE) continue;
        const p = prog(s.id, l.id);
        if (!p || done(p) || daysBetween(p.lastViewedAt, now) < STUCK_DAYS) continue;
        const d = daysBetween(p.lastViewedAt, now);
        const signal: Signal = { studentId: s.id, kind: "stuck", lessonId: l.id, page: p.maxPage || null, detail: `Stopped at page ${Math.max(1, p.maxPage)}${p.pageCount ? ` of ${p.pageCount}` : ""} in ${l.title} ${d} days ago; most of the class has finished it`, action: `Sit with them on page ${Math.max(1, p.maxPage)} of ${l.title}, or send that page to their desk from the board` };
        if (!best || p.lastViewedAt.getTime() > best.at) best = { signal, at: p.lastViewedAt.getTime() };
      }
      if (best) out.push(best.signal);
    }
  }

  // behind
  if (lessons.length >= 3) {
    const overall = new Map(students.map((s) => [s.id, Math.round(lessons.reduce((a, l) => a + percentOf(prog(s.id, l.id)), 0) / lessons.length)]));
    const med = median([...overall.values()]);
    if (med >= 40) {
      for (const s of students) {
        const mine = overall.get(s.id) ?? 0;
        if (mine <= med - BEHIND_GAP) out.push({ studentId: s.id, kind: "behind", lessonId: null, page: null, detail: `${mine}% read across ${lessons.length} books; the class is at ${Math.round(med)}%`, action: "Pick one short book and read it together this week; a sticker when it is finished helps" });
      }
    }
  }

  // slow page
  const groups = new Map<string, DwellRow[]>();
  for (const d of dwell) {
    const k = `${d.lessonId}|${d.page}`;
    groups.set(k, [...(groups.get(k) ?? []), d]);
  }
  const slow = new Map<string, { signal: Signal; ratio: number }>();
  for (const rows of groups.values()) {
    if (rows.length < 3) continue;
    const med = median(rows.map(perVisit));
    if (med <= 0) continue;
    for (const r of rows) {
      const mine = perVisit(r);
      const ratio = mine / med;
      if (mine < SLOW_MIN_MS || ratio < SLOW_RATIO) continue;
      const l = byLesson.get(r.lessonId);
      if (!l) continue;
      const prev = slow.get(r.studentId);
      if (prev && prev.ratio >= ratio) continue;
      slow.set(r.studentId, { ratio, signal: { studentId: r.studentId, kind: "slow-page", lessonId: l.id, page: r.page, detail: `Spent ${fmtSec(mine)} on page ${r.page} of ${l.title}; the class takes about ${fmtSec(med)}`, action: `Ask what page ${r.page} is about, and read it to them or send it to their desk` } });
    }
  }
  for (const { signal } of slow.values()) if (students.some((s) => s.id === signal.studentId)) out.push(signal);

  return out;
}

export type PageStat = { page: number; reached: number; stoppedHere: number; avgMs: number | null; measured: number };

/** Per-page attention for one book: who got there, who stopped there, how long pages take. */
export function pageStats(students: Student[], progress: ProgressRow[], dwell: DwellRow[], pageCount: number): { pages: PageStat[]; hardest: number | null; dropOff: number | null; opened: number; finished: number } {
  const ids = new Set(students.map((s) => s.id));
  const rows = progress.filter((p) => ids.has(p.studentId));
  const pages: PageStat[] = [];
  for (let page = 1; page <= pageCount; page++) {
    const d = dwell.filter((x) => x.page === page && ids.has(x.studentId));
    pages.push({
      page,
      reached: rows.filter((p) => done(p) || p.maxPage >= page).length,
      stoppedHere: rows.filter((p) => !done(p) && p.maxPage === page).length,
      avgMs: d.length ? Math.round(d.reduce((a, x) => a + x.ms, 0) / d.length) : null,
      measured: d.length,
    });
  }
  const opened = rows.length;
  const finished = rows.filter(done).length;
  const measured = pages.filter((p) => p.measured >= 2 && p.avgMs);
  const hardest = measured.length ? measured.reduce((a, b) => ((b.avgMs ?? 0) > (a.avgMs ?? 0) ? b : a)).page : null;
  const stops = pages.filter((p) => p.stoppedHere >= 2 && p.stoppedHere >= opened * 0.2 && p.page < pageCount);
  const dropOff = stops.length ? stops.reduce((a, b) => (b.stoppedHere > a.stoppedHere ? b : a)).page : null;
  return { pages, hardest, dropOff, opened, finished };
}
