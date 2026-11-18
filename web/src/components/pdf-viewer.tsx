"use client";

import { useSyncExternalStore } from "react";
import { Flipbook } from "./flipbook";

type Mode = "book" | "scroll";
const STORAGE_KEY = "lp.viewerMode";

const listeners = new Set<() => void>();
function readMode(): Mode {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "scroll" ? "scroll" : "book";
  } catch {
    return "book";
  }
}
function writeMode(m: Mode) {
  try {
    window.localStorage.setItem(STORAGE_KEY, m);
  } catch {
    /* not persisted */
  }
  listeners.forEach((l) => l());
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

/**
 * Lesson PDF viewer.
 * Staff get Book and Scroll modes plus a download link.
 * Students get the book only: no scroll view, no full-screen tab, and the
 * book is rendered from images with a name watermark, so the raw PDF is
 * never handed to the browser's own viewer. (Determined viewers can still
 * screenshot pages; this is deterrence, not DRM.)
 */
export function PdfViewer({ fileId, title, viewerName, restricted = false }: { fileId: string; title: string; viewerName?: string; restricted?: boolean }) {
  const src = `/api/files/${fileId}`;
  const saved = useSyncExternalStore(subscribe, readMode, () => "book" as Mode);
  const mode: Mode = restricted ? "book" : saved;

  const tab = (m: Mode, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === m}
      onClick={() => writeMode(m)}
      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${mode === m ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-100"}`}
    >
      {label}
    </button>
  );

  return (
    <section className="overflow-hidden rounded-[var(--radius-card)] border border-ink-200/80 bg-white shadow-card" onContextMenu={restricted ? (e) => e.preventDefault() : undefined}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-4 py-2.5 text-sm">
        <span className="truncate font-semibold text-ink-800">{title}</span>
        {!restricted && (
          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-full border border-ink-200 p-0.5" role="tablist" aria-label="Viewer mode">
              {tab("book", "Book")}
              {tab("scroll", "Scroll")}
            </div>
            <a href={`${src}?download=1`} className="text-xs font-semibold text-ink-500 hover:text-ink-900">
              Download
            </a>
          </div>
        )}
      </header>
      <div className="p-2 sm:p-3">
        {mode === "book" ? (
          <Flipbook key={fileId} src={src} title={title} watermark={restricted ? viewerName : undefined} />
        ) : (
          <iframe src={`${src}#toolbar=0&navpanes=0`} title={title} className="h-[75vh] w-full rounded-lg bg-ink-100" />
        )}
      </div>
    </section>
  );
}
