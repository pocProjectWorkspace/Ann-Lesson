-- Reading position reported by the book viewer.
ALTER TABLE "LessonProgress"
  ADD COLUMN "lastPage" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "maxPage" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "pageCount" INTEGER,
  ADD COLUMN "finishedAt" TIMESTAMP(3);
