/**
 * One-off reset: remove every existing class (with its subjects, lessons, PDFs and progress)
 * and every student, keep schools, admins and teachers, then seed the kindergarten structure.
 *
 * Usage: npx tsx prisma/reset-to-kindergarten.ts            (all schools)
 *        npx tsx prisma/reset-to-kindergarten.ts GREENWOOD  (one school)
 */
import { PrismaClient } from "@prisma/client";
import { rm } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

const prisma = new PrismaClient();
const uploadDir = path.resolve(process.env.UPLOAD_DIR || "./uploads");

async function main() {
  const onlyCode = process.argv[2]?.toUpperCase();
  const schools = await prisma.school.findMany({ where: onlyCode ? { code: onlyCode } : {} });
  for (const school of schools) {
    const files = await prisma.lessonFile.findMany({ where: { schoolId: school.id }, select: { storageKey: true } });
    for (const f of files) await rm(path.join(uploadDir, f.storageKey), { force: true }).catch(() => {});
    const [classes, students] = await Promise.all([
      prisma.class.deleteMany({ where: { schoolId: school.id } }), // cascades subjects, lessons, files, progress, assignments
      prisma.user.deleteMany({ where: { schoolId: school.id, role: "STUDENT" } }),
    ]);
    await prisma.notification.deleteMany({ where: { user: { schoolId: school.id } } });
    console.log(`${school.name}: removed ${classes.count} classes, ${files.length} PDF files, ${students.count} students`);
  }
  await prisma.$disconnect();
  execFileSync(process.execPath, [path.join("node_modules", "tsx", "dist", "cli.mjs"), path.join("prisma", "seed-demo.ts"), ...(onlyCode ? [onlyCode] : [])], { stdio: "inherit" });
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
