import type { Stroke } from "@/app/board/actions";
export type { Stroke };

export const INK_COLORS = ["#e11d48", "#2563eb", "#16a34a", "#111827"];
export const PEN_WIDTH = 0.006; // of page width
export const HIGHLIGHT_WIDTH = 0.03;

/** Draw page-relative strokes onto a canvas of the given pixel size. */
export function paintStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], w: number, h: number, live?: Stroke | null) {
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

const imageCache = new Map<string, Promise<HTMLCanvasElement>>();

/**
 * Render one PDF page to an offscreen canvas at the given CSS width (device pixels
 * applied inside). Cached per file, page and width so a thumbnail wall renders the
 * page once and only paints strokes per student.
 */
export function renderPageImage(src: string, page: number, cssWidth: number): Promise<HTMLCanvasElement> {
  const key = `${src}|${page}|${cssWidth}`;
  let p = imageCache.get(key);
  if (!p) {
    p = (async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const task = pdfjs.getDocument({ url: src, withCredentials: false, rangeChunkSize: 1024 * 1024, disableAutoFetch: true });
      const doc = await task.promise;
      const pdfPage = await doc.getPage(page);
      const base = pdfPage.getViewport({ scale: 1 });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = pdfPage.getViewport({ scale: (cssWidth / base.width) * dpr });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext("2d")!;
      await pdfPage.render({ canvas, canvasContext: ctx, viewport }).promise;
      pdfPage.cleanup();
      await task.destroy();
      return canvas;
    })();
    imageCache.set(key, p);
    p.catch(() => imageCache.delete(key));
  }
  return p;
}
