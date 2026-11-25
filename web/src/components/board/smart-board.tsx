"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { saveBoardNotes, type Stroke } from "@/app/board/actions";

type Tool = "pen" | "highlighter" | "eraser" | "spotlight" | "cover" | "none";
type Point = [number, number];

const COLORS = ["#e11d48", "#2563eb", "#16a34a", "#111827"];
const PEN_WIDTH = 0.006; // of page width
const HIGHLIGHT_WIDTH = 0.03;

/** Draw strokes (page-relative) onto a canvas of the given pixel size. */
function paint(ctx: CanvasRenderingContext2D, strokes: Stroke[], w: number, h: number, live?: Stroke | null) {
  ctx.clearRect(0, 0, w, h);
  for (const s of live ? [...strokes, live] : strokes) {
    if (s.points.length === 0) continue;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = s.color;
    ctx.globalAlpha = s.tool === "highlighter" ? 0.35 : 1;
    ctx.lineWidth = Math.max(1, s.width * w);
    ctx.beginPath();
    const [x0, y0] = s.points[0];
    ctx.moveTo(x0 * w, y0 * h);
    if (s.points.length === 1) ctx.lineTo(x0 * w + 0.01, y0 * h);
    for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i][0] * w, s.points[i][1] * h);
    ctx.stroke();
    ctx.restore();
  }
}

function formatTime(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The board. One page at a time, sized to the screen, dark surround, big controls.
 * Keyboard: arrows turn pages, F toggles full screen, Escape drops the current tool.
 */
export function SmartBoard({ lesson, files, currentFileId, students, saved, backHref }: { lesson: { id: string; title: string; subject: string; className: string }; files: { id: string; fileName: string }[]; currentFileId: string | null; students: string[]; saved: Record<number, Stroke[]>; backHref: string }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const pageCanvas = useRef<HTMLCanvasElement>(null);
  const inkCanvas = useRef<HTMLCanvasElement>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const renderSeq = useRef(0);

  const router = useRouter();
  const [status, setStatus] = useState<"opening" | "ready" | "error">(currentFileId ? "opening" : "error");
  const [message, setMessage] = useState<string | null>(currentFileId ? null : "This lesson has no PDF yet.");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [size, setSize] = useState({ w: 0, h: 0 }); // CSS px of the page on screen
  const [tool, setTool] = useState<Tool>("none");
  const [color, setColor] = useState(COLORS[0]);
  const [notes, setNotes] = useState<Record<number, Stroke[]>>(saved);
  const [live, setLive] = useState<Stroke | null>(null);
  const [spot, setSpot] = useState<{ x: number; y: number; r: number }>({ x: 0.5, y: 0.5, r: 0.18 });
  const [cover, setCover] = useState<{ y: number; fromTop: boolean }>({ y: 0.5, fromTop: false });
  const [timer, setTimer] = useState<{ left: number; running: boolean } | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "failed">("saved");
  const [fullscreen, setFullscreen] = useState(false);

  const strokes = useMemo(() => notes[page] ?? [], [notes, page]);

  /* ---------- open the document ---------- */
  useEffect(() => {
    if (!currentFileId) return;
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const task = pdfjs.getDocument({ url: `/api/files/${currentFileId}`, withCredentials: false, rangeChunkSize: 1024 * 1024, disableAutoFetch: true });
        const doc = await task.promise;
        if (cancelled) return;
        docRef.current = doc;
        setTotal(doc.numPages);
        setStatus("ready");
      } catch (e) {
        if (!cancelled) {
          setStatus("error");
          setMessage(e instanceof Error ? e.message : "Could not open the book");
        }
      }
    })();
    return () => {
      cancelled = true;
      docRef.current?.loadingTask.destroy().catch(() => {});
      docRef.current = null;
    };
  }, [currentFileId]);

  /* ---------- render the current page to fit the stage ---------- */
  const renderPage = useCallback(async () => {
    const doc = docRef.current;
    const stage = stageRef.current;
    const canvas = pageCanvas.current;
    if (!doc || !stage || !canvas || page < 1 || page > doc.numPages) return;
    const seq = ++renderSeq.current;
    const pdfPage = await doc.getPage(page);
    if (seq !== renderSeq.current) return;
    const base = pdfPage.getViewport({ scale: 1 });
    const availW = stage.clientWidth;
    const availH = stage.clientHeight;
    const scale = Math.min(availW / base.width, availH / base.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const viewport = pdfPage.getViewport({ scale: scale * dpr });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const cssW = Math.floor(viewport.width / dpr);
    const cssH = Math.floor(viewport.height / dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    await pdfPage.render({ canvas, canvasContext: ctx, viewport }).promise;
    pdfPage.cleanup();
    if (seq !== renderSeq.current) return;
    setSize({ w: cssW, h: cssH });
  }, [page]);

  useEffect(() => {
    if (status !== "ready") return;
    void renderPage();
    const ro = new ResizeObserver(() => void renderPage());
    if (stageRef.current) ro.observe(stageRef.current);
    return () => ro.disconnect();
  }, [status, renderPage]);

  /* ---------- paint ink whenever strokes or size change ---------- */
  useEffect(() => {
    const c = inkCanvas.current;
    if (!c || !size.w) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.floor(size.w * dpr);
    c.height = Math.floor(size.h * dpr);
    c.style.width = `${size.w}px`;
    c.style.height = `${size.h}px`;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    paint(ctx, strokes, c.width, c.height, live);
  }, [strokes, live, size]);

  /* ---------- save, debounced per page ---------- */
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = useCallback(
    (p: number, list: Stroke[]) => {
      if (!currentFileId) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      setSaveState("saving");
      saveTimer.current = setTimeout(async () => {
        const r = await saveBoardNotes(currentFileId, p, list).catch(() => ({ ok: false }));
        setSaveState(r.ok ? "saved" : "failed");
      }, 800);
    },
    [currentFileId],
  );
  const setPageStrokes = useCallback(
    (p: number, list: Stroke[]) => {
      setNotes((n) => ({ ...n, [p]: list }));
      persist(p, list);
    },
    [persist],
  );

  /* ---------- pointer handling on the ink layer ---------- */
  const toRel = (e: React.PointerEvent): Point => {
    const r = inkCanvas.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };
  const drawing = useRef(false);
  const onDown = (e: React.PointerEvent) => {
    if (tool === "none") return;
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    const pt = toRel(e);
    if (tool === "spotlight") return setSpot((s) => ({ ...s, x: pt[0], y: pt[1] }));
    if (tool === "cover") return setCover((c) => ({ ...c, y: pt[1] }));
    if (tool === "eraser") return eraseAt(pt);
    drawing.current = true;
    setLive({ tool, color: tool === "highlighter" ? "#facc15" : color, width: tool === "highlighter" ? HIGHLIGHT_WIDTH : PEN_WIDTH, points: [pt] });
  };
  const onMove = (e: React.PointerEvent) => {
    if (tool === "none") return;
    const pt = toRel(e);
    if (tool === "spotlight" && e.buttons) return setSpot((s) => ({ ...s, x: pt[0], y: pt[1] }));
    if (tool === "cover" && e.buttons) return setCover((c) => ({ ...c, y: pt[1] }));
    if (tool === "eraser" && e.buttons) return eraseAt(pt);
    if (!drawing.current) return;
    setLive((l) => (l ? { ...l, points: [...l.points, pt] } : l));
  };
  const onUp = () => {
    if (!drawing.current) return;
    drawing.current = false;
    setLive((l) => {
      if (l) setPageStrokes(page, [...strokes, l]);
      return null;
    });
  };
  const eraseAt = (pt: Point) => {
    const keep = strokes.filter((s) => !s.points.some(([x, y]) => Math.hypot(x - pt[0], (y - pt[1]) * (size.h / Math.max(1, size.w))) < 0.02));
    if (keep.length !== strokes.length) setPageStrokes(page, keep);
  };

  /* ---------- navigation, keyboard, full screen, timer ---------- */
  const go = useCallback((p: number) => setPage((cur) => Math.min(Math.max(1, p), Math.max(1, total || cur))), [total]);
  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      /* not supported */
    }
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "SELECT") return;
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") go(page + 1);
      else if (e.key === "ArrowLeft" || e.key === "PageUp") go(page - 1);
      else if (e.key === "Escape") setTool("none");
      else if (e.key.toLowerCase() === "f") void toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, page, toggleFullscreen]);
  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  useEffect(() => {
    if (!timer?.running || timer.left <= 0) return;
    const t = setTimeout(() => setTimer((x) => (x ? { ...x, left: x.left - 1, running: x.left - 1 > 0 } : x)), 1000);
    return () => clearTimeout(t);
  }, [timer]);

  const pickName = () => {
    if (!students.length) return;
    let n = students[Math.floor(Math.random() * students.length)];
    if (students.length > 1 && n === picked) n = students[(students.indexOf(n) + 1) % students.length];
    setPicked(n);
  };

  const toolBtn = (t: Tool, label: string, icon: string) => (
    <button type="button" onClick={() => setTool(tool === t ? "none" : t)} aria-pressed={tool === t} title={label} className={`flex h-12 w-12 flex-col items-center justify-center rounded-xl text-[10px] font-semibold transition ${tool === t ? "bg-white text-ink-950" : "bg-white/10 text-white hover:bg-white/20"}`}>
      <span className="text-lg leading-none" aria-hidden>
        {icon}
      </span>
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 flex flex-col bg-[#0b0f1a] text-white select-none">
      {/* Top bar */}
      <header className="flex items-center gap-3 px-4 py-2 text-sm">
        <a href={backHref} className="rounded-lg bg-white/10 px-3 py-1.5 font-semibold hover:bg-white/20">
          ← Exit board
        </a>
        <div className="min-w-0 flex-1 truncate">
          <span className="font-display text-base">{lesson.title}</span>
          <span className="text-white/60">
            {" "}
            · {lesson.subject} · {lesson.className}
          </span>
        </div>
        {files.length > 1 && (
          <select value={currentFileId ?? ""} onChange={(e) => router.push(`/board/${lesson.id}?file=${e.target.value}`)} aria-label="Book" className="rounded-lg bg-white/10 px-2 py-1.5 text-sm text-white">
            {files.map((f) => (
              <option key={f.id} value={f.id} className="text-ink-950">
                {f.fileName}
              </option>
            ))}
          </select>
        )}
        <span className="text-xs text-white/50" aria-live="polite">
          {saveState === "saving" ? "Saving…" : saveState === "failed" ? "Not saved" : "Saved"}
        </span>
        <button type="button" onClick={toggleFullscreen} className="rounded-lg bg-white/10 px-3 py-1.5 font-semibold hover:bg-white/20">
          {fullscreen ? "Exit full screen" : "Full screen (F)"}
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Tool rail */}
        <aside className="flex w-20 flex-col items-center gap-2 overflow-y-auto px-2 py-3" aria-label="Board tools">
          {toolBtn("pen", "Pen", "✎")}
          {toolBtn("highlighter", "Highlight", "▮")}
          {toolBtn("eraser", "Eraser", "⌫")}
          <div className="my-1 grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Pen colour">
            {COLORS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={`Colour ${c}`} onClick={() => { setColor(c); if (tool !== "pen") setTool("pen"); }} className={`h-6 w-6 rounded-full border-2 ${color === c ? "border-white" : "border-transparent"}`} style={{ background: c }} />
            ))}
          </div>
          {toolBtn("spotlight", "Spotlight", "◎")}
          {toolBtn("cover", "Cover", "▬")}
          <button type="button" onClick={() => setPageStrokes(page, [])} disabled={strokes.length === 0} title="Clear this page" className="flex h-12 w-12 flex-col items-center justify-center rounded-xl bg-white/10 text-[10px] font-semibold hover:bg-white/20 disabled:opacity-30">
            <span className="text-lg leading-none" aria-hidden>
              ✕
            </span>
            Clear
          </button>
          <div className="mt-auto flex flex-col items-center gap-2">
            <button type="button" onClick={() => setTimer(timer?.running ? { ...timer, running: false } : { left: timer && timer.left > 0 ? timer.left : 60, running: true })} className="flex h-12 w-12 flex-col items-center justify-center rounded-xl bg-white/10 text-[10px] font-semibold hover:bg-white/20" title="One-minute timer; tap again to pause">
              <span className="text-sm leading-none tabular-nums" aria-live="polite">
                {timer ? formatTime(timer.left) : "⏱"}
              </span>
              Timer
            </button>
            {timer && (
              <div className="flex gap-1">
                <button type="button" onClick={() => setTimer({ left: 60, running: false })} className="rounded bg-white/10 px-1.5 py-0.5 text-[10px]">1m</button>
                <button type="button" onClick={() => setTimer({ left: 300, running: false })} className="rounded bg-white/10 px-1.5 py-0.5 text-[10px]">5m</button>
              </div>
            )}
            <button type="button" onClick={pickName} disabled={!students.length} className="flex h-12 w-12 flex-col items-center justify-center rounded-xl bg-white/10 text-[10px] font-semibold hover:bg-white/20 disabled:opacity-30" title="Pick a child at random">
              <span className="text-lg leading-none" aria-hidden>
                ★
              </span>
              Pick
            </button>
          </div>
        </aside>

        {/* Stage */}
        <main ref={stageRef} className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center p-2">
          {status === "opening" && <p className="text-white/70">Opening book…</p>}
          {status === "error" && <p className="text-rose-200">{message}</p>}
          <div className="relative" style={{ width: size.w || undefined, height: size.h || undefined }}>
            <canvas ref={pageCanvas} className="block rounded-sm bg-white shadow-2xl" />
            <canvas
              ref={inkCanvas}
              className="absolute inset-0 touch-none"
              style={{ cursor: tool === "none" ? "default" : tool === "eraser" ? "cell" : "crosshair" }}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onPointerLeave={onUp}
              aria-label={tool === "none" ? undefined : `${tool} active, draw on the page`}
            />
            {tool === "spotlight" && size.w > 0 && (
              <div
                className="pointer-events-none absolute inset-0"
                style={{ background: `radial-gradient(circle ${spot.r * size.w}px at ${spot.x * size.w}px ${spot.y * size.h}px, transparent 0, transparent 95%, rgba(5,8,16,0.88) 100%)` }}
                aria-hidden
              />
            )}
            {tool === "cover" && size.w > 0 && (
              <div className="pointer-events-none absolute left-0 right-0 bg-[#0b0f1a]/95" style={cover.fromTop ? { top: 0, height: cover.y * size.h } : { top: cover.y * size.h, bottom: 0 }} aria-hidden />
            )}
          </div>
          {tool === "spotlight" && (
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-xs">
              Spotlight size
              <input type="range" min={0.06} max={0.4} step={0.01} value={spot.r} onChange={(e) => setSpot((s) => ({ ...s, r: Number(e.target.value) }))} aria-label="Spotlight size" />
            </div>
          )}
          {tool === "cover" && (
            <button type="button" onClick={() => setCover((c) => ({ ...c, fromTop: !c.fromTop }))} className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1.5 text-xs">
              Cover from the {cover.fromTop ? "bottom" : "top"} instead
            </button>
          )}
          {picked && (
            <div role="status" className="absolute right-4 top-4 rounded-2xl bg-white px-6 py-4 text-ink-950 shadow-2xl">
              <div className="text-xs font-semibold text-ink-500">Your turn</div>
              <div className="font-display text-3xl">{picked}</div>
              <button type="button" onClick={() => setPicked(null)} className="mt-2 text-xs text-ink-500 underline">
                dismiss
              </button>
            </div>
          )}
        </main>

        {/* Page controls */}
        <aside className="flex w-20 flex-col items-center justify-center gap-3 px-2" aria-label="Pages">
          <button type="button" onClick={() => go(page - 1)} disabled={page <= 1} aria-label="Previous page" className="grid h-16 w-16 place-items-center rounded-2xl bg-white/10 text-3xl hover:bg-white/20 disabled:opacity-30">
            ‹
          </button>
          <div className="text-center text-xs text-white/70">
            <input type="number" min={1} max={total || 1} value={page} onChange={(e) => go(Number(e.target.value))} aria-label="Page number" className="w-14 rounded-lg bg-white/10 px-1 py-1 text-center text-base text-white" />
            <div className="mt-1">of {total || "…"}</div>
          </div>
          <button type="button" onClick={() => go(page + 1)} disabled={!total || page >= total} aria-label="Next page" className="grid h-16 w-16 place-items-center rounded-2xl bg-white/10 text-3xl hover:bg-white/20 disabled:opacity-30">
            ›
          </button>
        </aside>
      </div>
    </div>
  );
}
