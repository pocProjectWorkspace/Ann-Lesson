-- Live classroom session per class (smart board state).
CREATE TABLE "LiveSession" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "lessonId" TEXT NOT NULL,
  "fileId" TEXT NOT NULL,
  "page" INTEGER NOT NULL DEFAULT 1,
  "follow" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LiveSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LiveSession_classId_key" ON "LiveSession"("classId");
CREATE INDEX "LiveSession_schoolId_idx" ON "LiveSession"("schoolId");
