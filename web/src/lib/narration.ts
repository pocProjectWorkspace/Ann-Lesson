import "server-only";
import { db } from "./db";

/**
 * Read-to-me: a teacher's voice clip per page of a book. Clips live in the same storage
 * as the PDFs (R2 or the local upload dir) and are served through
 * GET /api/files/:fileId/narration?page=N with the same access rules as the PDF itself.
 */

export const NARRATION_MAX_BYTES = 10 * 1024 * 1024;
export const NARRATION_TYPES: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/aac": "aac",
};

/** Normalise a Content-Type such as "audio/webm;codecs=opus" to a known base type, or null. */
export function narrationType(contentType: string | null) {
  const base = (contentType ?? "").split(";")[0].trim().toLowerCase();
  return NARRATION_TYPES[base] ? base : null;
}

export type NarrationProp = { src: string; pages: number[] } | undefined;

/** What the viewer needs: where clips are served from and which pages have one. */
export async function narrationFor(fileId: string, token?: string): Promise<NarrationProp> {
  const rows = await db.pageAudio.findMany({ where: { fileId }, select: { page: true }, orderBy: { page: "asc" } });
  if (!rows.length) return undefined;
  return { src: `/api/files/${fileId}/narration${token ? `?t=${encodeURIComponent(token)}` : ""}`, pages: rows.map((r) => r.page) };
}

/** Every clip of a file, for the recording page. */
export async function narrationClips(fileId: string) {
  const rows = await db.pageAudio.findMany({ where: { fileId }, select: { page: true, durationMs: true, sizeBytes: true, updatedAt: true, teacher: { select: { name: true } } }, orderBy: { page: "asc" } });
  return rows.map((r) => ({ page: r.page, durationMs: r.durationMs, sizeBytes: r.sizeBytes, updatedAt: r.updatedAt.toISOString(), by: r.teacher?.name ?? null }));
}
