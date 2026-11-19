/**
 * Adds one small generated kindergarten lesson to each school (Nursery A → English →
 * "Letter A: Apple"), so the book viewer and the automated tests have a PDF to open before
 * the school's real content is uploaded. Delete it from the admin UI whenever you like.
 *
 * Usage: npx tsx prisma/seed-sample-lesson.ts [SCHOOL_CODE]
 */
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { makeLessonPdf } from "../scripts/make-lesson-pdf.mjs";

const prisma = new PrismaClient();
const uploadDir = path.resolve(process.env.UPLOAD_DIR || "./uploads");

async function main() {
  if ((process.env.STORAGE_DRIVER ?? "local") !== "local") throw new Error("This seed only supports STORAGE_DRIVER=local");
  const onlyCode = process.argv[2]?.toUpperCase();
  const schools = await prisma.school.findMany({ where: { isActive: true, ...(onlyCode ? { code: onlyCode } : {}) } });
  const bytes = await makeLessonPdf({
    grade: "Nursery",
    subject: "English",
    chapter: "Letter A",
    title: "Apple",
    tagline: "Say it, trace it, find it",
    accent: "#b4323f",
    sections: [
      { heading: "Say the sound", paragraphs: ["A is for apple. Say \"a\" like the start of apple. Big A and small a.", "Point to the letter A. Trace it in the air with your finger: down, down, across."], bullets: ["Big A: two long lines and a short line in the middle.", "Small a: a round shape with a little tail."] },
      { heading: "Find the A", paragraphs: ["Look around the room. Can you find something that starts with the \"a\" sound? Apple, ant, arm, aeroplane.", "Colour the apple red and say the word three times."] },
    ],
    questions: ["What sound does A make?", "Name two things that start with A.", "Trace big A and small a in your book."],
  });

  for (const school of schools) {
    const cls = await prisma.class.findFirst({ where: { schoolId: school.id, name: "Nursery" } });
    if (!cls) {
      console.log(`${school.name}: no Nursery class, skipped (run seed-demo first)`);
      continue;
    }
    let subject = await prisma.subject.findFirst({ where: { classId: cls.id, name: "English" } });
    subject ??= await prisma.subject.create({ data: { schoolId: school.id, classId: cls.id, name: "English", sortOrder: 0 } });
    const title = "Letter A: Apple";
    let lesson = await prisma.lesson.findFirst({ where: { subjectId: subject.id, title } });
    lesson ??= await prisma.lesson.create({ data: { schoolId: school.id, subjectId: subject.id, title, description: "Say it, trace it, find it", sortOrder: 0, publishedAt: new Date() } });
    if (!lesson.publishedAt) lesson = await prisma.lesson.update({ where: { id: lesson.id }, data: { publishedAt: new Date() } });
    const fileName = "letter-a-apple.pdf";
    if (await prisma.lessonFile.findFirst({ where: { lessonId: lesson.id, fileName } })) {
      console.log(`${school.name}: sample lesson already present`);
      continue;
    }
    const key = `${school.id}/${lesson.id}/${randomUUID()}-${fileName}`;
    mkdirSync(path.dirname(path.join(uploadDir, key)), { recursive: true });
    writeFileSync(path.join(uploadDir, key), bytes);
    await prisma.lessonFile.create({ data: { schoolId: school.id, lessonId: lesson.id, fileName, storageKey: key, mimeType: "application/pdf", sizeBytes: bytes.byteLength } });
    console.log(`${school.name}: added "${title}" to Nursery A › English`);
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
