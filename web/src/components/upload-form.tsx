"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Field, Input } from "./ui";

/**
 * Uploads PDFs straight to /api/uploads/lesson-file with a progress bar.
 * Files are checked for the PDF signature in the browser before sending, and
 * again on the server.
 */
export function LessonUploadForm({ lessonId }: { lessonId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ name: string; pct: number } | null>(null);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  async function isPdf(file: File) {
    const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
    const sig = [0x25, 0x50, 0x44, 0x46, 0x2d];
    for (let i = 0; i + 5 <= head.length; i++) if (sig.every((b, j) => head[i + j] === b)) return true;
    return false;
  }

  function put(file: File) {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", `/api/uploads/lesson-file?lessonId=${encodeURIComponent(lessonId)}&name=${encodeURIComponent(file.name)}`);
      xhr.setRequestHeader("Content-Type", "application/pdf");
      xhr.upload.onprogress = (e) => e.lengthComputable && setProgress({ name: file.name, pct: Math.round((e.loaded / e.total) * 100) });
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) return resolve();
        try {
          reject(new Error(JSON.parse(xhr.responseText).error ?? `Upload failed (${xhr.status})`));
        } catch {
          reject(new Error(`Upload failed (${xhr.status})`));
        }
      };
      xhr.onerror = () => reject(new Error("Network error during upload"));
      xhr.send(file);
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const files = Array.from(inputRef.current?.files ?? []);
    if (files.length === 0) return setMessage({ kind: "error", text: "Choose at least one PDF file." });
    setBusy(true);
    setMessage(null);
    let saved = 0;
    const problems: string[] = [];
    for (const file of files) {
      try {
        if (file.size > 40 * 1024 * 1024) throw new Error(`${file.name} is larger than 40 MB`);
        if (!(await isPdf(file))) throw new Error(`${file.name} is not a valid PDF file`);
        await put(file);
        saved++;
      } catch (err) {
        problems.push(err instanceof Error ? err.message : `${file.name} failed`);
      }
    }
    setProgress(null);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    setMessage(problems.length ? { kind: "error", text: `${saved} uploaded. ${problems.join("; ")}` } : { kind: "success", text: `${saved} file${saved === 1 ? "" : "s"} uploaded` });
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {message && <Alert kind={message.kind}>{message.text}</Alert>}
      <Field label="PDF file(s)" hint="PDF only, up to 40 MB each. You can select several.">
        <Input ref={inputRef} name="files" type="file" accept="application/pdf,.pdf" multiple required disabled={busy} />
      </Field>
      {progress && (
        <div>
          <div className="mb-1 flex justify-between text-xs text-ink-500">
            <span className="truncate">{progress.name}</span>
            <span>{progress.pct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-ink-100">
            <div className="h-full bg-accent transition-[width]" style={{ width: `${progress.pct}%` }} />
          </div>
        </div>
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>
          {busy ? "Uploading…" : "Upload"}
        </Button>
      </div>
    </form>
  );
}
