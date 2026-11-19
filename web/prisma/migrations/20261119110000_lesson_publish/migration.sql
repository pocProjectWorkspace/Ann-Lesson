-- Lessons start as drafts; the admin publishes them. Everything that already has a PDF
-- was visible to students before this change, so it is marked published as of now.
ALTER TABLE "Lesson" ADD COLUMN "publishedAt" TIMESTAMP(3);
UPDATE "Lesson" SET "publishedAt" = NOW() WHERE "id" IN (SELECT DISTINCT "lessonId" FROM "LessonFile");
