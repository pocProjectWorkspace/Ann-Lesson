import Link from "next/link";
import { BookCover } from "./book-cover";

export type ShelfBook = { id: string; title: string; fileId: string | null; percent: number; finished: boolean; learnt: boolean; viewed: boolean; lastPage?: number; pageCount?: number | null };

const CLOTH = ["#2f6f73", "#b4532a", "#4a5fc1", "#8a4b9c", "#c08a1e", "#2e7d4f", "#b03a5b", "#3b6ea5"];
export const cloth = (i: number) => CLOTH[i % CLOTH.length];

/**
 * A wooden shelf of books. Each book is its real cover standing up; the one being read
 * leans out with a ribbon; finished books wear a gold star. Children tap a book to open it.
 */
export function Bookshelf({ title, meta, books, hrefFor, tintOffset = 0, coverWidth = 96 }: { title?: string; meta?: string; books: ShelfBook[]; hrefFor: (b: ShelfBook) => string; tintOffset?: number; coverWidth?: number }) {
  return (
    <section aria-label={title ? `${title} shelf` : "Bookshelf"} className="relative">
      {title && (
        <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
          <h2 className="font-display text-[22px] font-extrabold text-ink-950">{title}</h2>
          {meta && <span className="text-sm font-semibold text-ink-500">{meta}</span>}
        </div>
      )}
      <div className="relative">
        <ul className="relative z-10 flex items-end gap-4 overflow-x-auto overflow-y-hidden px-4 pt-6 pb-1 sm:gap-6" style={{ scrollbarWidth: "thin" }}>
          {books.map((b, i) => {
            const reading = b.viewed && !b.finished && !b.learnt;
            return (
              <li key={b.id} className={`shrink-0 ${reading ? "-translate-y-2" : ""}`} style={{ transform: `rotate(${((i % 3) - 1) * 0.8}deg)` }}>
                <Link href={hrefFor(b)} className="group block rounded-md transition-transform duration-200 hover:-translate-y-2 focus-visible:-translate-y-2" aria-label={`${b.title}${b.learnt ? ", learnt" : b.finished ? ", finished" : reading ? `, ${b.percent}% read` : ", new"}`}>
                  <span className="relative block">
                    <BookCover fileId={b.fileId} title={b.title} width={coverWidth} tint={cloth(i + tintOffset)} />
                    {(b.finished || b.learnt) && (
                      <span className="absolute -top-2 -right-2 grid h-8 w-8 rotate-12 place-items-center rounded-full bg-[#f7b733] text-base shadow-md ring-2 ring-white" aria-hidden>
                        ⭐
                      </span>
                    )}
                    {reading && <span className="absolute -top-3 right-3 h-9 w-3 rounded-b-sm bg-[#e4572e] shadow-sm" aria-hidden />}
                  </span>
                  <span className="mt-2 block w-full text-center font-display text-[13px] leading-tight font-bold text-ink-900" style={{ width: coverWidth }}>
                    <span className="line-clamp-2">{b.title}</span>
                    <span className="block text-[11px] font-semibold text-ink-500">{b.learnt ? "Learnt" : b.finished ? "Finished" : reading ? `${b.percent}% read` : "New"}</span>
                  </span>
                </Link>
              </li>
            );
          })}
          {books.length === 0 && <li className="pb-4 text-sm font-semibold text-ink-500">No books on this shelf yet.</li>}
        </ul>
        {/* the shelf plank: books stand on it, labels hang below */}
        <div aria-hidden className="pointer-events-none absolute right-0 left-0 z-0 h-4 rounded-sm" style={{ top: "calc(100% - 3.6rem)", background: "linear-gradient(#c58d55, #a8703f)", boxShadow: "0 6px 0 #7f5230, 0 14px 18px -8px rgba(42,31,61,0.35)" }} />
      </div>
    </section>
  );
}
