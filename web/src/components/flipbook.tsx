"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PageFlip } from "page-flip";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { ActivityPad } from "./live/activity-pad";
import type { Stroke } from "@/lib/strokes";

/** Faint diagonal name across the page so a screenshot identifies its source. */
function stampWatermark(ctx: CanvasRenderingContext2D, w: number, h: number, text: string) {
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = "#000";
  ctx.font = `bold ${Math.round(w / 14)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 5);
  for (let y = -h; y <= h; y += h / 2.5) ctx.fillText(text, 0, y);
  ctx.restore();
}

type Status = { kind: "opening" } | { kind: "book"; total: number; rendered: number } | { kind: "error"; message: string };

/**
 * Optional reading-progress tracking: the viewer opens at `startPage` (1-based) and
 * reports the page reached to the position endpoint as the reader turns pages. `token`
 * is the web-view hand-off token for the mobile app, which has no session cookie.
 */
export type ReadingTrack = { lessonId: string; startPage?: number; token?: string };
/** Where the teacher's voice clips are served from, and which pages have one. */
export type Narration = { src: string; pages: number[] };
/** Lets a student colour pages of this book; strokes are saved per page through the colouring endpoint. */
export type Colouring = { lessonId: string; fileId: string; token?: string };

/** The device's local calendar date, which is what a reading streak counts. */
function localDay() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function positionUrl(track: ReadingTrack) {
  return `/api/mobile/lessons/${track.lessonId}/position${track.token ? `?t=${encodeURIComponent(track.token)}` : ""}`;
}

/** Pages to draw first, relative to the one the reader is on: this spread, then ahead, then behind, then the rest. */
function renderOrder(current: number, total: number): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  const push = (i: number) => {
    if (i >= 0 && i < total && !seen.has(i)) {
      seen.add(i);
      out.push(i);
    }
  };
  // The visible spread (current page and its partner), then a few ahead and one behind.
  const left = current % 2 === 1 ? current : current - 1;
  push(current);
  push(left);
  push(left + 1);
  for (let k = 1; k <= 6; k++) push(current + k);
  push(current - 1);
  push(current - 2);
  for (let i = current + 7; i < total; i++) push(i);
  for (let i = current - 3; i >= 0; i--) push(i);
  return out;
}

/** Longest side of a rendered page in CSS pixels. Phones get smaller bitmaps to save memory. */
function targetWidth() {
  if (typeof window === "undefined") return 1200;
  return window.innerWidth < 640 ? 800 : 1200;
}

/**
 * Renders a PDF as a page-turning book without waiting for the whole file.
 * 1. pdf.js opens the document with HTTP range requests, so only the parts it needs
 *    are downloaded (storage buckets serve ranges; the local driver sends the whole file).
 * 2. The book is mounted immediately with one placeholder per page.
 * 3. Pages are rasterised one at a time, starting from the spread the reader is on and
 *    working outwards, and each image is swapped into its placeholder as it finishes.
 *    Turning the page re-prioritises the queue, so the reader rarely sees a placeholder.
 * 4. With `track`, the viewer opens at the student's last page and reports the page
 *    reached as they read, so the dashboard shows a percentage and "Continue reading"
 *    resumes in the right place.
 */
export function Flipbook({ src, title, watermark, track, onProgress, followPage, onPage, narration, colouring }: { src: string; title: string; watermark?: string; track?: ReadingTrack; onProgress?: (p: { page: number; pageCount: number; percent: number; finished: boolean }) => void; followPage?: number | null; onPage?: (page: number, pageCount: number) => void; narration?: Narration; colouring?: Colouring }) {
  const bookRef = useRef<HTMLDivElement>(null);
  const flipRef = useRef<PageFlip | null>(null);
  const currentRef = useRef(0);
  const wakeRef = useRef<(() => void) | null>(null);
  // Latest props, readable from the long-lived render loop and event handlers.
  const trackRef = useRef(track);
  const onProgressRef = useRef(onProgress);
  const onPageRef = useRef(onPage);
  const followRef = useRef(followPage);
  useEffect(() => {
    trackRef.current = track;
    onProgressRef.current = onProgress;
    onPageRef.current = onPage;
    followRef.current = followPage;
  });

  // Debounced reporter: the latest page wins, and anything pending is flushed when the
  // tab is hidden or the component goes away (sendBeacon survives page unloads).
  const pending = useRef<{ page: number; pageCount: number; day: string; dwell?: { page: number; ms: number }[] } | null>(null);
  // Attention: which pages are on screen and since when; sent as "dwell" on the next report.
  const shown = useRef<{ pages: number[]; since: number } | null>(null);
  const lastShownPages = useRef<number[]>([]);
  const lastReport = useRef<{ page: number; pageCount: number } | null>(null);
  const dwellQueue = useRef<{ page: number; ms: number }[]>([]);
  const closeShown = () => {
    const prev = shown.current;
    shown.current = null;
    if (!prev) return;
    const ms = Date.now() - prev.since;
    if (ms >= 1000) for (const p of prev.pages) dwellQueue.current.push({ page: p, ms });
  };
  const noteShown = useCallback((pages: number[]) => {
    closeShown();
    lastShownPages.current = pages;
    if (document.visibilityState === "visible") shown.current = { pages, since: Date.now() };
  }, []);
  const [earned, setEarned] = useState<{ id: string; emoji: string; label: string }[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const report = useCallback((page: number, pageCount: number, immediate = false) => {
    const t = trackRef.current;
    if (!t) return;
    lastReport.current = { page, pageCount };
    pending.current = { page, pageCount, day: localDay(), dwell: dwellQueue.current.splice(0, 20) };
    const send = async () => {
      const body = pending.current;
      pending.current = null;
      if (!body) return;
      try {
        const res = await fetch(positionUrl(t), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true });
        if (res.ok) {
          const data = (await res.json()) as { percent: number; finished: boolean; earned?: { id: string; emoji: string; label: string }[] };
          onProgressRef.current?.({ page: body.page, pageCount: body.pageCount, percent: data.percent, finished: data.finished });
          if (data.earned?.length) {
            setEarned(data.earned);
            setTimeout(() => setEarned([]), 6000);
          }
        }
      } catch {
        /* offline or navigating away; the next turn will report again */
      }
    };
    if (timer.current) clearTimeout(timer.current);
    if (immediate) void send();
    else timer.current = setTimeout(send, 1200);
  }, []);
  useEffect(() => {
    const flush = () => {
      const t = trackRef.current;
      // Close the open spread's timer so time on the last page is not lost, and send
      // whatever is pending plus that time in one beacon.
      closeShown();
      const body = pending.current ?? (lastReport.current && dwellQueue.current.length ? { ...lastReport.current, day: localDay() } : null);
      if (!t || !body) return;
      body.dwell = [...(body.dwell ?? []), ...dwellQueue.current.splice(0, 20)];
      pending.current = null;
      if (timer.current) clearTimeout(timer.current);
      navigator.sendBeacon?.(positionUrl(t), new Blob([JSON.stringify(body)], { type: "application/json" }));
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
      else if (lastShownPages.current.length) shown.current = { pages: lastShownPages.current, since: Date.now() };
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);
  const [status, setStatus] = useState<Status>({ kind: "opening" });
  const [ratio, setRatio] = useState(1.414); // height / width of a page
  const [current, setCurrent] = useState(0);
  const [isPortrait, setIsPortrait] = useState(false);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);

  // Step 1: open the document (metadata only; pages are fetched on demand).
  useEffect(() => {
    let cancelled = false;
    let opened: PDFDocumentProxy | null = null;
    // No state reset here: PdfViewer mounts the Flipbook with key={fileId}, so a new
    // file always starts from a fresh component in the "opening" state.
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        // Same-origin credentials: the session cookie still reaches /api/files, and when that
        // route redirects to a signed R2/S3 URL the cross-origin request is sent without
        // credentials, which is what bucket CORS rules can answer.
        // disableAutoFetch keeps the network idle apart from the ranges our render queue
        // asks for, so the first pages are not competing with a background download.
        const task = pdfjs.getDocument({ url: src, withCredentials: false, rangeChunkSize: 1024 * 1024, disableAutoFetch: true });
        opened = await task.promise;
        if (cancelled) return;
        const first = await opened.getPage(1);
        const base = first.getViewport({ scale: 1 });
        if (cancelled) return;
        setRatio(base.height / base.width);
        setDoc(opened);
        setStatus({ kind: "book", total: opened.numPages, rendered: 0 });
      } catch (e) {
        if (!cancelled) setStatus({ kind: "error", message: e instanceof Error ? e.message : "Could not load PDF" });
      }
    })();
    return () => {
      cancelled = true;
      opened?.loadingTask.destroy().catch(() => {});
    };
  }, [src]);

  // Step 2: mount the book with placeholders, then rasterise pages around the reader.
  useEffect(() => {
    if (!doc || status.kind !== "book" || !bookRef.current) return;
    const total = doc.numPages;
    let flip: PageFlip | undefined;
    let observer: ResizeObserver | undefined;
    let disposed = false;
    const images: HTMLImageElement[] = [];
    const urls: string[] = [];
    const done = new Set<number>();
    let wake: (() => void) | null = null;
    wakeRef.current = () => wake?.();

    (async () => {
      const { PageFlip } = await import("page-flip");
      if (disposed || !bookRef.current) return;

      // One element per page; page-flip moves these into its own container.
      const nodes: HTMLElement[] = [];
      for (let i = 0; i < total; i++) {
        const page = document.createElement("div");
        page.className = "page flipbook-page";
        page.dataset.density = i === 0 || i === total - 1 ? "hard" : "soft";
        const img = document.createElement("img");
        img.alt = `Page ${i + 1}`;
        img.draggable = false;
        img.decoding = "async";
        const label = document.createElement("span");
        label.className = "flipbook-placeholder";
        label.textContent = `Page ${i + 1}`;
        page.append(img, label);
        images.push(img);
        nodes.push(page);
      }

      const pageWidth = 500;
      const pageHeight = Math.round(pageWidth * ratio);
      flip = new PageFlip(bookRef.current, {
        width: pageWidth,
        height: pageHeight,
        size: "stretch",
        minWidth: 240,
        maxWidth: 700,
        minHeight: Math.round(240 * ratio),
        maxHeight: Math.round(700 * ratio),
        showCover: true,
        usePortrait: true,
        mobileScrollSupport: false,
        maxShadowOpacity: 0.35,
        flippingTime: 700,
        showPageCorners: true,
      });
      flip.loadFromHTML(nodes);
      // The furthest page visible for a given index: in a two-page spread the right-hand
      // page (odd index + 1); on a phone, or on the cover and back, the index itself.
      const reached = (idx: number) => Math.min(total, (flip && flip.getOrientation() === "portrait" ? idx : idx % 2 === 1 ? idx + 1 : idx) + 1);
      const visible = (idx: number) => {
        const portrait = flip?.getOrientation() === "portrait";
        if (portrait || idx === 0 || idx >= total - 1) return [idx + 1];
        return [idx + 1, Math.min(total, idx + 2)];
      };
      flip.on("flip", (e) => {
        const idx = Number(e.data);
        currentRef.current = idx;
        setCurrent(idx);
        noteShown(visible(idx));
        wake?.(); // re-prioritise the render queue around the new page
        report(reached(idx), total);
        onPageRef.current?.(idx + 1, total);
      });
      // Resume where the reader left off, and record the page count straight away so the
      // dashboard can show a percentage even before the first page turn.
      // The teacher's page wins over the student's own last page when following.
      const start = Math.min(Math.max((followRef.current ?? trackRef.current?.startPage ?? 1) - 1, 0), total - 1);
      if (start > 0) {
        flip.turnToPage(start);
        currentRef.current = start;
        setCurrent(start);
      }
      noteShown(visible(start));
      report(reached(start), total);
      flip.on("changeOrientation", (e: { data: string }) => setIsPortrait(e.data === "portrait"));
      setIsPortrait(flip.getOrientation() === "portrait");
      flipRef.current = flip;

      // page-flip measures its container once at creation. If layout has not settled yet
      // (fonts, sidebar, flex) the canvas keeps a stale size and pages look squashed.
      // Re-measure on the next frame and whenever the container changes size.
      const remeasure = () => {
        if (disposed || !flipRef.current) return;
        try {
          window.dispatchEvent(new Event("resize"));
          flipRef.current.update();
          setIsPortrait(flipRef.current.getOrientation() === "portrait");
        } catch {
          /* ignore */
        }
      };
      requestAnimationFrame(remeasure);
      observer = new ResizeObserver(() => requestAnimationFrame(remeasure));
      observer.observe(bookRef.current.parentElement ?? bookRef.current);

      // Render loop: one page at a time, always the most useful one next.
      const width = targetWidth();
      while (!disposed) {
        const next = renderOrder(currentRef.current, total).find((i) => !done.has(i));
        if (next === undefined) break;
        done.add(next);
        try {
          const page = await doc.getPage(next + 1);
          if (disposed) break;
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: Math.min(2.5, width / base.width) });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Canvas not supported");
          await page.render({ canvas, canvasContext: ctx, viewport }).promise;
          if (watermark) stampWatermark(ctx, canvas.width, canvas.height, watermark);
          const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
          page.cleanup();
          canvas.width = 0;
          canvas.height = 0;
          if (disposed || !blob) break;
          const url = URL.createObjectURL(blob);
          urls.push(url);
          images[next].src = url;
          images[next].parentElement?.classList.add("is-rendered");
          setStatus((s) => (s.kind === "book" ? { ...s, rendered: s.rendered + 1 } : s));
        } catch (e) {
          if (disposed) break;
          const label = images[next].parentElement?.querySelector(".flipbook-placeholder");
          if (label) label.textContent = `Page ${next + 1} could not be loaded`;
          console.error(e);
        }
        // Yield so a page turn can change the order before the next render starts.
        await new Promise<void>((r) => {
          wake = r;
          setTimeout(r, 0);
        });
        wake = null;
      }
    })();

    return () => {
      disposed = true;
      wake?.();
      observer?.disconnect();
      flip?.destroy();
      flipRef.current = null;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [doc, status.kind, ratio, watermark, report, noteShown]);

  // Follow the teacher: when the board moves to a page, turn to it (no animation jump
  // across many pages; page-flip animates a single turn and jumps otherwise).
  useEffect(() => {
    if (!followPage || !flipRef.current) return;
    const target = Math.max(0, followPage - 1);
    if (currentRef.current === target) return;
    const flip = flipRef.current;
    // Deferred so the state update is not synchronous inside the effect.
    const t = setTimeout(() => {
      try {
        if (Math.abs(currentRef.current - target) === 1) flip.flip(target);
        else flip.turnToPage(target);
        currentRef.current = target;
        setCurrent(target);
        wakeRef.current?.();
      } catch {
        /* not mounted yet */
      }
    }, 0);
    return () => clearTimeout(t);
  }, [followPage, status.kind]);

  const prev = useCallback(() => flipRef.current?.flipPrev(), []);
  const next = useCallback(() => flipRef.current?.flipNext(), []);

  // Colouring: which pages this child has coloured, and the pad when one is open.
  const [coloured, setColoured] = useState<Set<number>>(new Set());
  const [colourPage, setColourPage] = useState<{ page: number; strokes: Stroke[] } | null>(null);
  const colouringUrl = useCallback((extra = "") => (colouring ? `/api/mobile/lessons/${colouring.lessonId}/colouring?fileId=${colouring.fileId}${extra}${colouring.token ? `&t=${encodeURIComponent(colouring.token)}` : ""}` : ""), [colouring]);
  useEffect(() => {
    if (!colouring) return;
    let cancelled = false;
    fetch(colouringUrl(), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { pages: [] }))
      .then((j: { pages?: { page: number }[] }) => !cancelled && setColoured(new Set((j.pages ?? []).map((p) => p.page))))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [colouring, colouringUrl]);
  const openColouring = async (page: number) => {
    let strokes: Stroke[] = [];
    try {
      const r = await fetch(colouringUrl(`&page=${page}`), { cache: "no-store" });
      if (r.ok) strokes = ((await r.json()) as { pages?: { strokes: Stroke[] }[] }).pages?.[0]?.strokes ?? [];
    } catch {
      /* start blank */
    }
    setColourPage({ page, strokes });
  };
  const saveColouring = useCallback(
    async (page: number, strokes: Stroke[]) => {
      const r = await fetch(colouringUrl(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileId: colouring!.fileId, page, strokes }) });
      if (!r.ok) throw new Error("save failed");
      setColoured((s) => {
        const n = new Set(s);
        if (strokes.length) n.add(page);
        else n.delete(page);
        return n;
      });
    },
    [colouring, colouringUrl],
  );

  // Read to me: play the teacher's clip for each visible page, then turn the page and
  // carry on until the last recorded page. Turning a page by hand while reading simply
  // continues from there.
  const [reading, setReading] = useState(false);
  const [speaking, setSpeaking] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const narrationRef = useRef(narration);
  useEffect(() => {
    narrationRef.current = narration;
  }, [narration]);
  useEffect(() => {
    if (!reading || status.kind !== "book") return;
    const n = narrationRef.current;
    if (!n) return;
    const total = status.total;
    const idx = current;
    const spread = isPortrait || idx === 0 || idx >= total - 1 ? [idx + 1] : [idx + 1, idx + 2];
    const queue = spread.filter((p) => p <= total && n.pages.includes(p));
    const audio = audioRef.current ?? (audioRef.current = new Audio());
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      setReading(false);
      setSpeaking(null);
    };
    const advance = () => {
      if (cancelled) return;
      if (!n.pages.some((p) => p > spread[spread.length - 1])) return finish();
      flipRef.current?.flipNext();
    };
    const playAt = (i: number) => {
      if (cancelled) return;
      if (i >= queue.length) {
        timer = setTimeout(advance, queue.length ? 700 : 150);
        return;
      }
      const p = queue[i];
      setSpeaking(p);
      audio.src = `${n.src}${n.src.includes("?") ? "&" : "?"}page=${p}`;
      audio.onended = () => playAt(i + 1);
      audio.onerror = () => playAt(i + 1);
      audio.play().catch(finish);
    };
    timer = setTimeout(() => playAt(0), 0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
    };
  }, [reading, current, isPortrait, status]);

  // Keyboard: left/right arrows turn pages.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  const total = status.kind === "book" ? status.total : 0;
  const rendered = status.kind === "book" ? status.rendered : 0;
  const pageLabel = (() => {
    if (!total) return "";
    if (isPortrait || current === 0 || current >= total - 1) return `Page ${current + 1} of ${total}`;
    // Two-page spread: left page is even-indexed when showCover is true.
    const left = current % 2 === 1 ? current : current - 1;
    const right = Math.min(left + 1, total - 1);
    return `Pages ${left + 1}–${right + 1} of ${total}`;
  })();

  return (
    <div className="relative flex flex-col items-center gap-3">
      {colourPage && colouring && <ActivityPad key={colourPage.page} mode="colouring" page={colourPage.page} src={src} initialStrokes={colourPage.strokes} onSave={(strokes) => saveColouring(colourPage.page, strokes)} onClose={() => setColourPage(null)} />}
      {earned.length > 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex justify-center" role="status" aria-live="polite">
          <div className="flex items-center gap-3 rounded-full bg-amber-300 px-5 py-2.5 text-ink-950 shadow-lift">
            <span className="text-2xl" aria-hidden>
              {earned.map((e) => e.emoji).join(" ")}
            </span>
            <span className="font-semibold">
              New sticker{earned.length === 1 ? "" : "s"}: {earned.map((e) => e.label).join(", ")}
            </span>
          </div>
        </div>
      )}
      <div className="w-full rounded-xl bg-ink-950 p-3 sm:p-6" role="region" aria-label={`${title}, book view`} aria-busy={status.kind === "opening"}>
        {status.kind === "opening" && (
          <div className="flex h-[60vh] flex-col items-center justify-center text-sm text-ink-200" role="status">
            <div className="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-ink-500 border-t-white" />
            Opening book…
          </div>
        )}
        {status.kind === "error" && (
          <div className="flex h-[40vh] items-center justify-center text-sm text-red-200">Could not open this PDF as a book. {status.message}</div>
        )}
        <div ref={bookRef} className={status.kind === "book" ? "mx-auto" : "hidden"} style={{ maxWidth: 1400 }} role="img" aria-label={`${title}, ${pageLabel || "pages"}. Use the Previous and Next buttons or the arrow keys to turn pages.`} />
      </div>
      {status.kind === "book" && (
        <div className="flex items-center gap-3 text-sm text-ink-700">
          <button onClick={prev} disabled={current === 0} aria-label="Previous page" className="rounded-full border border-ink-200 bg-white px-4 py-1.5 font-semibold hover:bg-ink-100 disabled:opacity-40" type="button">
            ← Previous
          </button>
          <span className="min-w-32 text-center tabular-nums" aria-live="polite" aria-atomic="true">{pageLabel}</span>
          <button onClick={next} disabled={current >= total - 1} aria-label="Next page" className="rounded-full border border-ink-200 bg-white px-4 py-1.5 font-semibold hover:bg-ink-100 disabled:opacity-40" type="button">
            Next →
          </button>
          {colouring &&
            (isPortrait || current === 0 || current >= total - 1 ? [current + 1] : [current + 1, Math.min(total, current + 2)]).map((p) => (
              <button key={p} type="button" onClick={() => openColouring(p)} className={`ml-2 rounded-full px-4 py-1.5 font-semibold ${coloured.has(p) ? "bg-amber-100 text-amber-900" : "border border-ink-200 bg-white hover:bg-ink-100"}`} aria-label={`Colour page ${p}${coloured.has(p) ? ", already started" : ""}`}>
                🖍️ Colour{total > 1 && !isPortrait && current !== 0 && current < total - 1 ? ` p.${p}` : ""}
              </button>
            ))}
          {narration && narration.pages.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (reading) {
                  setReading(false);
                  setSpeaking(null);
                } else setReading(true);
              }}
              aria-pressed={reading}
              className={`ml-2 rounded-full px-4 py-1.5 font-semibold ${reading ? "bg-amber-300 text-ink-950" : "bg-ink-900 text-white hover:bg-ink-700"}`}
            >
              {reading ? (speaking ? `Reading page ${speaking}… · Stop` : "Turning the page… · Stop") : "🔊 Read to me"}
            </button>
          )}
        </div>
      )}
      {status.kind === "book" && (
        <p className="text-xs text-ink-400" role="status">
          {rendered < total ? `Preparing pages in the background, ${rendered} of ${total} ready. ` : ""}Drag a page corner, click a page edge, or use the arrow keys to turn pages.
        </p>
      )}
    </div>
  );
}
