"use client";

import { useEffect, useRef } from "react";
import { paintStrokes, renderPageImage, type Stroke } from "./ink";

/** A page with a child's strokes on it, at any size. Used on the board wall and in review. */
export function StrokeThumb({ src, page, strokes, width, className }: { src: string; page: number; strokes: Stroke[]; width: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    renderPageImage(src, page, width)
      .then((img) => {
        const c = ref.current;
        if (cancelled || !c) return;
        c.width = img.width;
        c.height = img.height;
        c.style.width = `${width}px`;
        c.style.height = `${(width * img.height) / img.width}px`;
        const ctx = c.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        paintStrokes(ctx, strokes, c.width, c.height);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [src, page, strokes, width]);
  return <canvas ref={ref} className={className} aria-hidden />;
}
