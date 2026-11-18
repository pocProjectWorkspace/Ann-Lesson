import "server-only";
import { db } from "./db";
import { sendPush } from "./push";

export async function notifyUsers(userIds: string[], input: { title: string; body?: string; href?: string }) {
  if (userIds.length === 0) return;
  await db.notification.createMany({ data: userIds.map((userId) => ({ userId, title: input.title, body: input.body, href: input.href })) });
  sendPush(userIds, { title: input.title, body: input.body, data: { href: input.href } });
}

/** Tell every student in the lesson's class that it is available. Called when a lesson gets its first PDF. */
export async function notifyLessonPublished(lessonId: string) {
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    include: { subject: { include: { class: { include: { students: { select: { id: true } }, teachers: { select: { teacherId: true } } } } } } },
  });
  if (!lesson) return;
  const cls = lesson.subject.class;
  const clsName = `${cls.name}${cls.section ? " " + cls.section : ""}`;
  await Promise.all([
    notifyUsers(cls.students.map((s) => s.id), { title: `New lesson in ${lesson.subject.name}`, body: lesson.title, href: `/student/lessons/${lesson.id}` }),
    notifyUsers(cls.teachers.map((t) => t.teacherId), { title: `New lesson published for ${clsName}`, body: `${lesson.subject.name}: ${lesson.title}`, href: `/teacher/lessons/${lesson.id}` }),
  ]);
}

/**
 * Remove notifications that point at lessons or classes which no longer exist,
 * so nobody taps through to a 404. Call before deleting the rows themselves.
 */
export async function removeNotificationsFor(target: { lessonIds?: string[]; classIds?: string[] }) {
  const hrefs = [
    ...(target.lessonIds ?? []).flatMap((id) => [`/student/lessons/${id}`, `/teacher/lessons/${id}`]),
    ...(target.classIds ?? []).flatMap((id) => [`/teacher/classes/${id}`, `/school/classes/${id}`]),
  ];
  if (hrefs.length === 0) return;
  await db.notification.deleteMany({ where: { href: { in: hrefs } } });
}

export async function unreadCount(userId: string) {
  return db.notification.count({ where: { userId, readAt: null } });
}
