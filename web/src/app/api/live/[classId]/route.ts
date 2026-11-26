import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionFromRequest, type Session } from "@/lib/auth";
import { broadcast, closeRoom, people, setState, stateOf, submissionsOf, touch } from "@/lib/live";
import { strokeSchema } from "@/lib/strokes";
import { audit } from "@/lib/audit";

/** Who may be in this class's room: its teachers, the school's admins, its students. */
export async function roomAccess(session: Session | null, classId: string) {
  if (!session?.schoolId) return null;
  const cls = await db.class.findFirst({ where: { id: classId, schoolId: session.schoolId }, select: { id: true, schoolId: true } });
  if (!cls) return null;
  if (session.role === "SCHOOL_ADMIN") return { cls, controls: true };
  if (session.role === "TEACHER") {
    const a = await db.teacherAssignment.findFirst({ where: { teacherId: session.userId, classId }, select: { id: true } });
    return a ? { cls, controls: true } : null;
  }
  if (session.role === "STUDENT") {
    const me = await db.user.findUnique({ where: { id: session.userId }, select: { classId: true } });
    return me?.classId === classId ? { cls, controls: false } : null;
  }
  return null;
}

/** GET /api/live/:classId → current room state and who is present. Polling fallback for devices without SSE. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ classId: string }> }) {
  const session = await getSessionFromRequest(req);
  const { classId } = await ctx.params;
  const access = await roomAccess(session, classId);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const state = await stateOf(classId);
  // The board and the review need every submission of the open activity; students get only their own.
  const subs = state?.activity ? await submissionsOf(state.activity.id) : [];
  const submissions = access.controls ? subs : subs.filter((s) => s.studentId === session!.userId);
  return NextResponse.json({ state, people: people(classId), submissions }, { headers: { "Cache-Control": "no-store" } });
}

const command = z.discriminatedUnion("type", [
  z.object({ type: z.literal("activity.open"), page: z.number().int().min(1).max(5000).optional(), prompt: z.string().trim().max(300).optional() }),
  z.object({ type: z.literal("activity.close") }),
  z.object({ type: z.literal("activity.submit"), activityId: z.string().uuid(), strokes: z.array(strokeSchema).max(500), done: z.boolean().optional() }),
  z.object({ type: z.literal("open"), lessonId: z.string().uuid(), fileId: z.string().uuid().optional(), page: z.number().int().min(1).optional() }),
  z.object({ type: z.literal("page"), page: z.number().int().min(1).max(5000) }),
  z.object({ type: z.literal("follow"), on: z.boolean() }),
  z.object({ type: z.literal("pick"), name: z.string().min(1).max(120).optional() }),
  z.object({ type: z.literal("close") }),
  z.object({ type: z.literal("here"), page: z.number().int().min(0).max(5000).nullable().optional() }),
  z.object({ type: z.literal("leave") }),
]);

/**
 * POST /api/live/:classId
 * Teachers and admins: open, page, follow, pick, close. Everyone: here (presence) and leave.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ classId: string }> }) {
  const session = await getSessionFromRequest(req);
  const { classId } = await ctx.params;
  const access = await roomAccess(session, classId);
  if (!access || !session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = command.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Unknown command" }, { status: 400 });
  const c = parsed.data;

  if (c.type === "here") {
    touch(classId, { id: session.userId, name: session.name, role: session.role === "STUDENT" ? "STUDENT" : "TEACHER", page: c.page ?? null });
    return NextResponse.json({ ok: true, state: await stateOf(classId) });
  }
  if (c.type === "leave") {
    const { leave } = await import("@/lib/live");
    leave(classId, session.userId);
    return NextResponse.json({ ok: true });
  }
  if (c.type === "activity.submit") {
    if (session.role !== "STUDENT") return NextResponse.json({ error: "Only students submit work" }, { status: 403 });
    const activity = await db.activity.findFirst({ where: { id: c.activityId, classId, status: "OPEN" }, select: { id: true } });
    if (!activity) return NextResponse.json({ error: "This activity is closed" }, { status: 409 });
    const where = { activityId_studentId: { activityId: activity.id, studentId: session.userId } };
    const row = await db.activitySubmission.upsert({ where, create: { activityId: activity.id, studentId: session.userId, strokes: c.strokes, done: !!c.done }, update: { strokes: c.strokes, ...(c.done !== undefined ? { done: c.done } : {}) } });
    broadcast(classId, { type: "submission", activityId: activity.id, submission: { studentId: session.userId, name: session.name, strokes: c.strokes, done: row.done, updatedAt: row.updatedAt.toISOString() } });
    return NextResponse.json({ ok: true, done: row.done });
  }
  if (!access.controls) return NextResponse.json({ error: "Only the teacher can do that" }, { status: 403 });

  if (c.type === "activity.open") {
    const current = await stateOf(classId);
    if (!current) return NextResponse.json({ error: "Open a book on the board first" }, { status: 409 });
    await db.activity.updateMany({ where: { classId, status: "OPEN" }, data: { status: "CLOSED", closedAt: new Date() } });
    const page = c.page ?? current.page;
    const a = await db.activity.create({ data: { schoolId: access.cls.schoolId, classId, lessonId: current.lessonId, fileId: current.fileId, page, prompt: c.prompt || null, teacherId: session.userId } });
    const state = await setState(classId, access.cls.schoolId, session.userId, { activityId: a.id, page });
    await audit(session, { action: "activity.open", targetType: "Activity", targetId: a.id, summary: `Sent page ${page} to the class as an activity${c.prompt ? ` (${c.prompt})` : ""}`, meta: { classId, lessonId: current.lessonId } });
    return NextResponse.json({ ok: true, state });
  }
  if (c.type === "activity.close") {
    const current = await stateOf(classId);
    if (current?.activity) {
      const count = await db.activitySubmission.count({ where: { activityId: current.activity.id } });
      await db.activity.update({ where: { id: current.activity.id }, data: { status: "CLOSED", closedAt: new Date() } });
      await audit(session, { action: "activity.close", targetType: "Activity", targetId: current.activity.id, summary: `Closed the activity on page ${current.activity.page}, ${count} submission${count === 1 ? "" : "s"}` });
    }
    const state = current ? await setState(classId, access.cls.schoolId, session.userId, { activityId: null }) : null;
    return NextResponse.json({ ok: true, state });
  }

  if (c.type === "open") {
    // Without a fileId the lesson's first book is opened (the phone remote has no file list).
    const file = await db.lessonFile.findFirst({ where: { ...(c.fileId ? { id: c.fileId } : {}), lessonId: c.lessonId, lesson: { subject: { classId } } }, orderBy: { createdAt: "asc" }, select: { id: true } });
    if (!file) return NextResponse.json({ error: "That book is not in this class" }, { status: 404 });
    const existing = await stateOf(classId);
    const state = await setState(classId, access.cls.schoolId, session.userId, { lessonId: c.lessonId, fileId: file.id, page: c.page ?? (existing?.fileId === file.id ? existing.page : 1), follow: existing?.follow ?? false });
    if (!existing) await audit(session, { action: "board.open", targetType: "Class", targetId: classId, summary: "Opened the smart board", meta: { lessonId: c.lessonId } });
    return NextResponse.json({ ok: true, state });
  }
  if (c.type === "page") return NextResponse.json({ ok: true, state: await setState(classId, access.cls.schoolId, session.userId, { page: c.page }) });
  if (c.type === "follow") {
    const state = await setState(classId, access.cls.schoolId, session.userId, { follow: c.on });
    if (state) await audit(session, { action: c.on ? "board.follow.on" : "board.follow.off", targetType: "Class", targetId: classId, summary: c.on ? "Students now follow the board" : "Students released from the board" });
    return NextResponse.json({ ok: true, state });
  }
  if (c.type === "pick") {
    // Without a name the server picks an active student of the class at random.
    let name = c.name;
    if (!name) {
      const names = (await db.user.findMany({ where: { classId, role: "STUDENT", isActive: true }, select: { name: true } })).map((s) => s.name);
      if (!names.length) return NextResponse.json({ error: "No students in this class" }, { status: 404 });
      name = names[Math.floor(Math.random() * names.length)];
    }
    broadcast(classId, { type: "pick", name });
    return NextResponse.json({ ok: true, name });
  }
  await closeRoom(classId);
  await audit(session, { action: "board.close", targetType: "Class", targetId: classId, summary: "Closed the smart board" });
  return NextResponse.json({ ok: true, state: null });
}
