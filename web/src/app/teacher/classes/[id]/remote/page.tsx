import { notFound } from "next/navigation";
import { requireSchoolRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { className } from "@/lib/data";
import { Remote } from "@/components/live/remote";

/**
 * The teacher's phone remote for the smart board: page controls, follow on/off and the
 * name picker, for whichever lesson the board has open. Works in any phone browser.
 */
export default async function RemotePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSchoolRole("TEACHER", "SCHOOL_ADMIN");
  const { id } = await params;
  const cls = await db.class.findFirst({
    where: { id, schoolId: session.schoolId, ...(session.role === "TEACHER" ? { teachers: { some: { teacherId: session.userId } } } : {}) },
    select: {
      id: true,
      name: true,
      section: true,
      students: { where: { isActive: true }, orderBy: { name: "asc" }, select: { name: true } },
      subjects: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { name: true, lessons: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, title: true, files: { orderBy: { createdAt: "asc" }, select: { id: true, fileName: true } } } } } },
    },
  });
  if (!cls) notFound();
  const lessons = cls.subjects.flatMap((s) => s.lessons.filter((l) => l.files.length).map((l) => ({ id: l.id, title: `${s.name}: ${l.title}`, files: l.files })));
  return <Remote classId={cls.id} className={className(cls)} lessons={lessons} students={cls.students.map((s) => s.name)} backHref={session.role === "TEACHER" ? `/teacher/classes/${cls.id}` : `/school/classes/${cls.id}`} />;
}
