-- CreateTable
CREATE TABLE "PageDwell" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "ms" INTEGER NOT NULL DEFAULT 0,
    "visits" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageDwell_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportAlert" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "lessonId" TEXT,
    "page" INTEGER,
    "detail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "handledById" TEXT,

    CONSTRAINT "SupportAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PageDwell_lessonId_page_idx" ON "PageDwell"("lessonId", "page");

-- CreateIndex
CREATE UNIQUE INDEX "PageDwell_studentId_lessonId_page_key" ON "PageDwell"("studentId", "lessonId", "page");

-- CreateIndex
CREATE INDEX "SupportAlert_classId_resolvedAt_idx" ON "SupportAlert"("classId", "resolvedAt");

-- CreateIndex
CREATE INDEX "SupportAlert_schoolId_idx" ON "SupportAlert"("schoolId");

-- AddForeignKey
ALTER TABLE "PageDwell" ADD CONSTRAINT "PageDwell_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageDwell" ADD CONSTRAINT "PageDwell_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportAlert" ADD CONSTRAINT "SupportAlert_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportAlert" ADD CONSTRAINT "SupportAlert_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportAlert" ADD CONSTRAINT "SupportAlert_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
