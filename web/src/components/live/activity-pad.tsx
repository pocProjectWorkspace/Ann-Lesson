"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CRAYON_COLORS, CRAYON_WIDTH, PEN_WIDTH, fillContains, paintStrokes, renderPageImage, type Stroke } from "./ink";

type Point = [number, number];
type Tool = "crayon" | "pen" | "fill" | "eraser";

/**
 * The child's drawing surface: the page, big enough for a finger, a box of crayons, a
 * pen, a fill bucket (tap inside a shape to colour it), an eraser and clear. Used for
 * board-to-desk activities ("Send to teacher") and for colouring any page of a book
 * ("Done"). Work is saved every couple of seconds while drawing.
 */
export function ActivityPad({ page, prompt, title, src, initialStrokes, onSave, mode = "activity", onClose }: { page: number; prompt?: string | null; title?: string; src: string; initialStrokes: Stroke[]; onSave: (strokes: Stroke[], done: boolean) => Promise<unknown>; mode?: "activity" | "colouring"; onClose?: () => void }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const pageCanvas = useRef<HTMLCanvasElement>(null);
  const inkCanvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [pageReady, setPageReady] = useState(0);
  const [strokes, setStrokes] = useState<Stroke[]>(initialStrokes);
  const [live, setLive] = useState<Stroke | null>(null);
  const [color, setColor] = useState(CRAYON_COLORS[0]);
  const [tool, setTool] = useState<Tool>(mode === "colouring" ? "fill" : "crayon");
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
      const img = await renderPageImage(src, page, width);
      if (cancelled) return;
      canvas.width = img.width;
      canvas.height = img.height;
      const cssH = Math.round((width * img.height) / img.width);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${cssH}px`;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      setSize({ w: width, h: cssH });
      setPageReady((n) => n + 1);
    };
    void draw();
    const ro = new ResizeObserver(() => void draw());
    if (stageRef.current) ro.observe(stageRef.current);
    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, [src, page]);

  // Paint ink. Fills are computed from the page pixels, so they wait for the page.
  useEffect(() => {
    const c = inkCanvas.current;
    if (!c || !size.w || !pageReady) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.floor(size.w * dpr);
    c.height = Math.floor(size.h * dpr);
    c.style.width = `${size.w}px`;
    c.style.height = `${size.h}px`;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    paintStrokes(ctx, strokes, c.width, c.height, live, { page: pageCanvas.current });
  }, [strokes, live, size, pageReady]);

  const save = useCallback(
    async (list: Stroke[], done: boolean) => {
      setStatus("saving");
      try {
        await onSave(list, done);
        setStatus(done ? "sent" : "saved");
      } catch {
        setStatus("failed");
      }
    },
    [onSave],
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
  const pixelSize = () => ({ w: inkCanvas.current?.width ?? 1, h: inkCanvas.current?.height ?? 1 });
  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    const pt = toRel(e);
    if (tool === "eraser") return eraseAt(pt);
    if (tool === "fill") {
      // Tapping an already-filled area with the same colour does nothing; a new colour replaces it.
      const { w, h } = pixelSize();
      const rest = strokes.filter((s) => !(s.tool === "fill" && fillContains(pageCanvas.current, w, h, s, pt[0], pt[1])));
      return update([...rest, { tool: "fill", color, width: 0.001, points: [pt] }]);
    }
    drawing.current = true;
    setLive({ tool, color, width: tool === "crayon" ? CRAYON_WIDTH : PEN_WIDTH * 1.4, points: [pt] });
  };
  const onMove = (e: React.PointerEvent) => {
    const pt = toRel(e);
    if (tool === "eraser" && e.buttons) return eraseAt(pt);
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
    const { w, h } = pixelSize();
    const keep = strokes.filter((s) => (s.tool === "fill" ? !fillContains(pageCanvas.current, w, h, s, pt[0], pt[1]) : !s.points.some(([x, y]) => Math.hypot(x - pt[0], (y - pt[1]) * (size.h / Math.max(1, size.w))) < 0.025)));
    if (keep.length !== strokes.length) update(keep);
  };
  const finish = async () => {
    await save(strokes, true);
    onClose?.();
  };

  const toolBtn = (t: Tool, label: string, icon: string) => (
    <button type="button" aria-pressed={tool === t} onClick={() => setTool(t)} className={`h-11 rounded-full px-3.5 text-sm font-semibold ${tool === t ? "bg-white text-ink-950" : "bg-white/15"}`}>
      <span aria-hidden className="mr-1">
        {icon}
      </span>
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#0b0f1a] text-white select-none" role="dialog" aria-label={mode === "colouring" ? `Colouring page ${page}` : "Activity from your teacher"}>
      <header className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
        <span className="font-semibold">{title ?? (mode === "colouring" ? `Colour page ${page}` : `Page ${page} from your teacher`)}</span>
        {prompt && <span className="rounded-full bg-amber-300 px-3 py-0.5 font-semibold text-ink-950">{prompt}</span>}
        <span className="ml-auto text-xs text-white/60" aria-live="polite">
          {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "sent" ? (mode === "colouring" ? "Saved" : "Sent to your teacher") : status === "failed" ? "Could not save, trying again" : ""}
        </span>
      </header>
      <div className="flex flex-wrap items-center gap-2 px-3 pb-2">
        <div className="flex max-w-full gap-1.5 overflow-x-auto py-1" role="radiogroup" aria-label="Crayons">
          {CRAYON_COLORS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={tool !== "eraser" && color === c} aria-label={`Colour ${c}`} onClick={() => { setColor(c); if (tool === "eraser") setTool("crayon"); }} className={`h-10 w-7 shrink-0 rounded-t-full rounded-b-sm border-2 transition ${tool !== "eraser" && color === c ? "scale-110 border-white" : "border-transparent"}`} style={{ background: c }} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {toolBtn("fill", "Fill", "🪣")}
          {toolBtn("crayon", "Crayon", "🖍️")}
          {toolBtn("pen", "Pen", "✎")}
          {toolBtn("eraser", "Eraser", "⌫")}
          <button type="button" onClick={() => update([])} disabled={strokes.length === 0} className="h-11 rounded-full bg-white/15 px-3.5 text-sm font-semibold disabled:opacity-40">
            Clear
          </button>
        </div>
        <button type="button" onClick={finish} className="ml-auto h-11 rounded-full bg-emerald-400 px-5 text-sm font-bold text-ink-950">
          {mode === "colouring" ? "Done" : status === "sent" ? "Sent ✓ (send again)" : "Send to teacher"}
        </button>
      </div>
      <div ref={stageRef} className="relative flex min-h-0 flex-1 items-start justify-center overflow-auto p-2">
        <div className="relative" style={{ width: size.w || undefined, height: size.h || undefined }}>
          <canvas ref={pageCanvas} className="block rounded-sm bg-white" />
          <canvas ref={inkCanvas} className="absolute inset-0 touch-none" style={{ cursor: tool === "eraser" ? "cell" : tool === "fill" ? "pointer" : "crosshair", mixBlendMode: "multiply" }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={onUp} aria-label="Draw on the page" />
        </div>
      </div>
    </div>
  );
}
