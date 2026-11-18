import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSchoolRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, Empty, Field, Input, LinkButton, PageHeader, Select, Table, Td } from "@/components/ui";
import { ActionForm, InlineAction } from "@/components/forms";
import { assignTeacherToClass, createSubject, deleteClass, promoteClass, unassignTeacherFromClass, updateClass } from "../../actions";

function nextYear(y: string | null) {
  const m = y?.match(/^(\d{4})-(\d{2,4})$/);
  if (!m) return "";
  const a = parseInt(m[1], 10) + 1;
  return `${a}-${String(a + 1).slice(-m[2].length)}`;
}
function nextGrade(name: string) {
  return name.replace(/(\d+)/, (n) => String(parseInt(n, 10) + 1));
}

export default async function ClassDetail({ params }: { params: Promise<{ id: string }> }) {
  const { schoolId } = await requireSchoolRole("SCHOOL_ADMIN");
  const { id } = await params;
  const cls = await db.class.findFirst({
    where: { id, schoolId },
    include: {
      subjects: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { lessons: true } } } },
      teachers: { include: { teacher: true } },
      _count: { select: { students: true } },
      students: { orderBy: { name: "asc" }, take: 12, select: { id: true, name: true, username: true } },
    },
  });
  if (!cls) notFound();
  const allTeachers = await db.user.findMany({ where: { schoolId, role: "TEACHER", isActive: true }, orderBy: { name: "asc" } });
  const unassigned = allTeachers.filter((t) => !cls.teachers.some((a) => a.teacherId === t.id));
  const title = `${cls.name}${cls.section ? " " + cls.section : ""}`;

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/school/classes", label: "Classes" }, { label: title }]}
        title={title}
        subtitle={cls.academicYear ? `Academic year ${cls.academicYear}` : undefined}
        actions={
          <>
            <LinkButton href={`/api/exports/progress.csv?classId=${cls.id}`}>Export progress</LinkButton>
            <InlineAction action={deleteClass} hidden={{ id: cls.id }} label="Delete class" variant="danger" confirm={`Delete ${title} with all its subjects, lessons and PDFs? Students in it will be left without a class.`} />
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={`Subjects (${cls.subjects.length})`}>
            {cls.subjects.length === 0 ? (
              <Empty>No subjects yet. Add the first one on the right.</Empty>
            ) : (
              <Table head={["Subject", "Lessons", ""]}>
                {cls.subjects.map((s) => (
                  <tr key={s.id}>
                    <Td>
                      <Link href={`/school/subjects/${s.id}`} className="font-semibold text-ink-900 hover:text-accent">
                        {s.name}
                      </Link>
                    </Td>
                    <Td>{s._count.lessons}</Td>
                    <Td className="text-right">
                      <Link href={`/school/subjects/${s.id}`} className="text-xs font-semibold text-accent hover:underline">
                        Manage lessons
                      </Link>
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>

          <Card title={`Teachers (${cls.teachers.length})`}>
            <div className="flex flex-wrap items-center gap-2">
              {cls.teachers.length === 0 && <span className="text-sm text-ink-500">No teachers assigned.</span>}
              {cls.teachers.map((a) => (
                <span key={a.id} className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2.5 py-1 text-sm font-semibold">
                  {a.teacher.name}
                  <InlineAction action={unassignTeacherFromClass} hidden={{ teacherId: a.teacherId, classId: cls.id }} label="×" />
                </span>
              ))}
            </div>
            {unassigned.length > 0 && (
              <form action={assignTeacherToClass} className="mt-4 flex items-end gap-2">
                <input type="hidden" name="classId" value={cls.id} />
                <Field label="Assign a teacher">
                  <Select name="teacherId" required className="w-64">
                    {unassigned.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <button className="rounded-lg bg-accent px-3.5 py-2.5 text-sm font-semibold text-accent-fg hover:brightness-110">Assign</button>
              </form>
            )}
          </Card>

          <Card
            title={`Students (${cls._count.students})`}
            actions={
              <Link href={`/school/students?classId=${cls.id}`} className="text-sm font-semibold text-accent hover:underline">
                Manage students
              </Link>
            }
          >
            {cls._count.students === 0 ? (
              <Empty>No students in this class yet.</Empty>
            ) : (
              <>
                <ul className="grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  {cls.students.map((s) => (
                    <li key={s.id} className="rounded border border-ink-100 px-2 py-1">
                      {s.name} <span className="text-xs text-ink-500">({s.username})</span>
                    </li>
                  ))}
                </ul>
                {cls._count.students > cls.students.length && (
                  <p className="mt-2 text-xs text-ink-500">
                    Showing {cls.students.length} of {cls._count.students}.
                  </p>
                )}
              </>
            )}
          </Card>

          <Card title="Move to next year" description="Creates the next class, moves every student into it and keeps this one as last year's record.">
            {cls._count.students === 0 ? (
              <Empty>Add students before promoting the class.</Empty>
            ) : (
              <ActionForm action={promoteClass} submitLabel={`Promote ${cls._count.students} students`} className="grid gap-4 sm:grid-cols-3" resetOnSuccess={false}>
                <input type="hidden" name="id" value={cls.id} />
                <Field label="New class name">
                  <Input name="name" required defaultValue={nextGrade(cls.name)} />
                </Field>
                <Field label="Section">
                  <Input name="section" defaultValue={cls.section ?? ""} />
                </Field>
                <Field label="Academic year">
                  <Input name="academicYear" defaultValue={nextYear(cls.academicYear)} placeholder="2027-28" />
                </Field>
                <label className="flex items-center gap-2 text-sm text-ink-700 sm:col-span-3">
                  <input type="checkbox" name="keepTeachers" value="yes" defaultChecked className="h-4 w-4 rounded border-ink-300" /> Keep the same teachers
                </label>
                <label className="flex items-center gap-2 text-sm text-ink-700 sm:col-span-3">
                  <input type="checkbox" name="copySyllabus" value="yes" className="h-4 w-4 rounded border-ink-300" /> Copy this class&apos;s subjects, lessons and PDFs into the new class
                </label>
              </ActionForm>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Edit class">
            <ActionForm action={updateClass} submitLabel="Save changes" resetOnSuccess={false}>
              <input type="hidden" name="id" value={cls.id} />
              <Field label="Class name">
                <Input name="name" required defaultValue={cls.name} />
              </Field>
              <Field label="Section">
                <Input name="section" defaultValue={cls.section ?? ""} />
              </Field>
              <Field label="Academic year">
                <Input name="academicYear" defaultValue={cls.academicYear ?? ""} />
              </Field>
            </ActionForm>
          </Card>
          <Card title="Add a subject">
            <ActionForm action={createSubject} submitLabel="Add subject">
              <input type="hidden" name="classId" value={cls.id} />
              <Field label="Subject name">
                <Input name="name" required placeholder="Mathematics" />
              </Field>
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
