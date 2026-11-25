"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type LiveState = { lessonId: string; fileId: string; page: number; follow: boolean; teacherId: string; updatedAt: string } | null;
export type Presence = { id: string; name: string; role: "STUDENT" | "TEACHER"; page: number | null; at: number };
type LiveEvent = { type: "state"; state: LiveState } | { type: "presence"; people: Presence[] } | { type: "pick"; name: string } | { type: "ping" };

/**
 * Join a class's live room from the browser. Subscribes over server-sent events and
 * falls back to polling when the stream cannot be kept open. `token` is the web-view
 * hand-off token used inside the mobile app, where there is no cookie.
 */
export function useLiveRoom(classId: string | null, opts: { token?: string; onPick?: (name: string) => void; onState?: (state: LiveState) => void } = {}) {
  const [state, setState] = useState<LiveState>(null);
  const [people, setPeople] = useState<Presence[]>([]);
  const [connected, setConnected] = useState(false);
  const onPickRef = useRef(opts.onPick);
  const onStateRef = useRef(opts.onState);
  useEffect(() => {
    onPickRef.current = opts.onPick;
    onStateRef.current = opts.onState;
  });
  const qs = opts.token ? `?t=${encodeURIComponent(opts.token)}` : "";

  useEffect(() => {
    if (!classId) return;
    let es: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let closed = false;

    const apply = (e: LiveEvent) => {
      if (e.type === "state") {
        setState(e.state);
        onStateRef.current?.(e.state);
      } else if (e.type === "presence") setPeople(e.people);
      else if (e.type === "pick") onPickRef.current?.(e.name);
    };
    const startPolling = () => {
      if (poll) return;
      poll = setInterval(async () => {
        try {
          const r = await fetch(`/api/live/${classId}${qs}`, { cache: "no-store" });
          if (r.ok) {
            const j = (await r.json()) as { state: LiveState; people: Presence[] };
            setState(j.state);
            onStateRef.current?.(j.state);
            setPeople(j.people);
          }
        } catch {
          /* offline */
        }
      }, 3000);
    };
    try {
      es = new EventSource(`/api/live/${classId}/events${qs}`);
      es.onopen = () => setConnected(true);
      es.onmessage = (m) => apply(JSON.parse(m.data) as LiveEvent);
      es.onerror = () => {
        setConnected(false);
        if (closed) return;
        // The browser retries the stream itself; poll meanwhile so nothing is missed.
        startPolling();
      };
    } catch {
      startPolling();
    }
    return () => {
      closed = true;
      es?.close();
      if (poll) clearInterval(poll);
      fetch(`/api/live/${classId}${qs}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "leave" }), keepalive: true }).catch(() => {});
    };
  }, [classId, qs]);

  const send = useCallback(
    async (command: Record<string, unknown>) => {
      if (!classId) return null;
      const r = await fetch(`/api/live/${classId}${qs}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) });
      const j = (await r.json().catch(() => ({}))) as { state?: LiveState; error?: string };
      if (!r.ok) throw new Error(j.error ?? "Could not reach the classroom");
      if (j.state !== undefined) {
        setState(j.state);
        onStateRef.current?.(j.state);
      }
      return j;
    },
    [classId, qs],
  );

  return { state, people, connected, send };
}
