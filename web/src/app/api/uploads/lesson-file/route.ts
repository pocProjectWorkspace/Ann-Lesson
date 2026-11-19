import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { makeKey, putObjectStream } from "@/lib/storage";
import { looksLikePdf, MAX_PDF_BYTES, MAX_UPLOAD_MB } from "@/lib/pdf-check";
import { assertWithinPlan, PlanLimitError } from "@/lib/plans";
import { afterLessonFileStored } from "@/lib/lesson-files";

/**
 * PUT /api/uploads/lesson-file?lessonId=…&name=…
 * Body: raw PDF bytes. Streams to storage instead of buffering the whole file
 * in memory, and checks the PDF signature before anything is written.
 */
export async function PUT(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || session.role !== "SCHOOL_ADMIN" || !session.schoolId) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const q = z.object({ lessonId: z.string().uuid(), name: z.string().min(1).max(200) }).safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!q.success) return NextResponse.json({ error: "Missing lesson or file name" }, { status: 400 });
  const { lessonId, name } = q.data;
  const lesson = await db.lesson.findFirst({ where: { id: lessonId, schoolId: session.schoolId }, select: { id: true, subjectId: true } });
  if (!lesson) return NextResponse.json({ error: "Lesson not found" }, { status: 404 });

  const declared = Number(req.headers.get("content-length") ?? 0);
  try {
    await assertWithinPlan(session.schoolId, "storage", declared);
  } catch (e) {
    if (e instanceof PlanLimitError) return NextResponse.json({ error: e.message }, { status: 402 });
    throw e;
  }
  if (declared > MAX_PDF_BYTES) return NextResponse.json({ error: `${name} is larger than ${MAX_UPLOAD_MB} MB` }, { status: 413 });
  if (!name.toLowerCase().endsWith(".pdf")) return NextResponse.json({ error: `${name}: only PDF files are allowed` }, { status: 415 });
  if (!req.body) return NextResponse.json({ error: "Empty upload" }, { status: 400 });

  // Peek at the first chunk for the %PDF- signature, then forward everything.
  const reader = req.body.getReader();
  const first = await reader.read();
  if (first.done || !first.value || !looksLikePdf(first.value)) {
    await reader.cancel().catch(() => {});
    return NextResponse.json({ error: `${name} is not a valid PDF file` }, { status: 415 });
  }

  let total = 0;
  let tooLarge = false;
  const firstChunk = first.value;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      total += firstChunk.byteLength;
      controller.enqueue(firstChunk);
    },
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) return controller.close();
      total += value.byteLength;
      if (total > MAX_PDF_BYTES) {
        tooLarge = true;
        await reader.cancel().catch(() => {});
        return controller.error(new Error("too large"));
      }
      controller.enqueue(value);
    },
    cancel() {
      return reader.cancel();
    },
  });

  const key = makeKey(session.schoolId, lesson.id, name);
  try {
    await putObjectStream(key, stream, "application/pdf", declared || undefined);
  } catch (e) {
    if (tooLarge) return NextResponse.json({ error: `${name} is larger than ${MAX_UPLOAD_MB} MB` }, { status: 413 });
    console.error(e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  const existing = await db.lessonFile.count({ where: { lessonId: lesson.id } });
  const file = await db.lessonFile.create({
    data: { schoolId: session.schoolId, lessonId: lesson.id, fileName: name, storageKey: key, mimeType: "application/pdf", sizeBytes: total },
  });
  await afterLessonFileStored(session, lesson.id, file.id, name, existing === 0);
  return NextResponse.json({ id: file.id, fileName: file.fileName, sizeBytes: file.sizeBytes });
}
