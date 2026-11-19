"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PageFlip } from "page-flip";
import type { PDFDocumentProxy } from "pdfjs-dist";

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
 */
export function Flipbook({ src, title, watermark }: { src: string; title: string; watermark?: string }) {
  const bookRef = useRef<HTMLDivElement>(null);
  const flipRef = useRef<PageFlip | null>(null);
  const currentRef = useRef(0);
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
      flip.on("flip", (e) => {
        const idx = Number(e.data);
        currentRef.current = idx;
        setCurrent(idx);
        wake?.(); // re-prioritise the render queue around the new page
      });
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
  }, [doc, status.kind, ratio, watermark]);

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
    <div className="flex flex-col items-center gap-3">
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
