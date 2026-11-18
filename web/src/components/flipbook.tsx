"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PageFlip } from "page-flip";

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

type Status = { kind: "loading"; done: number; total: number } | { kind: "ready" } | { kind: "error"; message: string };

/**
 * Renders a PDF as a page-turning book.
 * 1. pdf.js draws every page to an offscreen canvas and we keep a JPEG per page.
 * 2. page-flip animates those images as a two-page spread (one page on narrow screens).
 */
export function Flipbook({ src, title, watermark }: { src: string; title: string; watermark?: string }) {
  const bookRef = useRef<HTMLDivElement>(null);
  const flipRef = useRef<PageFlip | null>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [ratio, setRatio] = useState(1.414); // height / width of a page
  const [status, setStatus] = useState<Status>({ kind: "loading", done: 0, total: 0 });
  const [current, setCurrent] = useState(0);
  const [isPortrait, setIsPortrait] = useState(false);

  // Step 1: rasterise the PDF pages.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const task = pdfjs.getDocument({ url: src, withCredentials: true });
        const doc = await task.promise;
        const total = doc.numPages;
        setStatus({ kind: "loading", done: 0, total });
        const images: string[] = [];
        for (let i = 1; i <= total; i++) {
          const page = await doc.getPage(i);
          const base = page.getViewport({ scale: 1 });
          if (i === 1) setRatio(base.height / base.width);
          // Aim for ~1200px wide pages, enough for crisp text on a desktop spread.
          const scale = Math.min(2.5, 1200 / base.width);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Canvas not supported");
          await page.render({ canvas, canvasContext: ctx, viewport }).promise;
          if (watermark) stampWatermark(ctx, canvas.width, canvas.height, watermark);
          images.push(canvas.toDataURL("image/jpeg", 0.85));
          page.cleanup();
          if (cancelled) return;
          setStatus({ kind: "loading", done: i, total });
        }
        await task.destroy();
        if (cancelled) return;
        setPages(images);
        setStatus({ kind: "ready" });
      } catch (e) {
        if (!cancelled) setStatus({ kind: "error", message: e instanceof Error ? e.message : "Could not load PDF" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [src, watermark]);

  // Step 2: mount the flip book once images exist.
  useEffect(() => {
    if (status.kind !== "ready" || pages.length === 0 || !bookRef.current) return;
    let flip: PageFlip | undefined;
    let observer: ResizeObserver | undefined;
    let disposed = false;
    (async () => {
      const { PageFlip } = await import("page-flip");
      if (disposed || !bookRef.current) return;
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
      flip.loadFromImages(pages);
      flip.on("flip", (e) => setCurrent(Number(e.data)));
      flip.on("changeOrientation", (e: { data: string }) => setIsPortrait(e.data === "portrait"));
      setIsPortrait(flip.getOrientation() === "portrait");
      flipRef.current = flip;

      // page-flip measures its container once at creation. If layout has not settled yet
      // (fonts, sidebar, flex) the canvas keeps a stale size and pages look squashed.
      // Re-measure on the next frame and whenever the container changes size.
      const remeasure = () => {
        if (disposed || !flipRef.current) return;
        try {
          // page-flip only re-sizes its canvas inside its own window "resize" handler.
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
    })();
    return () => {
      disposed = true;
      observer?.disconnect();
      flip?.destroy();
      flipRef.current = null;
    };
  }, [status.kind, pages, ratio]);

  const prev = useCallback(() => flipRef.current?.flipPrev(), []);
  const next = useCallback(() => flipRef.current?.flipNext(), []);

  // Keyboard: left/right arrows turn pages.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  const total = pages.length;
  const pageLabel = (() => {
    if (!total) return "";
    if (isPortrait || current === 0 || current >= total - 1) return `Page ${current + 1} of ${total}`;
    // Two-page spread: left page is even-indexed when showCover is true.
    const left = current % 2 === 1 ? current : current - 1;
    const right = Math.min(left + 1, total - 1);
    return `Pages ${left + 1}–${right + 1} of ${total}`;
  })();

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="w-full rounded-xl bg-ink-950 p-3 sm:p-6" role="region" aria-label={`${title}, book view`} aria-busy={status.kind === "loading"}>
        {status.kind === "loading" && (
          <div className="flex h-[60vh] flex-col items-center justify-center text-sm text-ink-200" role="status">
            <div className="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-ink-500 border-t-white" />
            {status.total ? `Preparing page ${status.done} of ${status.total}…` : "Opening book…"}
          </div>
        )}
        {status.kind === "error" && (
          <div className="flex h-[40vh] items-center justify-center text-sm text-red-200">Could not open this PDF as a book. {status.message}</div>
        )}
        <div ref={bookRef} className={status.kind === "ready" ? "mx-auto" : "hidden"} style={{ maxWidth: 1400 }} role="img" aria-label={`${title}, ${pageLabel || "pages"}. Use the Previous and Next buttons or the arrow keys to turn pages.`} />
      </div>
      {status.kind === "ready" && (
        <div className="flex items-center gap-3 text-sm text-ink-700">
          <button onClick={prev} disabled={current === 0} aria-label="Previous page" className="rounded-full border border-ink-200 bg-white px-4 py-1.5 font-semibold hover:bg-ink-100 disabled:opacity-40" type="button">
            ← Previous
          </button>
          <span className="min-w-32 text-center tabular-nums" aria-live="polite" aria-atomic="true">{pageLabel}</span>
          <button onClick={next} disabled={current >= total - 1} aria-label="Next page" className="rounded-full border border-ink-200 bg-white px-4 py-1.5 font-semibold hover:bg-ink-100 disabled:opacity-40" type="button">
            Next →
          </button>
        </div>
      )}
      {status.kind === "ready" && <p className="text-xs text-ink-400">Drag a page corner, click a page edge, or use the arrow keys to turn pages.</p>}
    </div>
  );
}
