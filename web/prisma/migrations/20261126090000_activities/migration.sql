-- Board-to-desk activities and student submissions.
ALTER TABLE "LiveSession" ADD COLUMN "activityId" TEXT;
CREATE TABLE "Activity" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "lessonId" TEXT NOT NULL,
  "fileId" TEXT NOT NULL,
  "page" INTEGER NOT NULL,
  "prompt" TEXT,
  "teacherId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Activity_classId_createdAt_idx" ON "Activity"("classId", "createdAt");
CREATE TABLE "ActivitySubmission" (
  "id" TEXT NOT NULL,
  "activityId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "strokes" JSONB NOT NULL,
  "done" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActivitySubmission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ActivitySubmission_activityId_studentId_key" ON "ActivitySubmission"("activityId", "studentId");
ALTER TABLE "ActivitySubmission" ADD CONSTRAINT "ActivitySubmission_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActivitySubmission" ADD CONSTRAINT "ActivitySubmission_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
