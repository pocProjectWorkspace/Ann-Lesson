"use client";

import { useState } from "react";
import { useLiveRoom } from "./use-live-room";

/** Phone-sized controls for the board: open a book, turn pages, follow on/off, pick a name, class pulse. */
export function Remote({ classId, className, lessons, students, backHref }: { classId: string; className: string; lessons: { id: string; title: string; files: { id: string; fileName: string }[] }[]; students: string[]; backHref: string }) {
  const { state, people, connected, send } = useLiveRoom(classId);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const act = (c: Record<string, unknown>) =>
    send(c)
      .then(() => setError(null))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  const current = state ? lessons.find((l) => l.id === state.lessonId) : null;
  const studentsHere = people.filter((p) => p.role === "STUDENT");
  const pick = () => {
    if (!students.length) return;
    let n = students[Math.floor(Math.random() * students.length)];
    if (students.length > 1 && n === picked) n = students[(students.indexOf(n) + 1) % students.length];
    setPicked(n);
    void act({ type: "pick", name: n });
  };

  return (
    <div className="mx-auto max-w-md px-4 py-4">
      <div className="flex items-center justify-between">
        <a href={backHref} className="text-sm font-semibold text-ink-500 hover:text-ink-900">
          ← {className}
        </a>
        <span className={`text-xs ${connected ? "text-leaf-600" : "text-ink-400"}`}>{connected ? "Live" : "Reconnecting…"}</span>
      </div>
      <h1 className="mt-2 text-2xl text-ink-950">Board remote</h1>
      {error && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      {!state ? (
        <section className="mt-5 rounded-[var(--radius-card)] border border-ink-200/80 bg-white p-4 shadow-card">
          <h2 className="font-semibold text-ink-900">Open a book on the board</h2>
          <p className="mt-1 text-sm text-ink-500">The board at the front picks this up the moment it is open on the same lesson, and students can follow it.</p>
          <ul className="mt-3 space-y-2">
            {lessons.map((l) => (
              <li key={l.id}>
                <button type="button" onClick={() => act({ type: "open", lessonId: l.id, fileId: l.files[0].id })} className="w-full rounded-lg border border-ink-200 px-3 py-3 text-left text-sm font-semibold text-ink-900 hover:bg-ink-100">
                  {l.title}
                  {l.files.length > 1 && <span className="block text-xs font-normal text-ink-500">{l.files.length} books, opens the first</span>}
                </button>
              </li>
            ))}
            {lessons.length === 0 && <li className="text-sm text-ink-500">No lessons with a PDF in this class yet.</li>}
          </ul>
        </section>
      ) : (
        <>
          <section className="mt-5 rounded-[var(--radius-card)] border border-ink-200/80 bg-white p-4 shadow-card">
            <p className="truncate text-sm font-semibold text-ink-900">{current?.title ?? "Book"}</p>
            <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <button type="button" onClick={() => act({ type: "page", page: Math.max(1, state.page - 1) })} className="rounded-2xl bg-ink-900 py-6 text-3xl text-white active:bg-ink-700" aria-label="Previous page">
                ‹
              </button>
              <div className="text-center">
                <div className="font-display text-4xl text-ink-950">{state.page}</div>
                <div className="text-xs text-ink-500">page</div>
              </div>
              <button type="button" onClick={() => act({ type: "page", page: state.page + 1 })} className="rounded-2xl bg-ink-900 py-6 text-3xl text-white active:bg-ink-700" aria-label="Next page">
                ›
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => act({ type: "follow", on: !state.follow })} className={`rounded-xl px-3 py-3 text-sm font-semibold ${state.follow ? "bg-leaf-100 text-leaf-600" : "border border-ink-200 text-ink-900"}`}>
                {state.follow ? "Students following · release" : "Make students follow"}
              </button>
              <button type="button" onClick={pick} disabled={!students.length} className="rounded-xl border border-ink-200 px-3 py-3 text-sm font-semibold text-ink-900 disabled:opacity-40">
                {picked ? `Picked: ${picked}` : "Pick a child"}
              </button>
            </div>
            {current && current.files.length > 1 && (
              <select value={state.fileId} onChange={(e) => act({ type: "open", lessonId: state.lessonId, fileId: e.target.value })} aria-label="Book" className="mt-3 w-full rounded-lg border border-ink-200 px-2 py-2 text-sm">
                {current.files.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.fileName}
                  </option>
                ))}
              </select>
            )}
            <button type="button" onClick={() => act({ type: "close" })} className="mt-3 w-full rounded-xl border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700">
              Close the board for this class
            </button>
          </section>

          <section className="mt-4 rounded-[var(--radius-card)] border border-ink-200/80 bg-white p-4 shadow-card">
            <h2 className="font-semibold text-ink-900">In the room</h2>
            <p className="text-xs text-ink-500">{studentsHere.length} student{studentsHere.length === 1 ? "" : "s"} connected{state.follow ? ", following page " + state.page : ""}</p>
            {studentsHere.length > 0 && (
              <ul className="mt-2 grid grid-cols-2 gap-1.5 text-sm">
                {studentsHere.map((p) => (
                  <li key={p.id} className="flex items-center justify-between rounded-lg bg-paper/70 px-2.5 py-1.5">
                    <span className="truncate text-ink-900">{p.name}</span>
                    <span className={`ml-2 shrink-0 text-xs ${p.page === state.page ? "text-leaf-600" : "text-ink-500"}`}>{p.page ? `p.${p.page}` : "–"}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
