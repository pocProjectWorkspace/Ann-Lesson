/**
 * Demo data for kindergarten schools.
 * Adds three kindergarten classes to each active school (Nursery, LKG, UKG), each with the usual
 * subjects and no lessons yet, plus teachers and a few students. Lesson content is added by the
 * school through the web app (or with scripts/make-lesson-pdf.mjs for generated samples).
 * Safe to run again: it skips anything that already exists.
 *
 * Usage: npx tsx prisma/seed-demo.ts            (all active schools)
 *        npx tsx prisma/seed-demo.ts GREENWOOD  (one school)
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const PASSWORD = "Learn1234";
const TEACHER_PASSWORD = "Teach1234";

export const KG_SUBJECTS = ["English", "Numbers", "General Awareness", "Rhymes & Stories", "Art & Craft"];

type ClassSpec = { name: string; section: string; teachers: { name: string; username: string }[]; students: { name: string; username: string }[] };

export const KG_CLASSES: ClassSpec[] = [
  {
    name: "Nursery",
    section: "A",
    teachers: [{ name: "Sunita Rao", username: "sunita" }],
    students: [
      { name: "Aarav Mehta", username: "N001" },
      { name: "Diya Sharma", username: "N002" },
      { name: "Kabir Singh", username: "N003" },
      { name: "Nila Krishnan", username: "N004" },
    ],
  },
  {
    name: "LKG",
    section: "A",
    teachers: [{ name: "Imran Shaikh", username: "imran" }],
    students: [
      { name: "Asha Kumar", username: "L001" },
      { name: "Meera Pillai", username: "L002" },
      { name: "Arjun Das", username: "L003" },
      { name: "Rohan Verma", username: "L004" },
    ],
  },
  {
    name: "UKG",
    section: "A",
    teachers: [{ name: "Deepak Iyer", username: "deepak" }],
    students: [
      { name: "Ananya Bose", username: "U001" },
      { name: "Farhan Ali", username: "U002" },
      { name: "Ishita Patel", username: "U003" },
      { name: "Vikram Nair", username: "U004" },
    ],
  },
];

async function main() {
  const onlyCode = process.argv[2]?.toUpperCase();
  const schools = await prisma.school.findMany({ where: { isActive: true, ...(onlyCode ? { code: onlyCode } : {}) }, orderBy: { createdAt: "asc" } });
  if (schools.length === 0) throw new Error(onlyCode ? `School ${onlyCode} not found` : "No schools found. Create one as the platform owner first.");

  const studentHash = await bcrypt.hash(PASSWORD, 10);
  const teacherHash = await bcrypt.hash(TEACHER_PASSWORD, 10);

  for (const school of schools) {
    console.log(`\n${school.name} (${school.code})`);
    const classCount = await prisma.class.count({ where: { schoolId: school.id } });

    for (const [ci, spec] of KG_CLASSES.entries()) {
      let cls = await prisma.class.findFirst({ where: { schoolId: school.id, name: spec.name, section: spec.section } });
      if (!cls) {
        cls = await prisma.class.create({ data: { schoolId: school.id, name: spec.name, section: spec.section, academicYear: "2026-27", sortOrder: classCount + ci } });
        console.log(`  + class ${spec.name} ${spec.section}`);
      }

      for (const [si, name] of KG_SUBJECTS.entries()) {
        const exists = await prisma.subject.findFirst({ where: { classId: cls.id, name } });
        if (!exists) await prisma.subject.create({ data: { schoolId: school.id, classId: cls.id, name, sortOrder: si } });
      }

      for (const t of spec.teachers) {
        let user = await prisma.user.findFirst({ where: { schoolId: school.id, username: { equals: t.username, mode: "insensitive" } } });
        if (!user) {
          user = await prisma.user.create({ data: { schoolId: school.id, role: "TEACHER", name: t.name, username: t.username, passwordHash: teacherHash } });
          console.log(`  + teacher ${t.name} (${t.username})`);
        }
        await prisma.teacherAssignment.upsert({ where: { teacherId_classId: { teacherId: user.id, classId: cls.id } }, create: { teacherId: user.id, classId: cls.id }, update: {} });
      }

      for (const s of spec.students) {
        const user = await prisma.user.findFirst({ where: { schoolId: school.id, username: { equals: s.username, mode: "insensitive" } } });
        if (!user) {
          await prisma.user.create({ data: { schoolId: school.id, role: "STUDENT", name: s.name, username: s.username, classId: cls.id, passwordHash: studentHash } });
          console.log(`  + student ${s.name} (${s.username})`);
        }
      }
    }
  }
  console.log(`\nDone. Students sign in with password ${PASSWORD}, teachers with ${TEACHER_PASSWORD}. Add lessons and PDFs from the school admin's Classes & syllabus page.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
