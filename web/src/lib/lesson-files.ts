import "server-only";
import type { Session } from "./auth";
import { audit } from "./audit";
import { notifyLessonPublished } from "./notify";

/** Called after a lesson file is stored: audits it and, for a lesson's first file, notifies the class. */
export async function afterLessonFileStored(session: Pick<Session, "userId" | "name" | "schoolId">, lessonId: string, fileId: string, fileName: string, wasFirst: boolean) {
  await audit(session, { action: "lesson.file.upload", targetType: "LessonFile", targetId: fileId, summary: `Uploaded ${fileName}`, meta: { lessonId } });
  if (wasFirst) await notifyLessonPublished(lessonId);
}
