import "server-only";
import { db } from "./db";
import { className } from "./data";
import { studentGrades } from "./grades";
import { studentStickers } from "./stickers";
import { notifyUsers } from "./notify";
import { addDays, dayString } from "./streaks";

/**
 * Parent companion. A parent is a user with role PARENT linked to one or more children
 * through GuardianLink. Parents see each child's week in a glance, the book to read
 * together tonight (read-only, with the teacher's voice), stickers and grades as stars,
 * and they get told when a teacher gives a sticker or a grade. They never write a
 * child's progress: the viewer records nothing for a parent session.
 */

/** Ids of the children linked to a parent. */
export async function childIdsOf(parentId: string) {
  const links = await db.guardianLink.findMany({ where: { parentId }, select: { studentId: true } });
  return links.map((l) => l.studentId);
}

/** Whether a parent may read the books of a class, i.e. a linked child is in it. */
export async function parentMayReadClass(parentId: string, classId: string) {
  return !!(await db.guardianLink.findFirst({ where: { parentId, student: { classId } }, select: { id: true } }));
}

/** Parents of these students, for notifications. */
export async function guardiansOf(studentIds: string[]) {
  if (!studentIds.length) return [] as { parentId: string; studentId: string }[];
  return db.guardianLink.findMany({ where: { studentId: { in: studentIds }, parent: { isActive: true } }, select: { parentId: true, studentId: true } });
}

/** Tell each parent about something that happened to their child, with the child's first name in the text. */
export async function notifyGuardians(studentIds: string[], message: (childFirstName: string) => { title: string; body?: string }) {
  const links = await guardiansOf(studentIds);
  if (!links.length) return;
  const students = await db.user.findMany({ where: { id: { in: studentIds } }, select: { id: true, name: true } });
  for (const l of links) {
    const name = students.find((s) => s.id === l.studentId)?.name.split(" ")[0] ?? "Your child";
    await notifyUsers([l.parentId], { ...message(name), href: "/family" });
  }
}

export type ChildView = Awaited<ReturnType<typeof childView>>;

async function childView(studentId: string) {
  const child = await db.user.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      name: true,
      class: { select: { id: true, name: true, section: true, teachers: { select: { teacher: { select: { name: true } } } }, subjects: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { name: true, lessons: { where: { publishedAt: { not: null }, files: { some: {} } }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, title: true, files: { take: 1, orderBy: { createdAt: "asc" }, select: { id: true, fileName: true, narrations: { select: { page: true } } } } } } } } } },
      progress: { select: { lessonId: true, lastPage: true, maxPage: true, pageCount: true, finishedAt: true, learntAt: true, confirmedAt: true, lastViewedAt: true } },
      readingDays: { where: { day: { gt: addDays(dayString(new Date()), -7) } }, select: { day: true, pages: true } },
      colourings: { orderBy: { updatedAt: "desc" }, take: 3, select: { fileId: true, page: true, strokes: true, updatedAt: true, lesson: { select: { title: true } } } },
    },
  });
  if (!child) return null;
  const [shelf, grades] = await Promise.all([studentStickers(child.id), studentGrades(child.id)]);
  const lessons = child.class?.subjects.flatMap((s) => s.lessons.map((l) => ({ ...l, subjectName: s.name }))) ?? [];
  const prog = (id: string) => child.progress.find((p) => p.lessonId === id);
  const isDone = (id: string) => {
    const p = prog(id);
    return !!(p && (p.finishedAt || p.learntAt || p.confirmedAt));
  };
  const finished = lessons.filter((l) => isDone(l.id)).length;
  // Tonight's book: the one most recently opened and unfinished, else the first unread,
  // else (everything finished) the book read most recently, to read again.
  const open = lessons.filter((l) => prog(l.id) && !isDone(l.id)).sort((a, b) => prog(b.id)!.lastViewedAt.getTime() - prog(a.id)!.lastViewedAt.getTime());
  const recent = lessons.filter((l) => prog(l.id)).sort((a, b) => prog(b.id)!.lastViewedAt.getTime() - prog(a.id)!.lastViewedAt.getTime());
  const tonight = open[0] ?? lessons.find((l) => !prog(l.id)) ?? recent[0] ?? null;
  const again = !!tonight && isDone(tonight.id);
  const tp = tonight ? prog(tonight.id) : undefined;
  const pct = tp?.pageCount && tp.maxPage ? Math.min(100, Math.round((tp.maxPage / tp.pageCount) * 100)) : 0;
  return {
    id: child.id,
    name: child.name,
    firstName: child.name.split(" ")[0],
    className: child.class ? className(child.class) : null,
    teachers: child.class?.teachers.map((t) => t.teacher.name) ?? [],
    week: { days: child.readingDays.length, pages: child.readingDays.reduce((a, d) => a + d.pages, 0) },
    streak: shelf.streak,
    books: { total: lessons.length, finished },
    tonight: tonight
      ? { lessonId: tonight.id, title: tonight.title, subjectName: tonight.subjectName, fileId: tonight.files[0]?.id ?? null, lastPage: tp?.lastPage ?? 0, pageCount: tp?.pageCount ?? null, percent: pct, started: !!tp, again, readToMe: (tonight.files[0]?.narrations.length ?? 0) > 0 }
      : null,
    artwork: child.colourings.map((a) => ({ fileId: a.fileId, page: a.page, strokes: a.strokes as import("./strokes").Stroke[], title: a.lesson.title, updatedAt: a.updatedAt.toISOString() })),
    stickers: shelf.stickers.slice(0, 8),
    stickerCount: shelf.count,
    grades: grades ? { overall: grades.overall, rank: grades.showRank ? grades.rank : null, classSize: grades.classSize, subjects: grades.subjects } : null,
  };
}

/** Everything the family page shows: every linked child, in name order. */
export async function familyOverview(parentId: string) {
  const ids = await childIdsOf(parentId);
  const children = (await Promise.all(ids.map(childView))).filter((c): c is NonNullable<typeof c> => !!c);
  return children.sort((a, b) => a.name.localeCompare(b.name));
}

/** The school admin's list: every parent with their children. */
export async function familiesOf(schoolId: string) {
  const parents = await db.user.findMany({ where: { schoolId, role: "PARENT" }, orderBy: { name: "asc" }, select: { id: true, name: true, username: true, email: true, isActive: true, children: { select: { relation: true, student: { select: { id: true, name: true, username: true, class: { select: { name: true, section: true } } } } } } } });
  return parents.map((p) => ({ ...p, children: p.children.map((c) => ({ relation: c.relation, id: c.student.id, name: c.student.name, username: c.student.username, className: className(c.student.class) })) }));
}
