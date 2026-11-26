-- CreateTable
CREATE TABLE "PageColouring" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "strokes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageColouring_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PageColouring_lessonId_updatedAt_idx" ON "PageColouring"("lessonId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PageColouring_studentId_fileId_page_key" ON "PageColouring"("studentId", "fileId", "page");

-- AddForeignKey
ALTER TABLE "PageColouring" ADD CONSTRAINT "PageColouring_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageColouring" ADD CONSTRAINT "PageColouring_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageColouring" ADD CONSTRAINT "PageColouring_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "LessonFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
