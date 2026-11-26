"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { INK_COLORS, PEN_WIDTH, paintStrokes, renderPageImage, type Stroke } from "./ink";
import type { LiveActivity } from "./use-live-room";

type Point = [number, number];

/**
 * The child's side of board-to-desk: the page the teacher sent, big enough to draw on
 * with a finger, a few colours, an eraser, clear, and "Send to teacher". Work is saved
 * to the room every couple of seconds while drawing, so the board wall fills in live,
 * and "Send" marks it done.
 */
export function ActivityPad({ activity, src, initialStrokes, send }: { activity: LiveActivity; src: string; initialStrokes: Stroke[]; send: (c: Record<string, unknown>) => Promise<unknown> }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const pageCanvas = useRef<HTMLCanvasElement>(null);
  const inkCanvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [strokes, setStrokes] = useState<Stroke[]>(initialStrokes);
  const [live, setLive] = useState<Stroke | null>(null);
  const [color, setColor] = useState(INK_COLORS[0]);
  const [eraser, setEraser] = useState(false);
  const [status, setStatus] = useState<"drawing" | "saving" | "saved" | "sent" | "failed">("drawing");
  const drawing = useRef(false);
  const dirty = useRef(false);

  // Render the page to fit the stage width.
  useEffect(() => {
    let cancelled = false;
    const draw = async () => {
      const stage = stageRef.current;
      const canvas = pageCanvas.current;
      if (!stage || !canvas) return;
      const width = Math.min(stage.clientWidth, 900);
      const img = await renderPageImage(src, activity.page, width);
      if (cancelled) return;
      canvas.width = img.width;
      canvas.height = img.height;
      const cssH = Math.round((width * img.height) / img.width);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${cssH}px`;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      setSize({ w: width, h: cssH });
    };
    void draw();
    const ro = new ResizeObserver(() => void draw());
    if (stageRef.current) ro.observe(stageRef.current);
    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, [src, activity.page]);

  // Paint ink.
  useEffect(() => {
    const c = inkCanvas.current;
    if (!c || !size.w) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.floor(size.w * dpr);
    c.height = Math.floor(size.h * dpr);
    c.style.width = `${size.w}px`;
    c.style.height = `${size.h}px`;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    paintStrokes(ctx, strokes, c.width, c.height, live);
  }, [strokes, live, size]);

  // Autosave while drawing (every 2 s when something changed).
  const save = useCallback(
    async (list: Stroke[], done: boolean) => {
      setStatus("saving");
      try {
        await send({ type: "activity.submit", activityId: activity.id, strokes: list, done });
        setStatus(done ? "sent" : "saved");
      } catch {
        setStatus("failed");
      }
    },
    [send, activity.id],
  );
  useEffect(() => {
    const t = setInterval(() => {
      if (!dirty.current) return;
      dirty.current = false;
      void save(strokes, false);
    }, 2000);
    return () => clearInterval(t);
  }, [strokes, save]);

  const toRel = (e: React.PointerEvent): Point => {
    const r = inkCanvas.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };
  const update = (list: Stroke[]) => {
    setStrokes(list);
    dirty.current = true;
    setStatus("drawing");
  };
  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    const pt = toRel(e);
    if (eraser) return eraseAt(pt);
    drawing.current = true;
    setLive({ tool: "pen", color, width: PEN_WIDTH * 1.4, points: [pt] });
  };
  const onMove = (e: React.PointerEvent) => {
    const pt = toRel(e);
    if (eraser && e.buttons) return eraseAt(pt);
    if (!drawing.current) return;
    setLive((l) => (l ? { ...l, points: [...l.points, pt] } : l));
  };
  const onUp = () => {
    if (!drawing.current) return;
    drawing.current = false;
    setLive((l) => {
      if (l) update([...strokes, l]);
      return null;
    });
  };
  const eraseAt = (pt: Point) => {
    const keep = strokes.filter((s) => !s.points.some(([x, y]) => Math.hypot(x - pt[0], (y - pt[1]) * (size.h / Math.max(1, size.w))) < 0.025));
    if (keep.length !== strokes.length) update(keep);
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#0b0f1a] text-white select-none" role="dialog" aria-label="Activity from your teacher">
      <header className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
        <span className="font-semibold">Page {activity.page} from your teacher</span>
        {activity.prompt && <span className="rounded-full bg-amber-300 px-3 py-0.5 font-semibold text-ink-950">{activity.prompt}</span>}
        <span className="ml-auto text-xs text-white/60" aria-live="polite">
          {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "sent" ? "Sent to your teacher" : status === "failed" ? "Could not save, trying again" : ""}
        </span>
      </header>
      <div className="flex items-center gap-2 px-3 pb-2">
        {INK_COLORS.map((c) => (
          <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={!eraser && color === c} onClick={() => { setColor(c); setEraser(false); }} className={`h-11 w-11 rounded-full border-4 ${!eraser && color === c ? "border-white" : "border-transparent"}`} style={{ background: c }} />
        ))}
        <button type="button" aria-pressed={eraser} onClick={() => setEraser((v) => !v)} className={`h-11 rounded-full px-4 text-sm font-semibold ${eraser ? "bg-white text-ink-950" : "bg-white/15"}`}>
          Eraser
        </button>
        <button type="button" onClick={() => update([])} disabled={strokes.length === 0} className="h-11 rounded-full bg-white/15 px-4 text-sm font-semibold disabled:opacity-40">
          Clear
        </button>
        <button type="button" onClick={() => save(strokes, true)} className="ml-auto h-11 rounded-full bg-emerald-400 px-5 text-sm font-bold text-ink-950">
          {status === "sent" ? "Sent ✓ (send again)" : "Send to teacher"}
        </button>
      </div>
      <div ref={stageRef} className="relative flex min-h-0 flex-1 items-start justify-center overflow-auto p-2">
        <div className="relative" style={{ width: size.w || undefined, height: size.h || undefined }}>
          <canvas ref={pageCanvas} className="block rounded-sm bg-white" />
          <canvas ref={inkCanvas} className="absolute inset-0 touch-none" style={{ cursor: eraser ? "cell" : "crosshair" }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={onUp} aria-label="Draw on the page" />
        </div>
      </div>
    </div>
  );
}
