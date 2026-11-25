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

export type LiveState = { lessonId: string; fileId: string; page: number; follow: boolean; teacherId: string; updatedAt: string } | null;
export type Presence = { id: string; name: string; role: "STUDENT" | "TEACHER"; page: number | null; at: number };
export type LiveEvent =
  | { type: "state"; state: LiveState }
  | { type: "presence"; people: Presence[] }
  | { type: "pick"; name: string }
  | { type: "ping" };

type Subscriber = (event: LiveEvent) => void;
type Room = { subscribers: Set<Subscriber>; presence: Map<string, Presence> };

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

export function subscribe(classId: string, fn: Subscriber) {
  const r = room(classId);
  r.subscribers.add(fn);
  return () => {
    r.subscribers.delete(fn);
  };
}

export function broadcast(classId: string, event: LiveEvent) {
  for (const fn of room(classId).subscribers) {
    try {
      fn(event);
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

export async function stateOf(classId: string): Promise<LiveState> {
  const s = await db.liveSession.findUnique({ where: { classId } });
  return s ? { lessonId: s.lessonId, fileId: s.fileId, page: s.page, follow: s.follow, teacherId: s.teacherId, updatedAt: s.updatedAt.toISOString() } : null;
}

/** Write new room state and tell everyone. */
export async function setState(classId: string, schoolId: string, teacherId: string, patch: { lessonId?: string; fileId?: string; page?: number; follow?: boolean }) {
  const existing = await db.liveSession.findUnique({ where: { classId } });
  if (!existing && (!patch.lessonId || !patch.fileId)) return null;
  const s = existing
    ? await db.liveSession.update({ where: { classId }, data: { ...patch, teacherId } })
    : await db.liveSession.create({ data: { classId, schoolId, teacherId, lessonId: patch.lessonId!, fileId: patch.fileId!, page: patch.page ?? 1, follow: patch.follow ?? false } });
  const state: LiveState = { lessonId: s.lessonId, fileId: s.fileId, page: s.page, follow: s.follow, teacherId: s.teacherId, updatedAt: s.updatedAt.toISOString() };
  broadcast(classId, { type: "state", state });
  return state;
}

export async function closeRoom(classId: string) {
  await db.liveSession.deleteMany({ where: { classId } });
  broadcast(classId, { type: "state", state: null });
}

/** Encode one SSE frame. */
export const sseFrame = (event: LiveEvent) => `data: ${JSON.stringify(event)}\n\n`;
