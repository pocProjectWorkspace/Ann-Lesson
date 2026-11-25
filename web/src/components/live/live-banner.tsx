"use client";

import Link from "next/link";
import { useLiveRoom } from "./use-live-room";

/** Student home: when the class board is on, offer to join it. */
export function LiveBanner({ classId }: { classId: string }) {
  const { state } = useLiveRoom(classId);
  if (!state) return null;
  return (
    <Link href={`/student/lessons/${state.lessonId}?file=${state.fileId}`} className="mt-7 flex items-center gap-4 rounded-[var(--radius-card)] border border-leaf-600/30 bg-leaf-100/70 px-5 py-4 transition hover:border-leaf-600/60" role="status">
      <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-leaf-600 text-white">
        <span className="block h-3 w-3 animate-pulse rounded-full bg-white" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-leaf-600">Your teacher&apos;s board is on</div>
        <div className="font-display text-lg text-ink-950">{state.follow ? "Join the class and follow along" : "Open the book your teacher is showing"}</div>
      </div>
    </Link>
  );
}
