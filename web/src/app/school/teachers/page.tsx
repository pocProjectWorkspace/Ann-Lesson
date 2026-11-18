import { requireSchoolRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { className } from "@/lib/data";
import { Badge, Card, Empty, Field, Input, PageHeader, Select } from "@/components/ui";
import { ActionForm, InlineAction } from "@/components/forms";
import { listParams, SearchBox } from "@/components/list-controls";
import { assignTeacherToClass, createTeacher, deleteSchoolUser, resetSchoolUserPassword, toggleSchoolUserActive, unassignTeacherFromClass } from "../actions";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export default async function TeachersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { schoolId } = await requireSchoolRole("SCHOOL_ADMIN");
  const { q } = listParams(await searchParams);
  const [teachers, classes] = await Promise.all([
    db.user.findMany({
      where: { schoolId, role: "TEACHER", ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { username: { contains: q, mode: "insensitive" as const } }] } : {}) },
      orderBy: { name: "asc" },
      include: { teachingAssignments: { include: { class: { include: { _count: { select: { students: true } } } } } } },
    }),
    db.class.findMany({ where: { schoolId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);

  return (
    <>
      <PageHeader title="Teachers" subtitle="Teachers see the syllabus and confirm student progress for the classes assigned to them." actions={<SearchBox action="/school/teachers" q={q} placeholder="Search teachers" />} />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          {teachers.length === 0 ? (
            <Empty>{q ? "No teachers match this search." : "No teachers yet. Add one on the right."}</Empty>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2" aria-label="Teachers">
              {teachers.map((t) => (
                <li key={t.id} className="flex flex-col rounded-[var(--radius-card)] border border-ink-200/80 bg-white p-5 shadow-card">
                  <div className="flex items-start gap-3">
                    <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-soft font-display text-base font-semibold text-accent">
                      {initials(t.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-display text-[18px] text-ink-950">{t.name}</span>
                        {!t.isActive && <Badge tone="red">Inactive</Badge>}
                      </div>
                      <div className="truncate text-xs text-ink-500">
                        {t.username}
                        {t.email ? `, ${t.email}` : ""}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="mb-1.5 text-xs font-semibold text-ink-500">Teaches</div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {t.teachingAssignments.length === 0 && <span className="text-sm text-ink-400">No classes yet</span>}
                      {t.teachingAssignments.map((a) => (
                        <span key={a.id} className="inline-flex items-center gap-1 rounded-full bg-ink-100 py-0.5 pl-2.5 pr-1 text-xs font-semibold text-ink-800">
                          {className(a.class)} <span className="font-normal text-ink-500">({a.class._count.students})</span>
                          <InlineAction action={unassignTeacherFromClass} hidden={{ teacherId: t.id, classId: a.classId }} label="×" ariaLabel={`Remove ${t.name} from ${className(a.class)}`} />
                        </span>
                      ))}
                    </div>
                    {classes.some((c) => !t.teachingAssignments.some((a) => a.classId === c.id)) && (
                      <form action={assignTeacherToClass} className="mt-2 flex items-center gap-1.5">
                        <input type="hidden" name="teacherId" value={t.id} />
                        <label className="sr-only" htmlFor={`assign-${t.id}`}>
                          Assign {t.name} to a class
                        </label>
                        <Select id={`assign-${t.id}`} name="classId" className="w-auto py-1 text-xs" defaultValue="">
                          <option value="" disabled>
                            Assign a class…
                          </option>
                          {classes
                            .filter((c) => !t.teachingAssignments.some((a) => a.classId === c.id))
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {className(c)}
                              </option>
                            ))}
                        </Select>
                        <button className="rounded-lg border border-ink-200 px-2.5 py-1 text-xs font-semibold hover:bg-ink-100">Add</button>
                      </form>
                    )}
                  </div>

                  <div className="mt-4 flex items-center justify-end gap-1 border-t border-ink-100 pt-3">
                    <InlineAction action={toggleSchoolUserActive} hidden={{ id: t.id }} label={t.isActive ? "Deactivate" : "Activate"} />
                    <InlineAction action={deleteSchoolUser} hidden={{ id: t.id }} label="Delete" variant="danger" confirm={`Delete teacher ${t.name}? This cannot be undone.`} />
                  </div>
                </li>
              ))}
            </ul>
          )}

          {teachers.length > 0 && (
            <Card title="Reset a teacher password">
              <ActionForm action={resetSchoolUserPassword} submitLabel="Reset password" className="grid gap-4 sm:grid-cols-2">
                <Field label="Teacher">
                  <Select name="userId" required>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.username})
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="New password">
                  <Input name="password" type="password" required minLength={8} />
                </Field>
              </ActionForm>
            </Card>
          )}
        </div>

        <Card title="Add a teacher">
          <ActionForm action={createTeacher} submitLabel="Add teacher">
            <Field label="Full name">
              <Input name="name" required />
            </Field>
            <Field label="Username" hint="Used with the school code to sign in">
              <Input name="username" required />
            </Field>
            <Field label="Email (optional)">
              <Input name="email" type="email" />
            </Field>
            <Field label="Password">
              <Input name="password" type="password" required minLength={8} />
            </Field>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
