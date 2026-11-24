import "server-only";
import { db } from "./db";
import { className, readPercent } from "./data";

/**
 * Subject grades and class ranking.
 * A teacher rates each student per subject from 1 to 5. A student's overall grade is the
 * average of their ratings as a percentage; the class is ranked by that overall, ties
 * sharing a rank. Reading progress is shown alongside but never changes the grade.
 */

export const RATING_LABELS: Record<number, string> = { 5: "Excellent", 4: "Good", 3: "Satisfactory", 2: "Developing", 1: "Needs support" };
export const ratingLabel = (r: number | null | undefined) => (r ? RATING_LABELS[r] ?? String(r) : "Not graded");

/** Average rating as 0-100, null when nothing is graded. */
export function overallPercent(ratings: Array<number | null | undefined>) {
  const xs = ratings.filter((r): r is number => typeof r === "number" && r > 0);
  if (!xs.length) return null;
  return Math.round((xs.reduce((a, b) => a + b, 0) / xs.length / 5) * 100);
}

/** Competition ranking: equal overalls share a rank, ungraded students come last unranked. */
export function rank<T extends { overall: number | null }>(rows: T[]): Array<T & { rank: number | null }> {
  const sorted = [...rows].sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1));
  let last: number | null = null;
  let lastRank = 0;
  return sorted.map((r, i) => {
    if (r.overall === null) return { ...r, rank: null };
    if (r.overall !== last) {
      last = r.overall;
      lastRank = i + 1;
    }
    return { ...r, rank: lastRank };
  });
}

/** The gradebook of one class: subjects, every student with ratings, overall, reading and rank. */
export async function classGradebook(classId: string) {
  const cls = await db.class.findUnique({
    where: { id: classId },
    include: {
      subjects: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, grades: { select: { studentId: true, rating: true, comment: true, updatedAt: true } }, lessons: { where: { publishedAt: { not: null } }, select: { id: true } } } },
      students: { where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, username: true, progress: { select: { lessonId: true, learntAt: true, confirmedAt: true, finishedAt: true, maxPage: true, pageCount: true } } } },
    },
  });
  if (!cls) return null;
  const lessonIds = new Set(cls.subjects.flatMap((s) => s.lessons.map((l) => l.id)));
  const students = cls.students.map((st) => {
    const ratings = cls.subjects.map((s) => {
      const g = s.grades.find((x) => x.studentId === st.id);
      return { subjectId: s.id, rating: g?.rating ?? null, comment: g?.comment ?? null, updatedAt: g?.updatedAt ?? null };
    });
    const own = st.progress.filter((p) => lessonIds.has(p.lessonId));
    const readPct = lessonIds.size ? Math.round(own.reduce((a, p) => a + readPercent(p), 0) / lessonIds.size) : 0;
    return {
      id: st.id,
      name: st.name,
      username: st.username,
      ratings,
      overall: overallPercent(ratings.map((r) => r.rating)),
      readPercent: readPct,
      learntCount: own.filter((p) => p.learntAt).length,
      confirmedCount: own.filter((p) => p.confirmedAt).length,
    };
  });
  const ranked = rank(students);
  const subjects = cls.subjects.map((s) => ({
    id: s.id,
    name: s.name,
    average: overallPercent(s.grades.map((g) => g.rating)),
    gradedCount: s.grades.length,
  }));
  return {
    id: cls.id,
    name: className(cls),
    academicYear: cls.academicYear,
    lessonCount: lessonIds.size,
    subjects,
    students: ranked,
    classAverage: overallPercent(students.flatMap((s) => s.ratings.map((r) => r.rating))),
    gradedStudents: students.filter((s) => s.overall !== null).length,
  };
}

/** A student's own grades: per subject, overall, and their rank in the class. */
export async function studentGrades(userId: string) {
  const me = await db.user.findUnique({ where: { id: userId }, select: { classId: true } });
  if (!me?.classId) return null;
  const book = await classGradebook(me.classId);
  if (!book) return null;
  const mine = book.students.find((s) => s.id === userId);
  if (!mine) return null;
  return {
    subjects: book.subjects.map((s) => {
      const r = mine.ratings.find((x) => x.subjectId === s.id);
      return { id: s.id, name: s.name, rating: r?.rating ?? null, label: ratingLabel(r?.rating), comment: r?.comment ?? null, updatedAt: r?.updatedAt ?? null };
    }),
    overall: mine.overall,
    rank: mine.rank,
    classSize: book.students.length,
    gradedStudents: book.gradedStudents,
  };
}
