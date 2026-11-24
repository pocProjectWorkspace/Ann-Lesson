-- Teacher ratings per student and subject.
CREATE TABLE "SubjectGrade" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "teacherId" TEXT,
  "rating" INTEGER NOT NULL,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubjectGrade_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SubjectGrade_subjectId_studentId_key" ON "SubjectGrade"("subjectId", "studentId");
CREATE INDEX "SubjectGrade_schoolId_studentId_idx" ON "SubjectGrade"("schoolId", "studentId");
ALTER TABLE "SubjectGrade" ADD CONSTRAINT "SubjectGrade_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubjectGrade" ADD CONSTRAINT "SubjectGrade_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubjectGrade" ADD CONSTRAINT "SubjectGrade_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
