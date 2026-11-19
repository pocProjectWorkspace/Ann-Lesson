import "server-only";
import type { Session } from "./auth";
import { audit } from "./audit";

/**
 * Called after a lesson file is stored: audits it. Nobody is notified here; the lesson
 * stays a draft until the admin reviews the book and publishes it (see publishLesson).
 */
export async function afterLessonFileStored(session: Pick<Session, "userId" | "name" | "schoolId">, lessonId: string, fileId: string, fileName: string, wasFirst: boolean) {
  await audit(session, { action: "lesson.file.upload", targetType: "LessonFile", targetId: fileId, summary: `Uploaded ${fileName}`, meta: { lessonId, wasFirst } });
}
