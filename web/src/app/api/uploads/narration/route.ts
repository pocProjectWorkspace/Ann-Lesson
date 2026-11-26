import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionFromRequest, type Session } from "@/lib/auth";
import { deleteObject, makeKey, putObject } from "@/lib/storage";
import { assertWithinPlan, PlanLimitError } from "@/lib/plans";
import { audit } from "@/lib/audit";
import { NARRATION_MAX_BYTES, NARRATION_TYPES, narrationType } from "@/lib/narration";

/**
 * PUT    /api/uploads/narration?fileId=…&page=…&duration=…   body: raw audio bytes
 * DELETE /api/uploads/narration?fileId=…&page=…
 * A teacher of the class (or a school admin) records or removes the read-to-me clip
 * for one page. Like the PDF upload this route sits outside the auth proxy, so it
 * does the origin, session and role checks itself.
 */

function crossSite(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

async function fileForStaff(req: NextRequest, session: Session) {
  const q = z.object({ fileId: z.string().uuid(), page: z.coerce.number().int().min(1).max(5000) }).safeParse({ fileId: req.nextUrl.searchParams.get("fileId"), page: req.nextUrl.searchParams.get("page") });
  if (!q.success) return { error: NextResponse.json({ error: "Missing file or page" }, { status: 400 }) };
  if (!session.schoolId || (session.role !== "TEACHER" && session.role !== "SCHOOL_ADMIN")) return { error: NextResponse.json({ error: "Not allowed" }, { status: 403 }) };
  const file = await db.lessonFile.findFirst({ where: { id: q.data.fileId, schoolId: session.schoolId }, select: { id: true, lessonId: true, schoolId: true, lesson: { select: { subject: { select: { classId: true } } } } } });
  if (!file) return { error: NextResponse.json({ error: "File not found" }, { status: 404 }) };
  if (session.role === "TEACHER") {
    const teaches = await db.teacherAssignment.findFirst({ where: { teacherId: session.userId, classId: file.lesson.subject.classId }, select: { id: true } });
    if (!teaches) return { error: NextResponse.json({ error: "File not found" }, { status: 404 }) };
  }
  return { file, page: q.data.page };
}

export async function PUT(req: NextRequest) {
  if (crossSite(req)) return NextResponse.json({ error: "Cross-site request refused" }, { status: 403 });
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const r = await fileForStaff(req, session);
  if ("error" in r) return r.error;
  const { file, page } = r;

  const type = narrationType(req.headers.get("content-type"));
  if (!type) return NextResponse.json({ error: "Send an audio recording (webm, ogg, mp4, mp3 or wav)" }, { status: 415 });
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > NARRATION_MAX_BYTES) return NextResponse.json({ error: "A clip can be at most 10 MB" }, { status: 413 });
  const body = Buffer.from(await req.arrayBuffer());
  if (body.length === 0) return NextResponse.json({ error: "Empty recording" }, { status: 400 });
  if (body.length > NARRATION_MAX_BYTES) return NextResponse.json({ error: "A clip can be at most 10 MB" }, { status: 413 });
  try {
    await assertWithinPlan(file.schoolId, "storage", body.length);
  } catch (e) {
    if (e instanceof PlanLimitError) return NextResponse.json({ error: e.message }, { status: 402 });
    throw e;
  }
  const durationMs = Math.max(0, Math.min(10 * 60_000, Number(req.nextUrl.searchParams.get("duration") ?? 0))) || null;

  const key = makeKey(file.schoolId, file.lessonId, `narration-p${page}.${NARRATION_TYPES[type]}`);
  await putObject(key, body, type);
  const previous = await db.pageAudio.findUnique({ where: { fileId_page: { fileId: file.id, page } }, select: { storageKey: true } });
  const clip = await db.pageAudio.upsert({
    where: { fileId_page: { fileId: file.id, page } },
    create: { schoolId: file.schoolId, lessonId: file.lessonId, fileId: file.id, page, storageKey: key, mimeType: type, sizeBytes: body.length, durationMs, teacherId: session.userId },
    update: { storageKey: key, mimeType: type, sizeBytes: body.length, durationMs, teacherId: session.userId },
  });
  if (previous && previous.storageKey !== key) await deleteObject(previous.storageKey).catch(() => {});
  await audit(session, { action: "narration.record", targetType: "LessonFile", targetId: file.id, summary: `${previous ? "Re-recorded" : "Recorded"} read-to-me for page ${page}${durationMs ? ` (${Math.round(durationMs / 1000)} s)` : ""}`, meta: { lessonId: file.lessonId, page } });
  return NextResponse.json({ ok: true, page, durationMs: clip.durationMs, sizeBytes: clip.sizeBytes });
}

export async function DELETE(req: NextRequest) {
  if (crossSite(req)) return NextResponse.json({ error: "Cross-site request refused" }, { status: 403 });
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const r = await fileForStaff(req, session);
  if ("error" in r) return r.error;
  const { file, page } = r;
  const clip = await db.pageAudio.findUnique({ where: { fileId_page: { fileId: file.id, page } } });
  if (!clip) return NextResponse.json({ error: "No recording on this page" }, { status: 404 });
  await db.pageAudio.delete({ where: { id: clip.id } });
  await deleteObject(clip.storageKey).catch(() => {});
  await audit(session, { action: "narration.delete", targetType: "LessonFile", targetId: file.id, summary: `Removed read-to-me for page ${page}`, meta: { lessonId: file.lessonId, page } });
  return NextResponse.json({ ok: true });
}
