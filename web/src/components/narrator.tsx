"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pdfPageCount, renderPageImage } from "./live/ink";

type Clip = { page: number; durationMs: number | null; sizeBytes: number; updatedAt: string; by: string | null };

/**
 * The teacher's recording desk for read-to-me. One page at a time: see the page, press
 * record, read it aloud, stop. The clip is saved the moment recording stops. A clip can
 * be played back, re-recorded, replaced by an audio file, or removed.
 */
export function Narrator({ fileId, pageCount: knownPages, initialClips }: { fileId: string; pageCount: number | null; initialClips: Clip[] }) {
  const [pageCount, setPageCount] = useState(knownPages ?? Math.max(1, ...initialClips.map((c) => c.page)));
  const [page, setPage] = useState(() => {
    const done = new Set(initialClips.map((c) => c.page));
    const n = knownPages ?? Math.max(1, ...initialClips.map((c) => c.page));
    for (let p = 1; p <= n; p++) if (!done.has(p)) return p;
    return 1;
  });
  const [clips, setClips] = useState<Map<number, Clip>>(() => new Map(initialClips.map((c) => [c.page, c])));
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0); // bumps the audio src after a save
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const src = `/api/files/${fileId}`;
  const clip = clips.get(page);

  // Learn the real page count from the PDF when nobody has opened the book yet.
  useEffect(() => {
    if (knownPages) return;
    let cancelled = false;
    pdfPageCount(src)
      .then((n) => !cancelled && setPageCount(n))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [knownPages, src]);

  // Draw the current page.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const canvas = canvasRef.current;
      const stage = stageRef.current;
      if (!canvas || !stage) return;
      try {
        const img = await renderPageImage(src, page, Math.min(stage.clientWidth, 720));
        if (cancelled) return;
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.style.width = "100%";
        canvas.style.height = "auto";
        canvas.getContext("2d")!.drawImage(img, 0, 0);
      } catch {
        /* page not renderable; the controls still work */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [src, page]);

  // Recording clock.
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setElapsed(Date.now() - startedAt.current), 200);
    return () => clearInterval(t);
  }, [recording]);

  const save = useCallback(
    async (blob: Blob, durationMs: number | null) => {
      setBusy("Saving…");
      setError(null);
      try {
        const type = blob.type.split(";")[0] || "audio/webm";
        const res = await fetch(`/api/uploads/narration?fileId=${fileId}&page=${page}${durationMs ? `&duration=${Math.round(durationMs)}` : ""}`, { method: "PUT", headers: { "Content-Type": type }, body: blob });
        const data = (await res.json().catch(() => ({}))) as { error?: string; durationMs?: number | null; sizeBytes?: number };
        if (!res.ok) throw new Error(data.error ?? `Save failed (${res.status})`);
        setClips((m) => new Map(m).set(page, { page, durationMs: data.durationMs ?? durationMs, sizeBytes: data.sizeBytes ?? blob.size, updatedAt: new Date().toISOString(), by: "you" }));
        setVersion((v) => v + 1);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save the recording");
      } finally {
        setBusy(null);
      }
    },
    [fileId, page],
  );

  const start = async () => {
    setError(null);
    if (typeof MediaRecorder === "undefined") return setError("This browser cannot record audio. Use the file upload instead.");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((m) => MediaRecorder.isTypeSupported(m));
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 48_000 } : undefined);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        const ms = Date.now() - startedAt.current;
        setRecording(false);
        if (blob.size > 0 && ms > 400) void save(blob, ms);
        else setError("That was too short. Press record and read the page aloud.");
      };
      recorder.current = rec;
      startedAt.current = Date.now();
      setElapsed(0);
      setRecording(true);
      rec.start();
    } catch {
      setError("Microphone access was refused. Allow the microphone for this site, or upload an audio file.");
    }
  };
  const stop = () => recorder.current?.state !== "inactive" && recorder.current?.stop();

  const remove = async () => {
    setBusy("Removing…");
    setError(null);
    try {
      const res = await fetch(`/api/uploads/narration?fileId=${fileId}&page=${page}`, { method: "DELETE" });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Could not remove");
      setClips((m) => {
        const n = new Map(m);
        n.delete(page);
        return n;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove the recording");
    } finally {
      setBusy(null);
    }
  };

  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("audio/")) return setError("Choose an audio file (mp3, m4a, wav, ogg or webm).");
    void save(f, null);
  };

  const done = clips.size;
  const fmt = (ms: number | null | undefined) => (ms ? `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}` : "");

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
      <div ref={stageRef} className="rounded-xl bg-ink-950 p-3">
        <canvas ref={canvasRef} className="mx-auto block max-w-[720px] rounded-sm bg-white" aria-label={`Page ${page}`} />
      </div>
      <div className="space-y-4">
        <div className="rounded-[var(--radius-card)] border border-ink-200/80 bg-white p-4 shadow-card">
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1 || recording} className="rounded-full border border-ink-200 px-3 py-1.5 text-sm font-semibold disabled:opacity-40">
              ← Prev
            </button>
            <span className="font-display text-xl text-ink-950">
              Page {page} <span className="text-base text-ink-400">of {pageCount}</span>
            </span>
            <button type="button" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page === pageCount || recording} className="rounded-full border border-ink-200 px-3 py-1.5 text-sm font-semibold disabled:opacity-40">
              Next →
            </button>
          </div>
          <ol className="mt-3 flex flex-wrap gap-1" aria-label="Pages">
            {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
              <li key={p}>
                <button type="button" onClick={() => !recording && setPage(p)} aria-current={p === page ? "page" : undefined} aria-label={`Page ${p}${clips.has(p) ? ", recorded" : ""}`} className={`h-7 min-w-7 rounded-md px-1 text-xs font-semibold ${p === page ? "ring-2 ring-ink-900" : ""} ${clips.has(p) ? "bg-leaf-100 text-leaf-600" : "bg-ink-100 text-ink-500"}`}>
                  {p}
                </button>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-ink-500">
            {done} of {pageCount} page{pageCount === 1 ? "" : "s"} recorded. Green pages have a clip.
          </p>
        </div>

        <div className="rounded-[var(--radius-card)] border border-ink-200/80 bg-white p-4 shadow-card">
          {error && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          {recording ? (
            <button type="button" onClick={stop} className="flex w-full items-center justify-center gap-3 rounded-xl bg-rose-600 px-4 py-4 text-lg font-bold text-white">
              <span className="h-3 w-3 animate-pulse rounded-full bg-white" aria-hidden />
              Stop · {fmt(elapsed)}
            </button>
          ) : (
            <button type="button" onClick={start} disabled={!!busy} className="flex w-full items-center justify-center gap-3 rounded-xl bg-ink-900 px-4 py-4 text-lg font-bold text-white disabled:opacity-50">
              <span className="h-3 w-3 rounded-full bg-rose-400" aria-hidden />
              {busy ?? (clip ? "Record again" : "Record this page")}
            </button>
          )}
          <p className="mt-2 text-xs text-ink-500">Read the page aloud at the pace you would in class. Saving happens when you press stop.</p>

          {clip && !recording && (
            <div className="mt-4 rounded-lg bg-paper/70 p-3">
              <p className="text-sm font-semibold text-ink-900">
                Recorded{clip.durationMs ? `, ${fmt(clip.durationMs)}` : ""}
                {clip.by && clip.by !== "you" ? ` by ${clip.by}` : ""}
              </p>
              <audio ref={audioRef} key={`${page}:${version}`} controls preload="none" src={`${src}/narration?page=${page}&v=${version}`} className="mt-2 w-full" />
              <button type="button" onClick={remove} disabled={!!busy} className="mt-2 text-sm font-semibold text-rose-700 hover:underline disabled:opacity-50">
                Remove this recording
              </button>
            </div>
          )}

          <label className="mt-4 block text-sm">
            <span className="font-semibold text-ink-900">Or upload an audio file for this page</span>
            <input type="file" accept="audio/*" disabled={recording || !!busy} onChange={(e) => onFile(e.target.files?.[0])} className="mt-1 block w-full text-sm text-ink-600 file:mr-3 file:rounded-full file:border-0 file:bg-ink-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold" />
          </label>
        </div>
      </div>
    </div>
  );
}
