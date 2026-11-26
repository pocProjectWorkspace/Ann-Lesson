import type { StickerView, StreakView } from "@/lib/stickers";

/**
 * The child's sticker shelf: today's streak, the stickers earned and given, and the next
 * badge within reach. Server component; used on the student home.
 */
export function StickerShelf({ streak, stickers, next }: { streak: StreakView; stickers: StickerView[]; next: { emoji: string; label: string; have: number; need: number; unit: string } | null }) {
  const recent = stickers.slice(0, 18);
  return (
    <section className="mt-8 rounded-[var(--radius-card)] border border-ink-200/80 bg-white px-5 py-4 shadow-card" aria-label="My stickers">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl text-ink-900">My stickers</h2>
        <Streak streak={streak} />
      </div>
      {recent.length === 0 ? (
        <p className="mt-3 text-sm text-ink-500">Your shelf is empty. Finish a book to earn your first sticker, and read every day to grow a streak.</p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label={`${stickers.length} sticker${stickers.length === 1 ? "" : "s"}`}>
          {recent.map((s) => (
            <li key={s.id} className="flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 py-1 pr-3 pl-1.5 text-sm" title={s.note ? `${s.label}: ${s.note}` : s.label}>
              <span className="grid h-8 w-8 place-items-center rounded-full bg-white text-lg shadow-sm" aria-hidden>
                {s.emoji}
              </span>
              <span className="leading-tight">
                <span className="block font-semibold text-ink-900">{s.label}</span>
                {(s.givenBy || s.note) && <span className="block text-xs text-ink-500">{s.note ? s.note : `from ${s.givenBy}`}</span>}
              </span>
            </li>
          ))}
          {stickers.length > recent.length && <li className="self-center text-sm text-ink-500">and {stickers.length - recent.length} more</li>}
        </ul>
      )}
      {next && (
        <p className="mt-3 text-sm text-ink-500">
          Next up <span aria-hidden>{next.emoji}</span> <span className="font-semibold text-ink-900">{next.label}</span>: {next.have} of {next.need} {next.unit}
          {next.need === 1 ? "" : "s"}
        </p>
      )}
    </section>
  );
}

export function Streak({ streak }: { streak: StreakView }) {
  if (streak.current === 0) return <span className="text-sm text-ink-500">Read today to start a streak</span>;
  return (
    <span className="flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1 text-sm text-orange-900" aria-label={`${streak.current} day streak${streak.readToday ? "" : ", read today to keep it"}`}>
      <span aria-hidden className="text-lg">🔥</span>
      <span className="font-semibold">
        {streak.current} day{streak.current === 1 ? "" : "s"} in a row
      </span>
      <span className="text-orange-700">{streak.readToday ? (streak.best > streak.current ? `· best ${streak.best}` : "· your best") : "· read today to keep it"}</span>
    </span>
  );
}
