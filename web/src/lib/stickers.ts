import "server-only";
import { db } from "./db";
import { audit } from "./audit";
import { notifyUsers } from "./notify";
import type { Session } from "./auth";
import { bestStreak, currentStreak, dayString, localDay } from "./streaks";

/**
 * Stickers and streaks.
 *
 * A reading day is recorded every time the viewer reports a page, keyed by the child's
 * own calendar date, and the streak is the run of consecutive reading days ending today
 * (or yesterday, so a streak is not shown broken before the child has had the chance to
 * read). Stickers come two ways: badges the platform awards once when a milestone is
 * reached (first book, five books, a seven-day streak...), and stickers a teacher gives,
 * as often as they like, with an optional note ("Great listener"). Both land on the
 * child's shelf on their home screen.
 */

export type StickerKind = { kind: string; emoji: string; label: string; hint: string };

/** Badges the platform awards itself, in the order they usually arrive. */
export const BADGES: StickerKind[] = [
  { kind: "first-book", emoji: "📖", label: "First book", hint: "Finished reading a whole book" },
  { kind: "streak-3", emoji: "🔥", label: "3 days in a row", hint: "Read on three days running" },
  { kind: "books-5", emoji: "🏅", label: "Five books", hint: "Finished five books" },
  { kind: "streak-7", emoji: "⭐", label: "7 days in a row", hint: "Read every day for a week" },
  { kind: "pages-100", emoji: "📚", label: "100 pages", hint: "Turned a hundred pages" },
  { kind: "subject-star", emoji: "🎓", label: "Subject star", hint: "Finished every book in a subject" },
  { kind: "books-10", emoji: "🏆", label: "Ten books", hint: "Finished ten books" },
  { kind: "streak-30", emoji: "🌟", label: "30 days in a row", hint: "Read every day for a month" },
  { kind: "pages-500", emoji: "🚀", label: "500 pages", hint: "Turned five hundred pages" },
];

/** Stickers a teacher hands out. */
export const TEACHER_STICKERS: StickerKind[] = [
  { kind: "star", emoji: "🌟", label: "Star of the day", hint: "Shone today" },
  { kind: "reader", emoji: "📚", label: "Super reader", hint: "Read beautifully" },
  { kind: "listener", emoji: "👂", label: "Great listener", hint: "Listened carefully" },
  { kind: "neat", emoji: "✏️", label: "Neat work", hint: "Careful, tidy work" },
  { kind: "brave", emoji: "🦁", label: "Brave try", hint: "Had a go at something hard" },
  { kind: "kind", emoji: "💛", label: "Kind friend", hint: "Was kind to a classmate" },
  { kind: "helper", emoji: "🤝", label: "Helping hand", hint: "Helped in class" },
  { kind: "artist", emoji: "🎨", label: "Little artist", hint: "Lovely drawing" },
];

const ALL = new Map([...BADGES, ...TEACHER_STICKERS].map((s) => [s.kind, s]));
export const stickerKind = (kind: string): StickerKind => ALL.get(kind) ?? { kind, emoji: "⭐", label: kind, hint: "" };
export const isTeacherSticker = (kind: string) => TEACHER_STICKERS.some((s) => s.kind === kind);

export type StickerView = { id: string; kind: string; emoji: string; label: string; note: string | null; givenBy: string | null; createdAt: string };
export type StreakView = { current: number; best: number; readToday: boolean; days: number };

/** Count a page turn towards today's reading and return the streak as it stands. */
export async function recordReadingDay(studentId: string, clientDay: string | undefined, pageTurned: boolean) {
  const day = localDay(clientDay);
  await db.readingDay.upsert({ where: { studentId_day: { studentId, day } }, create: { studentId, day, pages: pageTurned ? 1 : 0 }, update: pageTurned ? { pages: { increment: 1 } } : {} });
  return streakOf(studentId, day);
}

export async function streakOf(studentId: string, today = dayString(new Date())): Promise<StreakView> {
  const rows = await db.readingDay.findMany({ where: { studentId }, select: { day: true }, orderBy: { day: "desc" }, take: 1000 });
  const days = rows.map((r) => r.day);
  return { current: currentStreak(days, today), best: bestStreak(days), readToday: days.includes(today), days: days.length };
}

/** Award every badge the student has now earned and not yet got. Returns the new ones. */
export async function awardBadges(studentId: string, ctx: { lessonId?: string; today?: string } = {}): Promise<StickerView[]> {
  const [progress, have, streak] = await Promise.all([
    db.lessonProgress.findMany({ where: { studentId }, select: { lessonId: true, maxPage: true, finishedAt: true, learntAt: true, confirmedAt: true } }),
    db.sticker.findMany({ where: { studentId, givenById: null }, select: { kind: true } }),
    streakOf(studentId, ctx.today),
  ]);
  const owned = new Set(have.map((s) => s.kind));
  const finished = progress.filter((p) => p.finishedAt || p.learntAt || p.confirmedAt).length;
  const pages = progress.reduce((a, p) => a + p.maxPage, 0);
  const earned: string[] = [];
  const check = (kind: string, ok: boolean) => ok && !owned.has(kind) && earned.push(kind);
  check("first-book", finished >= 1);
  check("books-5", finished >= 5);
  check("books-10", finished >= 10);
  check("pages-100", pages >= 100);
  check("pages-500", pages >= 500);
  check("streak-3", streak.best >= 3);
  check("streak-7", streak.best >= 7);
  check("streak-30", streak.best >= 30);
  if (ctx.lessonId && !owned.has("subject-star")) {
    const lesson = await db.lesson.findUnique({ where: { id: ctx.lessonId }, select: { subjectId: true } });
    if (lesson) {
      const all = await db.lesson.findMany({ where: { subjectId: lesson.subjectId, publishedAt: { not: null }, files: { some: {} } }, select: { id: true } });
      const done = new Set(progress.filter((p) => p.finishedAt || p.learntAt || p.confirmedAt).map((p) => p.lessonId));
      check("subject-star", all.length >= 2 && all.every((l) => done.has(l.id)));
    }
  }
  if (!earned.length) return [];
  const me = await db.user.findUnique({ where: { id: studentId }, select: { schoolId: true } });
  if (!me?.schoolId) return [];
  const schoolId = me.schoolId;
  const created: StickerView[] = [];
  for (const kind of earned) {
    // earnKey makes each badge once-only even if two page reports race.
    const row = await db.sticker.upsert({ where: { earnKey: `${studentId}:${kind}` }, create: { schoolId, studentId, kind, earnKey: `${studentId}:${kind}`, lessonId: ctx.lessonId ?? null }, update: {} });
    if (row.createdAt.getTime() > Date.now() - 5_000) created.push(toView({ ...row, givenBy: null }));
  }
  return created;
}

const toView = (s: { id: string; kind: string; note: string | null; createdAt: Date; givenBy: { name: string } | null }): StickerView => ({ id: s.id, kind: s.kind, ...pick(stickerKind(s.kind)), note: s.note, givenBy: s.givenBy?.name ?? null, createdAt: s.createdAt.toISOString() });
const pick = (k: StickerKind) => ({ emoji: k.emoji, label: k.label });

/** A student's shelf: streak, every sticker newest first, and the next badge within reach. */
export async function studentStickers(studentId: string) {
  const [rows, streak, progress] = await Promise.all([
    db.sticker.findMany({ where: { studentId }, include: { givenBy: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
    streakOf(studentId),
    db.lessonProgress.findMany({ where: { studentId }, select: { maxPage: true, finishedAt: true, learntAt: true, confirmedAt: true } }),
  ]);
  const owned = new Set(rows.filter((r) => !r.givenById).map((r) => r.kind));
  const finished = progress.filter((p) => p.finishedAt || p.learntAt || p.confirmedAt).length;
  const pages = progress.reduce((a, p) => a + p.maxPage, 0);
  const targets: Array<{ kind: string; have: number; need: number; unit: string }> = [
    { kind: "first-book", have: finished, need: 1, unit: "book" },
    { kind: "streak-3", have: streak.current, need: 3, unit: "day" },
    { kind: "books-5", have: finished, need: 5, unit: "book" },
    { kind: "streak-7", have: streak.current, need: 7, unit: "day" },
    { kind: "pages-100", have: pages, need: 100, unit: "page" },
    { kind: "books-10", have: finished, need: 10, unit: "book" },
    { kind: "streak-30", have: streak.current, need: 30, unit: "day" },
    { kind: "pages-500", have: pages, need: 500, unit: "page" },
  ];
  const nxt = targets.find((t) => !owned.has(t.kind));
  const next = nxt ? { ...pick(stickerKind(nxt.kind)), label: stickerKind(nxt.kind).label, have: Math.min(nxt.have, nxt.need), need: nxt.need, unit: nxt.unit } : null;
  return { streak, stickers: rows.map(toView), count: rows.length, next };
}

/** Every student of a class with their streak and stickers, for the teacher's page. */
export async function classStickers(classId: string) {
  const students = await db.user.findMany({
    where: { classId, role: "STUDENT", isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, username: true, stickers: { include: { givenBy: { select: { name: true } } }, orderBy: { createdAt: "desc" } }, readingDays: { select: { day: true }, orderBy: { day: "desc" }, take: 400 } },
  });
  const today = dayString(new Date());
  return students.map((s) => {
    const days = s.readingDays.map((d) => d.day);
    return { id: s.id, name: s.name, username: s.username, streak: { current: currentStreak(days, today), best: bestStreak(days), readToday: days.includes(today), days: days.length }, stickers: s.stickers.map(toView), count: s.stickers.length };
  });
}

/** A teacher gives one sticker kind to one or more students of a class they teach. */
export async function giveSticker(session: Pick<Session, "userId" | "name" | "schoolId">, classId: string, studentIds: string[], kind: string, note: string | null) {
  if (!isTeacherSticker(kind)) throw new Error("Unknown sticker");
  const schoolId = session.schoolId;
  if (!schoolId) throw new Error("Only school staff give stickers");
  const students = await db.user.findMany({ where: { id: { in: studentIds }, classId, role: "STUDENT" }, select: { id: true, name: true } });
  if (!students.length) return [];
  const k = stickerKind(kind);
  await db.sticker.createMany({ data: students.map((s) => ({ schoolId, studentId: s.id, kind, note, givenById: session.userId })) });
  await audit(session, { action: "sticker.give", targetType: "Class", targetId: classId, summary: `Gave ${k.emoji} ${k.label} to ${students.map((s) => s.name).join(", ")}${note ? ` (${note})` : ""}`, meta: { kind, studentIds: students.map((s) => s.id) } });
  await notifyUsers(students.map((s) => s.id), { title: `${k.emoji} You got a sticker: ${k.label}`, body: note ? `${note} · from ${session.name}` : `From ${session.name}`, href: "/student" });
  return students;
}
