import "server-only";
import { db } from "./db";

/* ---------------- Formatting shared by every page and API ---------------- */

export const className = (c: { name: string; section: string | null } | null | undefined) => (c ? `${c.name}${c.section ? " " + c.section : ""}` : "");

export type ProgressState = "none" | "viewed" | "finished" | "learnt" | "confirmed";
type ProgressRow = { learntAt: Date | null; confirmedAt: Date | null; finishedAt?: Date | null; maxPage?: number; lastPage?: number; pageCount?: number | null };
export function progressState(p: ProgressRow | null | undefined): ProgressState {
  if (!p) return "none";
  if (p.confirmedAt) return "confirmed";
  if (p.learntAt) return "learnt";
  if (p.finishedAt) return "finished";
  return "viewed";
}
/** Share of the book reached, 0-100. A finished, learnt or confirmed lesson always counts as 100. */
export function readPercent(p: ProgressRow | null | undefined): number {
  if (!p) return 0;
  if (p.confirmedAt || p.learntAt || p.finishedAt) return 100;
  if (!p.pageCount || !p.maxPage) return 0;
  return Math.max(0, Math.min(100, Math.round((p.maxPage / p.pageCount) * 100)));
}
/** The fields every lesson summary exposes about the student's own progress. */
function ownProgress(p: (ProgressRow & { lastViewedAt?: Date }) | null | undefined) {
  return {
    viewed: !!p,
    learnt: !!p?.learntAt,
    confirmed: !!p?.confirmedAt,
    finished: !!p?.finishedAt,
    percent: readPercent(p),
    lastPage: p?.lastPage ?? 0,
    pageCount: p?.pageCount ?? null,
    state: progressState(p),
  };
}
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

const lessonOrder = [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }];
/** What a student may see: the admin has published it and it still has a PDF. */
const visibleToStudents = { publishedAt: { not: null }, files: { some: {} } } as const;
const subjectOrder = [{ sortOrder: "asc" as const }, { name: "asc" as const }];

/* ---------------- Student ---------------- */

/** Everything the student home needs: class, subjects, published lessons and own progress. */
export async function studentHome(userId: string) {
  const me = await db.user.findUnique({
    where: { id: userId },
    include: {
      class: {
        include: {
          subjects: {
            orderBy: subjectOrder,
            include: {
              lessons: {
                where: visibleToStudents,
                orderBy: lessonOrder,
                include: { _count: { select: { files: true } }, files: { take: 1, orderBy: { createdAt: "asc" }, select: { id: true } }, progress: { where: { studentId: userId } } },
              },
            },
          },
        },
      },
    },
  });
  const cls = me?.class ?? null;
  const subjects = (cls?.subjects ?? []).map((s) => {
    const lessons = s.lessons.map((l) => {
      const p = l.progress[0];
      return { id: l.id, title: l.title, description: l.description, fileCount: l._count.files, fileId: l.files[0]?.id ?? null, ...ownProgress(p), lastViewedAt: p?.lastViewedAt ?? null };
    });
    return { id: s.id, name: s.name, lessonCount: lessons.length, learntCount: lessons.filter((l) => l.learnt).length, readPercent: avg(lessons.map((l) => l.percent)), lessons };
  });
  const allLessons = subjects.flatMap((s) => s.lessons.map((l) => ({ ...l, subjectId: s.id, subjectName: s.name })));
  // "Continue reading": the most recently opened lesson that is not learnt yet, preferring
  // one the student has not finished over one they reached the end of.
  const continueLesson = allLessons
    .filter((l) => l.viewed && !l.learnt && l.lastViewedAt)
    .sort((a, b) => Number(a.finished) - Number(b.finished) || +new Date(b.lastViewedAt!) - +new Date(a.lastViewedAt!))[0] ?? null;
  return {
    class: cls ? { id: cls.id, name: className(cls), academicYear: cls.academicYear } : null,
    subjects,
    totals: { lessons: allLessons.length, learnt: allLessons.filter((l) => l.learnt).length, readPercent: avg(allLessons.map((l) => l.percent)) },
    continueLesson,
  };
}

/** One subject for a student, with published lessons and own progress. Null if not in their class. */
export async function studentSubject(userId: string, subjectId: string) {
  const me = await db.user.findUnique({ where: { id: userId }, select: { classId: true } });
  if (!me?.classId) return null;
  const subject = await db.subject.findFirst({
    where: { id: subjectId, classId: me.classId },
    include: { class: true, lessons: { where: visibleToStudents, orderBy: lessonOrder, include: { progress: { where: { studentId: userId } }, _count: { select: { files: true } }, files: { take: 1, orderBy: { createdAt: "asc" }, select: { id: true } } } } },
  });
  if (!subject) return null;
  const lessons = subject.lessons.map((l) => {
    const p = l.progress[0];
    return { id: l.id, title: l.title, description: l.description, fileCount: l._count.files, fileId: l.files[0]?.id ?? null, ...ownProgress(p) };
  });
  return { id: subject.id, name: subject.name, class: { id: subject.class.id, name: className(subject.class) }, lessonCount: lessons.length, learntCount: lessons.filter((l) => l.learnt).length, readPercent: avg(lessons.map((l) => l.percent)), lessons };
}

/* ---------------- Teacher ---------------- */

/** Classes assigned to a teacher with counts and an overall learnt percentage. */
export async function teacherClasses(teacherId: string) {
  const rows = await db.teacherAssignment.findMany({
    where: { teacherId },
    orderBy: { class: { sortOrder: "asc" } },
    include: {
      class: {
        include: {
          _count: { select: { students: true, subjects: true } },
          subjects: { select: { lessons: { select: { _count: { select: { progress: true } }, progress: { where: { learntAt: { not: null } }, select: { id: true } } } } } },
        },
      },
    },
  });
  return rows.map(({ class: c }) => {
    const lessons = c.subjects.flatMap((s) => s.lessons);
    const possible = lessons.length * c._count.students;
    const learnt = lessons.reduce((n, l) => n + l.progress.length, 0);
    return { id: c.id, name: className(c), academicYear: c.academicYear, studentCount: c._count.students, subjectCount: c._count.subjects, lessonCount: lessons.length, learntPercent: possible ? Math.round((learnt / possible) * 100) : 0 };
  });
}

/** A class as a teacher sees it: subjects, lessons, class-wide counts. Null if not assigned. */
export async function teacherClass(teacherId: string, classId: string) {
  const a = await db.teacherAssignment.findFirst({
    where: { teacherId, classId },
    include: {
      class: {
        include: {
          _count: { select: { students: true } },
          subjects: { orderBy: subjectOrder, include: { lessons: { orderBy: lessonOrder, include: { _count: { select: { files: true, progress: true } }, progress: { select: { learntAt: true, confirmedAt: true, finishedAt: true, maxPage: true, pageCount: true } } } } } },
        },
      },
    },
  });
  if (!a) return null;
  const c = a.class;
  return {
    id: c.id,
    name: className(c),
    academicYear: c.academicYear,
    studentCount: c._count.students,
    subjects: c.subjects.map((s) => ({
      id: s.id,
      name: s.name,
      lessons: s.lessons.map((l) => ({
        id: l.id,
        title: l.title,
        description: l.description,
        fileCount: l._count.files,
        published: !!l.publishedAt,
        viewedCount: l._count.progress,
        finishedCount: l.progress.filter((p) => p.finishedAt || p.learntAt || p.confirmedAt).length,
        learntCount: l.progress.filter((p) => p.learntAt).length,
        confirmedCount: l.progress.filter((p) => p.confirmedAt).length,
        // Average reading progress across the class; students who never opened it count as 0.
        readPercent: c._count.students ? Math.round(l.progress.reduce((a, p) => a + readPercent(p), 0) / c._count.students) : 0,
      })),
    })),
  };
}

/* ---------------- Lesson detail (both roles) ---------------- */

export async function lessonForUser(user: { id: string; role: "STUDENT" | "TEACHER"; schoolId: string }, lessonId: string) {
  const lesson = await db.lesson.findFirst({
    where: { id: lessonId, schoolId: user.schoolId },
    include: {
      subject: { include: { class: { include: { students: { orderBy: { name: "asc" }, select: { id: true, name: true, username: true } } } } } },
      files: { orderBy: { createdAt: "asc" } },
      progress: true,
    },
  });
  if (!lesson) return null;
  const cls = lesson.subject.class;
  if (user.role === "STUDENT") {
    const me = await db.user.findUnique({ where: { id: user.id }, select: { classId: true } });
    if (me?.classId !== cls.id) return null;
  } else {
    const teaches = await db.teacherAssignment.findFirst({ where: { teacherId: user.id, classId: cls.id }, select: { id: true } });
    if (!teaches) return null;
  }
  if (user.role === "STUDENT" && (!lesson.publishedAt || lesson.files.length === 0)) return null; // drafts are staff-only
  const siblings = await db.lesson.findMany({ where: { subjectId: lesson.subjectId, ...(user.role === "STUDENT" ? visibleToStudents : {}) }, orderBy: lessonOrder, select: { id: true, title: true } });
  const idx = siblings.findIndex((l) => l.id === lesson.id);
  const byStudent = new Map(lesson.progress.map((p) => [p.studentId, p]));
  const own = byStudent.get(user.id) ?? null;
  return {
    id: lesson.id,
    title: lesson.title,
    description: lesson.description,
    published: !!lesson.publishedAt,
    subject: { id: lesson.subjectId, name: lesson.subject.name },
    class: { id: cls.id, name: className(cls) },
    files: lesson.files,
    prev: idx > 0 ? siblings[idx - 1] : null,
    next: idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null,
    position: idx + 1,
    progress: { ...ownProgress(own), learntAt: own?.learntAt ?? null, lastViewedAt: own?.lastViewedAt ?? null, confirmedAt: own?.confirmedAt ?? null, finishedAt: own?.finishedAt ?? null },
    students: cls.students.map((s) => {
      const p = byStudent.get(s.id);
      return { id: s.id, name: s.name, username: s.username, viewedAt: p?.lastViewedAt ?? null, learntAt: p?.learntAt ?? null, confirmedAt: p?.confirmedAt ?? null, finishedAt: p?.finishedAt ?? null, percent: readPercent(p), state: progressState(p) };
    }),
  };
}
