import type { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { leave, people, sseFrame, stateOf, subscribe, touch, type LiveEvent } from "@/lib/live";
import { roomAccess } from "../route";

export const dynamic = "force-dynamic";

/**
 * GET /api/live/:classId/events → server-sent events: the room state on connect, then
 * every change, plus presence updates and a heartbeat every 25 seconds. The connecting
 * user is marked present for as long as the stream is open.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ classId: string }> }) {
  const session = await getSessionFromRequest(req);
  const { classId } = await ctx.params;
  const access = await roomAccess(session, classId);
  if (!access || !session) return new Response("Not found", { status: 404 });

  const encoder = new TextEncoder();
  const role = session.role === "STUDENT" ? "STUDENT" : "TEACHER";
  let unsubscribe = () => {};
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: LiveEvent) => controller.enqueue(encoder.encode(sseFrame(e)));
      send({ type: "state", state: await stateOf(classId) });
      touch(classId, { id: session.userId, name: session.name, role, page: null });
      send({ type: "presence", people: people(classId) });
      unsubscribe = subscribe(classId, send, { userId: session.userId, controls: access.controls });
      heartbeat = setInterval(() => {
        try {
          send({ type: "ping" });
        } catch {
          /* closed */
        }
      }, 25_000);
    },
    cancel() {
      unsubscribe();
      if (heartbeat) clearInterval(heartbeat);
      leave(classId, session.userId);
    },
  });
  req.signal.addEventListener("abort", () => {
    unsubscribe();
    if (heartbeat) clearInterval(heartbeat);
    leave(classId, session.userId);
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
