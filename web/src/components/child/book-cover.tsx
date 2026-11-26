"use client";

import { useEffect, useRef, useState } from "react";
import { renderPageImage } from "@/components/live/ink";

/**
 * The real cover of a book: page 1 of its PDF, rendered small and cached. Until it is
 * ready (or when a lesson has no PDF yet) a coloured cloth cover with the title stands in.
 */
export function BookCover({ fileId, title, width, tint, className }: { fileId: string | null; title: string; width: number; tint: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!fileId) return;
    let cancelled = false;
    renderPageImage(`/api/files/${fileId}`, 1, width)
      .then((img) => {
        const c = ref.current;
        if (cancelled || !c) return;
        c.width = img.width;
        c.height = img.height;
        c.getContext("2d")!.drawImage(img, 0, 0);
        setReady(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [fileId, width]);
  return (
    <span className={`relative block overflow-hidden rounded-r-md rounded-l-sm shadow-[2px_3px_0_rgba(42,31,61,0.18),0_10px_18px_-10px_rgba(42,31,61,0.5)] ${className ?? ""}`} style={{ width, minHeight: width * 1.3, background: tint }} aria-hidden>
      {/* spine crease */}
      <span className="pointer-events-none absolute inset-y-0 left-0 z-10 w-1.5 bg-black/15" />
      <span className="pointer-events-none absolute inset-y-0 left-1.5 z-10 w-px bg-white/40" />
      {!ready && (
        <span className="absolute inset-0 flex items-end p-2">
          <span className="font-display text-[13px] leading-tight font-extrabold text-white/95 drop-shadow" style={{ display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {title}
          </span>
        </span>
      )}
      <canvas ref={ref} className={`block w-full ${ready ? "" : "invisible"}`} style={{ width }} />
    </span>
  );
}
