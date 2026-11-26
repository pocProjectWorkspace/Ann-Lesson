"use client";

import { useState } from "react";
import { StrokeThumb } from "./stroke-thumb";
import type { LiveActivity, Presence, Submission } from "./use-live-room";

/**
 * The board's view of an activity: one thumbnail per child, filling in live as they
 * draw, with a tap to enlarge. Children in the room who have not drawn yet appear
 * as empty cards so the teacher sees who is still working.
 */
export function DeskWall({ activity, src, submissions, people, onClose }: { activity: LiveActivity; src: string; submissions: Submission[]; people: Presence[]; onClose: () => void }) {
  const [big, setBig] = useState<Submission | null>(null);
  const students = people.filter((p) => p.role === "STUDENT");
  const waiting = students.filter((p) => !submissions.some((s) => s.studentId === p.id));
  const done = submissions.filter((s) => s.done).length;

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-[#0b0f1a]/97 text-white">
      <header className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
        <span className="font-display text-base">Desks · page {activity.page}</span>
        {activity.prompt && <span className="rounded-full bg-amber-300 px-3 py-0.5 font-semibold text-ink-950">{activity.prompt}</span>}
        <span className="text-white/60">
          {submissions.length} drawing{submissions.length === 1 ? "" : "s"}, {done} sent, {waiting.length} still working
        </span>
        <button type="button" onClick={onClose} className="ml-auto rounded-lg bg-white px-3 py-1.5 font-semibold text-ink-950 hover:bg-white/90">
          Close activity
        </button>
      </header>
      {big ? (
        <div className="flex min-h-0 flex-1 flex-col items-center p-3" onClick={() => setBig(null)} role="button" tabIndex={0} aria-label={`${big.name}, tap to go back to the wall`} onKeyDown={(e) => e.key === "Escape" && setBig(null)}>
          <div className="mb-2 font-display text-2xl">{big.name}</div>
          <div className="min-h-0 flex-1 overflow-auto">
            <StrokeThumb src={src} page={activity.page} strokes={big.strokes} width={Math.min(700, typeof window !== "undefined" ? window.innerWidth - 240 : 700)} className="rounded-sm shadow-2xl" />
          </div>
          <div className="mt-2 text-xs text-white/50">Tap anywhere to return to the wall</div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-3">
          {submissions.length === 0 && waiting.length === 0 && <p className="p-6 text-center text-white/60">Waiting for students to open the activity on their devices…</p>}
          <ul className="grid grid-cols-3 gap-3 md:grid-cols-4 xl:grid-cols-6" aria-label="Student drawings">
            {submissions.map((s) => (
              <li key={s.studentId}>
                <button type="button" onClick={() => setBig(s)} className={`w-full overflow-hidden rounded-xl border-2 bg-white text-left ${s.done ? "border-emerald-400" : "border-white/20"}`} aria-label={`${s.name}${s.done ? ", sent" : ", still drawing"}`}>
                  <StrokeThumb src={src} page={activity.page} strokes={s.strokes} width={220} className="w-full" />
                  <div className="flex items-center justify-between px-2 py-1 text-xs text-ink-950">
                    <span className="truncate font-semibold">{s.name}</span>
                    <span className={s.done ? "text-emerald-700" : "text-ink-500"}>{s.done ? "sent" : "drawing"}</span>
                  </div>
                </button>
              </li>
            ))}
            {waiting.map((p) => (
              <li key={p.id} className="flex aspect-[3/4] items-center justify-center rounded-xl border-2 border-dashed border-white/20 text-center text-xs text-white/60">
                {p.name.split(" ")[0]}
                <br />
                working…
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
