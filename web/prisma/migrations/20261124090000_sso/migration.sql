-- Per-school sign-in method and provider settings.
ALTER TABLE "School"
  ADD COLUMN "authMode" TEXT NOT NULL DEFAULT 'FORM',
  ADD COLUMN "ssoTenant" TEXT,
  ADD COLUMN "ssoClientId" TEXT,
  ADD COLUMN "ssoClientSecret" TEXT,
  ADD COLUMN "ssoAdminGroups" TEXT,
  ADD COLUMN "ssoTeacherGroups" TEXT,
  ADD COLUMN "ssoAutoProvision" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "ssoStudents" BOOLEAN NOT NULL DEFAULT false;

-- How each user signs in, plus the break-glass flag.
ALTER TABLE "User"
  ADD COLUMN "authProvider" TEXT NOT NULL DEFAULT 'FORM',
  ADD COLUMN "externalId" TEXT,
  ADD COLUMN "isBreakGlass" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "User_schoolId_externalId_idx" ON "User"("schoolId", "externalId");

-- The oldest school admin of every school becomes its break-glass account.
UPDATE "User" u SET "isBreakGlass" = true
WHERE u."role" = 'SCHOOL_ADMIN' AND u."id" = (
  SELECT "id" FROM "User" x WHERE x."schoolId" = u."schoolId" AND x."role" = 'SCHOOL_ADMIN' ORDER BY x."createdAt" ASC, x."id" ASC LIMIT 1
);
