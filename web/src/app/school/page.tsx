import Link from "next/link";
import { requireSchoolRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, Empty, LinkButton, PageHeader, Stat, Table, Td } from "@/components/ui";
import { InlineAction } from "@/components/forms";
import { setStudentRankVisibility } from "./actions";

export default async function SchoolHome() {
  const { schoolId } = await requireSchoolRole("SCHOOL_ADMIN");
  const [school, teachers, students, classes, lessons, lessonsWithoutPdf, drafts] = await Promise.all([
    db.school.findUniqueOrThrow({ where: { id: schoolId } }),
    db.user.count({ where: { schoolId, role: "TEACHER" } }),
    db.user.count({ where: { schoolId, role: "STUDENT" } }),
    db.class.findMany({
      where: { schoolId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { subjects: true, students: true, teachers: true } }, subjects: { select: { _count: { select: { lessons: true } } } } },
    }),
    db.lesson.count({ where: { schoolId } }),
    db.lesson.count({ where: { schoolId, files: { none: {} } } }),
    db.lesson.count({ where: { schoolId, publishedAt: null, files: { some: {} } } }),
  ]);

  const steps = [
    { done: classes.length > 0, label: "Create your classes", href: "/school/classes" },
    { done: classes.some((c) => c._count.subjects > 0), label: "Add subjects to each class", href: "/school/classes" },
    { done: lessons > 0, label: "Add lessons and upload their PDFs", href: "/school/classes" },
    { done: teachers > 0, label: "Add teachers and assign them to classes", href: "/school/teachers" },
    { done: students > 0, label: "Add students to their class", href: "/school/students" },
  ];
  const remaining = steps.filter((s) => !s.done);

  return (
    <>
      <PageHeader
        title={school.name}
        subtitle={`School code ${school.code}. Teachers and students type this code to sign in.`}
        actions={<LinkButton href="/school/classes" variant="primary">Open syllabus</LinkButton>}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Classes" value={classes.length} />
        <Stat label="Teachers" value={teachers} />
        <Stat label="Students" value={students} />
        <Stat label="Lessons" value={lessons} hint={[lessonsWithoutPdf ? `${lessonsWithoutPdf} still need a PDF` : "", drafts ? `${drafts} draft${drafts === 1 ? "" : "s"} to review and publish` : ""].filter(Boolean).join(", ") || undefined} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card title="Classes" padded={false}>
          {classes.length === 0 ? (
            <div className="px-5 pb-5">
              <Empty action={<LinkButton href="/school/classes" variant="primary">Create a class</LinkButton>}>No classes yet. Start with one class and its subjects.</Empty>
            </div>
          ) : (
            <div className="px-5 pb-2">
              <Table head={["Class", "Year", "Subjects", "Lessons", "Teachers", "Students"]}>
                {classes.map((c) => (
                  <tr key={c.id}>
                    <Td>
                      <Link href={`/school/classes/${c.id}`} className="font-semibold text-ink-900 hover:text-accent">
                        {c.name}
                        {c.section ? ` ${c.section}` : ""}
                      </Link>
                    </Td>
                    <Td className="text-ink-500">{c.academicYear ?? "—"}</Td>
                    <Td>{c._count.subjects}</Td>
                    <Td>{c.subjects.reduce((n, s) => n + s._count.lessons, 0)}</Td>
                    <Td>{c._count.teachers}</Td>
                    <Td>{c._count.students}</Td>
                  </tr>
                ))}
              </Table>
            </div>
          )}
        </Card>

        <Card title={remaining.length ? "Setup" : "Setup complete"} description={remaining.length ? `${steps.length - remaining.length} of ${steps.length} done` : "Everything is in place."}>
          <ol className="space-y-2.5">
            {steps.map((s, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${s.done ? "bg-leaf-100 text-leaf-600" : "bg-ink-100 text-ink-500"}`}>{s.done ? "✓" : i + 1}</span>
                {s.done ? <span className="text-sm text-ink-500 line-through decoration-ink-300">{s.label}</span> : <Link href={s.href} className="text-sm font-semibold text-ink-900 hover:text-accent">{s.label}</Link>}
              </li>
            ))}
          </ol>
        </Card>

        <Card title="Grades" description="What students see on their own page.">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink-900">{school.showStudentRank ? "Students see their class rank" : "Students see only their own stars"}</p>
              <p className="mt-0.5 text-xs text-ink-500">{school.showStudentRank ? "Each child sees their position, for example rank 2 of 12, next to their grades." : "Children see their ratings and overall grade, but not where they stand in the class. Teachers and you still see the ranking."}</p>
            </div>
            <InlineAction action={setStudentRankVisibility} hidden={{ show: school.showStudentRank ? "no" : "yes" }} label={school.showStudentRank ? "Hide rank" : "Show rank"} variant="secondary" />
          </div>
        </Card>
      </div>
    </>
  );
}
