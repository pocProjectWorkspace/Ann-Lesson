"use client";

import { useEffect } from "react";

type Earned = { id: string; emoji: string; label: string };
const PIECES = Array.from({ length: 28 }, (_, i) => i);
const COLORS = ["#f7b733", "#0f8b8d", "#e4572e", "#8a4b9c", "#2e7d4f", "#4a5fc1"];

/**
 * The moment a child earns a sticker: the page dims, the sticker drops in with a bounce,
 * confetti falls, and it goes away on a tap or after a few seconds. Motion is reduced
 * to a fade when the device asks for it.
 */
export function StickerBurst({ earned, onDone }: { earned: Earned[]; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 5200);
    return () => clearTimeout(t);
  }, [onDone]);
  if (!earned.length) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2a1f3d]/70 p-6" role="dialog" aria-live="assertive" aria-label={`New sticker: ${earned.map((e) => e.label).join(", ")}`} onClick={onDone}>
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {PIECES.map((i) => (
          <span key={i} className="confetti absolute top-[-4%] block h-3 w-2 rounded-sm" style={{ left: `${(i * 37) % 100}%`, background: COLORS[i % COLORS.length], animationDelay: `${(i % 7) * 0.18}s`, animationDuration: `${2.6 + (i % 5) * 0.35}s`, transform: `rotate(${(i * 53) % 360}deg)` }} />
        ))}
      </div>
      <div className="sticker-drop relative flex max-w-sm flex-col items-center rounded-[28px] bg-paper px-8 pt-8 pb-6 text-center shadow-lift">
        <div className="flex gap-3">
          {earned.map((e) => (
            <span key={e.id} className="grid h-24 w-24 place-items-center rounded-full bg-[#f7b733] text-5xl shadow-[0_0_0_8px_rgba(247,183,51,0.3)]" aria-hidden>
              {e.emoji}
            </span>
          ))}
        </div>
        <p className="mt-4 font-display text-[28px] leading-tight font-extrabold text-ink-950">{earned.length === 1 ? "You earned a sticker!" : "New stickers!"}</p>
        <p className="mt-1 text-lg font-bold text-ink-700">{earned.map((e) => e.label).join(" · ")}</p>
        <p className="mt-4 text-sm font-semibold text-ink-500">Tap anywhere to keep reading</p>
      </div>
    </div>
  );
}
