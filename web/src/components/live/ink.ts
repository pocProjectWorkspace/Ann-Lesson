import type { Stroke } from "@/lib/strokes";
export type { Stroke };

/**
 * Shared ink for the board, the child's pad and thumbnails. Strokes are page-relative
 * (0..1 of page width and height) so the same list paints at any size.
 *
 * Tools: pen and highlighter (lines), crayon (a thick, slightly transparent line that
 * keeps the printed outlines visible) and fill (tap inside a shape: the area bounded by
 * the page's dark lines is flooded with colour, like a bucket in a colouring app). A
 * fill is stored as its seed point and colour, and recomputed from the page pixels
 * wherever it is painted, so it costs nothing to store or send.
 */

export const INK_COLORS = ["#e11d48", "#2563eb", "#16a34a", "#111827"];
export const CRAYON_COLORS = ["#ef4444", "#f97316", "#facc15", "#84cc16", "#22c55e", "#14b8a6", "#38bdf8", "#3b82f6", "#8b5cf6", "#ec4899", "#a16207", "#1f2937"];
export const PEN_WIDTH = 0.006; // of page width
export const HIGHLIGHT_WIDTH = 0.03;
export const CRAYON_WIDTH = 0.022;

const FILL_TOLERANCE = 64; // colour distance from the seed pixel that still counts as "the same area"
const LINE_LUMA = 110; // darker than this is an outline, which a fill never crosses

type Mask = { data: Uint8Array; w: number; h: number } | null;
const pixelCache = new WeakMap<HTMLCanvasElement, Map<string, Uint8ClampedArray>>();
const maskCache = new WeakMap<HTMLCanvasElement, Map<string, Mask>>();

function pagePixels(page: HTMLCanvasElement, w: number, h: number) {
  let byPage = pixelCache.get(page);
  if (!byPage) pixelCache.set(page, (byPage = new Map()));
  const key = `${w}x${h}`;
  let px = byPage.get(key);
  if (!px) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(page, 0, 0, w, h);
    px = ctx.getImageData(0, 0, w, h).data;
    byPage.set(key, px);
  }
  return px;
}

/** The region of the page around (x, y) bounded by dark lines, as a byte mask. */
export function fillRegion(page: HTMLCanvasElement, w: number, h: number, x: number, y: number): Mask {
  const sx = Math.min(w - 1, Math.max(0, Math.floor(x * w)));
  const sy = Math.min(h - 1, Math.max(0, Math.floor(y * h)));
  let byPage = maskCache.get(page);
  if (!byPage) maskCache.set(page, (byPage = new Map()));
  const key = `${w}x${h}@${sx},${sy}`;
  if (byPage.has(key)) return byPage.get(key)!;
  const px = pagePixels(page, w, h);
  const luma = (i: number) => 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
  const seed = (sy * w + sx) * 4;
  let mask: Mask = null;
  if (luma(seed) >= LINE_LUMA) {
    const [r0, g0, b0] = [px[seed], px[seed + 1], px[seed + 2]];
    const data = new Uint8Array(w * h);
    const stack: number[] = [sy * w + sx];
    const ok = (p: number) => {
      const i = p * 4;
      if (luma(i) < LINE_LUMA) return false;
      const d = Math.abs(px[i] - r0) + Math.abs(px[i + 1] - g0) + Math.abs(px[i + 2] - b0);
      return d <= FILL_TOLERANCE * 2;
    };
    while (stack.length) {
      const p = stack.pop()!;
      if (data[p]) continue;
      if (!ok(p)) continue;
      // Scanline: walk left and right, then seed the rows above and below.
      let l = p;
      while (l % w > 0 && !data[l - 1] && ok(l - 1)) l--;
      let r = p;
      while (r % w < w - 1 && !data[r + 1] && ok(r + 1)) r++;
      for (let q = l; q <= r; q++) {
        data[q] = 1;
        if (q >= w && !data[q - w]) stack.push(q - w);
        if (q + w < w * h && !data[q + w]) stack.push(q + w);
      }
    }
    mask = { data, w, h };
  }
  byPage.set(key, mask);
  return mask;
}

/** Whether a page-relative point lies inside a fill stroke's region. */
export function fillContains(page: HTMLCanvasElement | null | undefined, w: number, h: number, s: Stroke, x: number, y: number) {
  if (!page || s.tool !== "fill") return false;
  const m = fillRegion(page, w, h, s.points[0][0], s.points[0][1]);
  if (!m) return false;
  const px = Math.min(w - 1, Math.max(0, Math.floor(x * w)));
  const py = Math.min(h - 1, Math.max(0, Math.floor(y * h)));
  return m.data[py * w + px] === 1;
}

const fillCanvasCache = new WeakMap<HTMLCanvasElement, Map<string, HTMLCanvasElement>>();
function fillCanvas(page: HTMLCanvasElement, w: number, h: number, s: Stroke) {
  let byPage = fillCanvasCache.get(page);
  if (!byPage) fillCanvasCache.set(page, (byPage = new Map()));
  const key = `${w}x${h}@${s.points[0][0].toFixed(4)},${s.points[0][1].toFixed(4)}:${s.color}`;
  let c = byPage.get(key);
  if (c) return c;
  const m = fillRegion(page, w, h, s.points[0][0], s.points[0][1]);
  c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  if (m) {
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(w, h);
    const rgb = hex(s.color);
    for (let i = 0; i < m.data.length; i++) {
      if (!m.data[i]) continue;
      img.data[i * 4] = rgb[0];
      img.data[i * 4 + 1] = rgb[1];
      img.data[i * 4 + 2] = rgb[2];
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }
  byPage.set(key, c);
  return c;
}
const hex = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

/**
 * Draw page-relative strokes onto a canvas of the given pixel size. `page` is the
 * rendered page (needed for fills). `onPage` means the canvas already has the page drawn
 * on it (thumbnails), so colour is multiplied over it and the outlines stay visible; an
 * overlay canvas gets the same effect from CSS mix-blend-mode: multiply.
 */
export function paintStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], w: number, h: number, live?: Stroke | null, opts: { page?: HTMLCanvasElement | null; onPage?: boolean } = {}) {
  for (const s of live ? [...strokes, live] : strokes) {
    if (s.points.length === 0) continue;
    ctx.save();
    if (opts.onPage && (s.tool === "crayon" || s.tool === "fill")) ctx.globalCompositeOperation = "multiply";
    if (s.tool === "fill") {
      if (opts.page) {
        ctx.globalAlpha = 0.9;
        ctx.drawImage(fillCanvas(opts.page, w, h, s), 0, 0);
      }
      ctx.restore();
      continue;
    }
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = s.color;
    ctx.globalAlpha = s.tool === "highlighter" ? 0.35 : s.tool === "crayon" ? 0.85 : 1;
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

/** How many pages a PDF has, from its metadata only. */
export async function pdfPageCount(src: string): Promise<number> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const task = pdfjs.getDocument({ url: src, withCredentials: false, rangeChunkSize: 1024 * 1024, disableAutoFetch: true });
  const doc = await task.promise;
  const n = doc.numPages;
  await task.destroy();
  return n;
}

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
