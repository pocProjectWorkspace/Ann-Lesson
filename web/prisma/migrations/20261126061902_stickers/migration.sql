-- CreateTable
CREATE TABLE "ReadingDay" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "pages" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReadingDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sticker" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "note" TEXT,
    "givenById" TEXT,
    "lessonId" TEXT,
    "earnKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sticker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReadingDay_studentId_day_key" ON "ReadingDay"("studentId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "Sticker_earnKey_key" ON "Sticker"("earnKey");

-- CreateIndex
CREATE INDEX "Sticker_studentId_createdAt_idx" ON "Sticker"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "Sticker_schoolId_idx" ON "Sticker"("schoolId");

-- AddForeignKey
ALTER TABLE "ReadingDay" ADD CONSTRAINT "ReadingDay_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sticker" ADD CONSTRAINT "Sticker_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sticker" ADD CONSTRAINT "Sticker_givenById_fkey" FOREIGN KEY ("givenById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
