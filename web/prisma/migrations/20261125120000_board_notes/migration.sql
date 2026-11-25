-- Smart board annotations per teacher, file and page.
CREATE TABLE "BoardNote" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "fileId" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "page" INTEGER NOT NULL,
  "strokes" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BoardNote_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BoardNote_fileId_page_teacherId_key" ON "BoardNote"("fileId", "page", "teacherId");
CREATE INDEX "BoardNote_fileId_teacherId_idx" ON "BoardNote"("fileId", "teacherId");
ALTER TABLE "BoardNote" ADD CONSTRAINT "BoardNote_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "LessonFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BoardNote" ADD CONSTRAINT "BoardNote_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
