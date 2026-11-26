-- CreateTable
CREATE TABLE "PageAudio" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "durationMs" INTEGER,
    "teacherId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageAudio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PageAudio_storageKey_key" ON "PageAudio"("storageKey");

-- CreateIndex
CREATE INDEX "PageAudio_schoolId_idx" ON "PageAudio"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "PageAudio_fileId_page_key" ON "PageAudio"("fileId", "page");

-- AddForeignKey
ALTER TABLE "PageAudio" ADD CONSTRAINT "PageAudio_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "LessonFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageAudio" ADD CONSTRAINT "PageAudio_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
