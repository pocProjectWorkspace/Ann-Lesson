import "server-only";
import { db } from "./db";
import { className } from "./data";
import { notifyUsers } from "./notify";
import { dayString } from "./streaks";
import { MAX_DWELL_MS, pageStats, percentOf, supportSignals, type Signal } from "./insights-rules";

/**
 * Page attention analytics and early-support alerts.
 * The viewer reports how long each page stayed on screen (PageDwell, per child and page).
 * From that and the reading progress we build a per-page picture of each book, and a
 * short list of children who may need a hand, kept in SupportAlert so a teacher is told
 * once, can mark it handled, and alerts clear themselves when the signal goes away.
 */

/** Add page time reported by the viewer. Clipped so a tablet left open does not count as an hour of attention. */
export async function recordDwell(studentId: string, lessonId: string, dwell: { page: number; ms: number }[]) {
  for (const d of dwell) {
    const ms = Math.min(MAX_DWELL_MS, Math.max(0, Math.round(d.ms)));
    if (ms < 1000) continue;
    await db.pageDwell.upsert({ where: { studentId_lessonId_page: { studentId, lessonId, page: d.page } }, create: { studentId, lessonId, page: d.page, ms, visits: 1 }, update: { ms: { increment: ms }, visits: { increment: 1 } } });
  }
}

async function classData(classId: string) {
  const cls = await db.class.findUnique({
    where: { id: classId },
    select: {
      id: true,
      name: true,
      section: true,
      schoolId: true,
      students: { where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, readingDays: { select: { day: true }, where: { day: { gt: dayString(new Date(Date.now() - 40 * 86_400_000)) } } } } },
      subjects: { select: { name: true, lessons: { where: { publishedAt: { not: null }, files: { some: {} } }, select: { id: true, title: true } } } },
      teachers: { select: { teacherId: true } },
    },
  });
  if (!cls) return null;
  const lessons = cls.subjects.flatMap((s) => s.lessons.map((l) => ({ id: l.id, title: l.title, subjectName: s.name })));
  const lessonIds = lessons.map((l) => l.id);
  const studentIds = cls.students.map((s) => s.id);
  const [progress, dwell] = await Promise.all([
    db.lessonProgress.findMany({ where: { lessonId: { in: lessonIds }, studentId: { in: studentIds } }, select: { studentId: true, lessonId: true, maxPage: true, pageCount: true, finishedAt: true, learntAt: true, confirmedAt: true, lastViewedAt: true } }),
    db.pageDwell.findMany({ where: { lessonId: { in: lessonIds }, studentId: { in: studentIds } }, select: { studentId: true, lessonId: true, page: true, ms: true, visits: true } }),
  ]);
  return { cls, lessons, progress, dwell, readingDays: cls.students.flatMap((s) => s.readingDays.map((d) => ({ studentId: s.id, day: d.day }))) };
}

export type AlertView = { id: string; studentId: string; studentName: string; kind: string; lessonId: string | null; lessonTitle: string | null; page: number | null; detail: string; action: string; createdAt: string };

const g = globalThis as unknown as { __alertSync?: Map<string, number> };
const lastSync = (g.__alertSync ??= new Map());
const SYNC_EVERY_MS = 5 * 60_000;
const HANDLED_QUIET_DAYS = 14;
const keyOf = (s: { studentId: string; kind: string; lessonId: string | null; page: number | null }) => `${s.studentId}|${s.kind}|${s.lessonId ?? ""}|${s.page ?? ""}`;

/**
 * Recompute the class's alerts (at most every few minutes), open new ones, close the
 * ones whose signal has gone, tell the class's teachers about new ones, and return
 * what is open. A teacher who marked an alert handled is not nagged about the same
 * thing again for two weeks.
 */
export async function syncSupportAlerts(classId: string, opts: { force?: boolean } = {}): Promise<AlertView[]> {
  const now = Date.now();
  const due = opts.force || (lastSync.get(classId) ?? 0) < now - SYNC_EVERY_MS;
  if (due) {
    lastSync.set(classId, now);
    const data = await classData(classId);
    if (data) {
      const { cls, lessons, progress, dwell, readingDays } = data;
      const signals = supportSignals({ students: cls.students, lessons, progress, dwell, readingDays, today: dayString(new Date()), now: new Date() });
      const open = await db.supportAlert.findMany({ where: { classId, resolvedAt: null } });
      const recentlyHandled = await db.supportAlert.findMany({ where: { classId, handledById: { not: null }, resolvedAt: { gt: new Date(now - HANDLED_QUIET_DAYS * 86_400_000) } }, select: { studentId: true, kind: true, lessonId: true, page: true } });
      const openKeys = new Set(open.map(keyOf));
      const quietKeys = new Set(recentlyHandled.map(keyOf));
      const wanted = new Map(signals.map((s) => [keyOf(s), s]));
      const fresh: Signal[] = [...wanted.values()].filter((s) => !openKeys.has(keyOf(s)) && !quietKeys.has(keyOf(s)));
      const gone = open.filter((a) => !wanted.has(keyOf(a)));
      if (gone.length) await db.supportAlert.updateMany({ where: { id: { in: gone.map((a) => a.id) } }, data: { resolvedAt: new Date() } });
      if (fresh.length) {
        await db.supportAlert.createMany({ data: fresh.map((s) => ({ schoolId: cls.schoolId, classId, studentId: s.studentId, kind: s.kind, lessonId: s.lessonId, page: s.page, detail: s.detail, action: s.action })) });
        const first = (id: string) => cls.students.find((x) => x.id === id)?.name.split(" ")[0] ?? "A child";
        const names = [...new Set(fresh.map((s) => first(s.studentId)))];
        const lines = fresh.slice(0, 3).map((s) => `${first(s.studentId)}: ${s.detail}`);
        await notifyUsers(
          cls.teachers.map((t) => t.teacherId),
          { title: `${names.length} ${names.length === 1 ? "child" : "children"} may need a hand in ${className(cls)}`, body: `${lines.join(". ")}${fresh.length > 3 ? `. And ${fresh.length - 3} more` : ""}`, href: `/teacher/classes/${classId}` },
        );
      }
    }
  }
  return openAlerts(classId);
}

export async function openAlerts(classId: string): Promise<AlertView[]> {
  const rows = await db.supportAlert.findMany({ where: { classId, resolvedAt: null }, orderBy: [{ createdAt: "desc" }], include: { student: { select: { name: true } }, lesson: { select: { title: true } } } });
  return rows.map((a) => ({ id: a.id, studentId: a.studentId, studentName: a.student.name, kind: a.kind, lessonId: a.lessonId, lessonTitle: a.lesson?.title ?? null, page: a.page, detail: a.detail, action: a.action, createdAt: a.createdAt.toISOString() }));
}

/** A teacher marks an alert handled; it closes and will not reappear for two weeks. */
export async function handleAlert(alertId: string, classId: string, teacherId: string) {
  const r = await db.supportAlert.updateMany({ where: { id: alertId, classId, resolvedAt: null }, data: { resolvedAt: new Date(), handledById: teacherId } });
  return r.count > 0;
}

/** Alerts grouped by child, for the cards. */
export function groupAlerts(alerts: AlertView[]) {
  const by = new Map<string, { studentId: string; studentName: string; alerts: AlertView[] }>();
  for (const a of alerts) {
    const g = by.get(a.studentId) ?? { studentId: a.studentId, studentName: a.studentName, alerts: [] };
    g.alerts.push(a);
    by.set(a.studentId, g);
  }
  return [...by.values()].sort((a, b) => b.alerts.length - a.alerts.length || a.studentName.localeCompare(b.studentName));
}

/** Everything the lesson insights page shows. */
export async function lessonInsights(lessonId: string) {
  const lesson = await db.lesson.findUnique({ where: { id: lessonId }, select: { id: true, title: true, subject: { select: { name: true, class: { select: { id: true, name: true, section: true, students: { where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } } } } } } } });
  if (!lesson) return null;
  const students = lesson.subject.class.students;
  const ids = students.map((s) => s.id);
  const [progress, dwell] = await Promise.all([
    db.lessonProgress.findMany({ where: { lessonId, studentId: { in: ids } }, select: { studentId: true, lessonId: true, maxPage: true, pageCount: true, finishedAt: true, learntAt: true, confirmedAt: true, lastViewedAt: true } }),
    db.pageDwell.findMany({ where: { lessonId, studentId: { in: ids } }, select: { studentId: true, lessonId: true, page: true, ms: true, visits: true } }),
  ]);
  const pageCount = Math.max(0, ...progress.map((p) => p.pageCount ?? 0), ...dwell.map((d) => d.page));
  const stats = pageStats(students, progress, dwell, pageCount);
  const medians = new Map<number, number>();
  for (const p of stats.pages) {
    const xs = dwell.filter((d) => d.page === p.page).map((d) => d.ms).sort((a, b) => a - b);
    if (xs.length >= 3) medians.set(p.page, xs[Math.floor(xs.length / 2)]);
  }
  const perStudent = students.map((s) => {
    const p = progress.find((x) => x.studentId === s.id);
    const mine = dwell.filter((d) => d.studentId === s.id);
    const totalMs = mine.reduce((a, d) => a + d.ms, 0);
    let slowest: { page: number; ms: number; classMs: number } | null = null;
    for (const d of mine) {
      const m = medians.get(d.page);
      if (m && d.ms >= 45_000 && d.ms / m >= 2 && (!slowest || d.ms / slowest.classMs < d.ms / m)) slowest = { page: d.page, ms: d.ms, classMs: m };
    }
    return { id: s.id, name: s.name, percent: percentOf(p), maxPage: p?.maxPage ?? 0, finished: !!(p && (p.finishedAt || p.learntAt || p.confirmedAt)), lastViewedAt: p?.lastViewedAt.toISOString() ?? null, totalMs, slowest };
  });
  return { id: lesson.id, title: lesson.title, subjectName: lesson.subject.name, classId: lesson.subject.class.id, className: className(lesson.subject.class), studentCount: students.length, pageCount, ...stats, students: perStudent };
}
