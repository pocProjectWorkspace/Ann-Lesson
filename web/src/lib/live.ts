import "server-only";
import { db } from "./db";

/**
 * Live classroom rooms. One room per class. The board, the teacher's phone and the
 * students' devices subscribe to a room over server-sent events and send commands
 * with ordinary POSTs. Room state (what the board shows, whether students follow)
 * lives in the LiveSession table; who is connected and on which page lives in memory.
 *
 * Fan-out is per process. With one app instance, which is the current deployment,
 * every subscriber sees every event; with several instances a shared bus (Redis)
 * would be needed, and the clients already fall back to polling the state endpoint.
 */

export type LiveActivity = { id: string; lessonId: string; fileId: string; page: number; prompt: string | null; createdAt: string };
export type LiveState = { lessonId: string; fileId: string; page: number; follow: boolean; teacherId: string; updatedAt: string; activity: LiveActivity | null } | null;
export type Submission = { studentId: string; name: string; strokes: unknown; done: boolean; updatedAt: string };
export type Presence = { id: string; name: string; role: "STUDENT" | "TEACHER"; page: number | null; at: number };
export type LiveEvent =
  | { type: "state"; state: LiveState }
  | { type: "presence"; people: Presence[] }
  | { type: "pick"; name: string }
  | { type: "submission"; activityId: string; submission: Submission }
  | { type: "ping" };

type Subscriber = (event: LiveEvent) => void;
/** Who is listening: a student sees only their own submission events; staff see everything. */
type Listener = { fn: Subscriber; userId: string; controls: boolean };
type Room = { subscribers: Set<Listener>; presence: Map<string, Presence> };

const g = globalThis as unknown as { __liveRooms?: Map<string, Room> };
const rooms = (g.__liveRooms ??= new Map<string, Room>());
const room = (classId: string) => {
  let r = rooms.get(classId);
  if (!r) {
    r = { subscribers: new Set(), presence: new Map() };
    rooms.set(classId, r);
  }
  return r;
};

const PRESENCE_TTL_MS = 45_000;

export function subscribe(classId: string, fn: Subscriber, who: { userId: string; controls: boolean }) {
  const r = room(classId);
  const l: Listener = { fn, ...who };
  r.subscribers.add(l);
  return () => {
    r.subscribers.delete(l);
  };
}

/** Whether a listener may see an event. Children's work goes to staff and to its author only. */
export const canSee = (event: LiveEvent, who: { userId: string; controls: boolean }) => event.type !== "submission" || who.controls || event.submission.studentId === who.userId;

export function broadcast(classId: string, event: LiveEvent) {
  for (const l of room(classId).subscribers) {
    if (!canSee(event, l)) continue;
    try {
      l.fn(event);
    } catch {
      /* a dead stream; it is removed when its request aborts */
    }
  }
}

/** Who is in the room right now, dropping anyone silent for longer than the TTL. */
export function people(classId: string): Presence[] {
  const r = room(classId);
  const cutoff = Date.now() - PRESENCE_TTL_MS;
  for (const [id, p] of r.presence) if (p.at < cutoff) r.presence.delete(id);
  return [...r.presence.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function touch(classId: string, p: Omit<Presence, "at">) {
  room(classId).presence.set(p.id, { ...p, at: Date.now() });
  broadcast(classId, { type: "presence", people: people(classId) });
}

export function leave(classId: string, userId: string) {
  if (room(classId).presence.delete(userId)) broadcast(classId, { type: "presence", people: people(classId) });
}

async function activityOf(activityId: string | null): Promise<LiveActivity | null> {
  if (!activityId) return null;
  const a = await db.activity.findUnique({ where: { id: activityId } });
  return a && a.status === "OPEN" ? { id: a.id, lessonId: a.lessonId, fileId: a.fileId, page: a.page, prompt: a.prompt, createdAt: a.createdAt.toISOString() } : null;
}

export async function stateOf(classId: string): Promise<LiveState> {
  const s = await db.liveSession.findUnique({ where: { classId } });
  return s ? { lessonId: s.lessonId, fileId: s.fileId, page: s.page, follow: s.follow, teacherId: s.teacherId, updatedAt: s.updatedAt.toISOString(), activity: await activityOf(s.activityId) } : null;
}

/** Every submission of an activity, for the board wall and the review page. */
export async function submissionsOf(activityId: string): Promise<Submission[]> {
  const rows = await db.activitySubmission.findMany({ where: { activityId }, include: { student: { select: { name: true } } }, orderBy: { updatedAt: "asc" } });
  return rows.map((r) => ({ studentId: r.studentId, name: r.student.name, strokes: r.strokes, done: r.done, updatedAt: r.updatedAt.toISOString() }));
}

/** Write new room state and tell everyone. */
export async function setState(classId: string, schoolId: string, teacherId: string, patch: { lessonId?: string; fileId?: string; page?: number; follow?: boolean; activityId?: string | null }) {
  const existing = await db.liveSession.findUnique({ where: { classId } });
  if (!existing && (!patch.lessonId || !patch.fileId)) return null;
  const s = existing
    ? await db.liveSession.update({ where: { classId }, data: { ...patch, teacherId } })
    : await db.liveSession.create({ data: { classId, schoolId, teacherId, lessonId: patch.lessonId!, fileId: patch.fileId!, page: patch.page ?? 1, follow: patch.follow ?? false } });
  const state: LiveState = { lessonId: s.lessonId, fileId: s.fileId, page: s.page, follow: s.follow, teacherId: s.teacherId, updatedAt: s.updatedAt.toISOString(), activity: await activityOf(s.activityId) };
  broadcast(classId, { type: "state", state });
  return state;
}

export async function closeRoom(classId: string) {
  await db.activity.updateMany({ where: { classId, status: "OPEN" }, data: { status: "CLOSED", closedAt: new Date() } });
  await db.liveSession.deleteMany({ where: { classId } });
  broadcast(classId, { type: "state", state: null });
}

/** Encode one SSE frame. */
export const sseFrame = (event: LiveEvent) => `data: ${JSON.stringify(event)}\n\n`;
