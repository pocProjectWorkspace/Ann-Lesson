import { describe, expect, it } from "vitest";
import { median, pageStats, supportSignals, type ProgressRow } from "@/lib/insights-rules";

const now = new Date("2026-03-20T10:00:00Z");
const today = "2026-03-20";
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
const students = [
  { id: "a", name: "Aarav Mehta" },
  { id: "b", name: "Diya Sharma" },
  { id: "c", name: "Kabir Singh" },
  { id: "d", name: "Nila Krishnan" },
];
const lessons = [
  { id: "l1", title: "Letter A", subjectName: "English" },
  { id: "l2", title: "Letter B", subjectName: "English" },
  { id: "l3", title: "Numbers 1-5", subjectName: "Numbers" },
];
const row = (studentId: string, lessonId: string, maxPage: number, finished: boolean, lastDays = 0): ProgressRow => ({ studentId, lessonId, maxPage, pageCount: 10, finishedAt: finished ? daysAgo(lastDays) : null, learntAt: null, confirmedAt: null, lastViewedAt: daysAgo(lastDays) });
const activeDays = (ids: string[]) => ids.flatMap((id) => [{ studentId: id, day: "2026-03-19" }, { studentId: id, day: "2026-03-18" }]);

describe("early-support rules", () => {
  it("median handles odd, even and empty lists", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBe(0);
  });

  it("flags a child who has gone quiet while the class is reading, and one who never started", () => {
    const signals = supportSignals({ students, lessons, progress: [], dwell: [], readingDays: [...activeDays(["a", "b", "c"]), { studentId: "d", day: "2026-03-01" }], today, now });
    expect(signals.map((s) => `${s.studentId}:${s.kind}`)).toEqual(["d:quiet"]);
    expect(signals[0].detail).toMatch(/No reading in the last 7 days/);
    const never = supportSignals({ students, lessons, progress: [], dwell: [], readingDays: activeDays(["a", "b", "c"]), today, now });
    expect(never[0].detail).toMatch(/not started/);
  });

  it("stays silent when the whole class is quiet (holidays), or when the class is tiny", () => {
    expect(supportSignals({ students, lessons, progress: [], dwell: [], readingDays: [{ studentId: "a", day: "2026-03-19" }], today, now })).toEqual([]);
    expect(supportSignals({ students: students.slice(0, 1), lessons, progress: [], dwell: [], readingDays: [], today, now })).toEqual([]);
  });

  it("flags a child stuck on a book most of the class finished, pointing at the page", () => {
    const progress = [row("a", "l1", 10, true, 1), row("b", "l1", 10, true, 2), row("c", "l1", 10, true, 1), row("d", "l1", 3, false, 6)];
    const signals = supportSignals({ students, lessons, progress, dwell: [], readingDays: activeDays(["a", "b", "c", "d"]), today, now });
    const stuck = signals.find((s) => s.kind === "stuck");
    expect(stuck).toMatchObject({ studentId: "d", lessonId: "l1", page: 3 });
    expect(stuck!.detail).toMatch(/page 3 of 10 in Letter A 6 days ago/);
    // Touched yesterday: not stuck, just slower.
    const fresh = progress.map((p) => (p.studentId === "d" ? { ...p, lastViewedAt: daysAgo(1) } : p));
    expect(supportSignals({ students, lessons, progress: fresh, dwell: [], readingDays: activeDays(["a", "b", "c", "d"]), today, now }).some((s) => s.kind === "stuck")).toBe(false);
  });

  it("flags a child far behind the class median across books, once", () => {
    const progress = lessons.flatMap((l) => [row("a", l.id, 10, true), row("b", l.id, 10, true), row("c", l.id, 8, false), row("d", l.id, 1, false)]);
    const signals = supportSignals({ students, lessons, progress, dwell: [], readingDays: activeDays(["a", "b", "c", "d"]), today, now });
    const behind = signals.filter((s) => s.kind === "behind");
    expect(behind).toHaveLength(1);
    expect(behind[0]).toMatchObject({ studentId: "d" });
    expect(behind[0].detail).toMatch(/10% read across 3 books; the class is at 90%/);
  });

  it("flags a page that took one child far longer than the class, keeping only the worst page", () => {
    const dwell = [
      { studentId: "a", lessonId: "l1", page: 4, ms: 20_000 },
      { studentId: "b", lessonId: "l1", page: 4, ms: 25_000 },
      { studentId: "c", lessonId: "l1", page: 4, ms: 30_000 },
      { studentId: "d", lessonId: "l1", page: 4, ms: 120_000 },
      { studentId: "a", lessonId: "l1", page: 5, ms: 10_000 },
      { studentId: "b", lessonId: "l1", page: 5, ms: 10_000 },
      { studentId: "c", lessonId: "l1", page: 5, ms: 10_000 },
      { studentId: "d", lessonId: "l1", page: 5, ms: 50_000 },
    ];
    const signals = supportSignals({ students, lessons, progress: [], dwell, readingDays: activeDays(["a", "b", "c", "d"]), today, now });
    const slow = signals.filter((s) => s.kind === "slow-page");
    expect(slow).toHaveLength(1);
    expect(slow[0]).toMatchObject({ studentId: "d", lessonId: "l1", page: 5 });
    expect(slow[0].detail).toMatch(/50 s on page 5 of Letter A; the class takes about 10 s/);
  });

  it("builds per-page attention: reached, stopped here, average time, hardest page and drop-off", () => {
    const progress = [row("a", "l1", 10, true), row("b", "l1", 4, false), row("c", "l1", 4, false), row("d", "l1", 2, false)];
    const dwell = [
      { studentId: "a", lessonId: "l1", page: 3, ms: 60_000 },
      { studentId: "b", lessonId: "l1", page: 3, ms: 40_000 },
      { studentId: "a", lessonId: "l1", page: 1, ms: 5_000 },
      { studentId: "b", lessonId: "l1", page: 1, ms: 7_000 },
    ];
    const s = pageStats(students, progress, dwell, 10);
    expect(s.opened).toBe(4);
    expect(s.finished).toBe(1);
    expect(s.pages[3]).toMatchObject({ page: 4, reached: 3, stoppedHere: 2 });
    expect(s.pages[2].avgMs).toBe(50_000);
    expect(s.hardest).toBe(3);
    expect(s.dropOff).toBe(4);
  });
});
