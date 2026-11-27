import { requireSchoolRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge, Card, Empty, Field, Input, LinkButton, PageHeader, Select, Table, Td, Textarea } from "@/components/ui";
import { ActionForm, InlineAction } from "@/components/forms";
import { listParams, Pagination, SearchBox } from "@/components/list-controls";
import { className as fmtClass } from "@/lib/data";
import { createStudent, deleteSchoolUser, importStudents, importStudentsCsv, moveStudentToClass, resetSchoolUserPassword, toggleSchoolUserActive } from "../actions";

const className = (c: { name: string; section: string | null } | null) => fmtClass(c) || "—";

export default async function StudentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { schoolId } = await requireSchoolRole("SCHOOL_ADMIN");
  const sp = await searchParams;
  const classId = sp.classId || undefined;
  const { q, page, skip, take } = listParams(sp);
  const where = {
    schoolId,
    role: "STUDENT" as const,
    ...(classId ? { classId } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { username: { contains: q, mode: "insensitive" as const } }, { email: { contains: q, mode: "insensitive" as const } }] } : {}),
  };
  const [students, total, classes] = await Promise.all([
    db.user.findMany({ where, orderBy: [{ class: { sortOrder: "asc" } }, { name: "asc" }], include: { class: true }, skip, take }),
    db.user.count({ where }),
    db.class.findMany({ where: { schoolId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);
  const exportHref = `/api/exports/students.csv${classId ? `?classId=${classId}` : ""}`;

  return (
    <>
      <PageHeader
        title="Students"
        subtitle="Students sign in with the school code, their student ID and password, and see only their own class."
        actions={
          <>
            <form className="flex items-center gap-2" method="get">
              {q && <input type="hidden" name="q" value={q} />}
              <Select name="classId" defaultValue={classId ?? ""} className="w-auto" aria-label="Filter by class">
                <option value="">All classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {className(c)}
                  </option>
                ))}
              </Select>
              <button className="rounded-lg border border-ink-200 bg-white px-3 py-2.5 text-sm font-semibold hover:bg-ink-100">Filter</button>
            </form>
            <SearchBox action="/school/students" q={q} placeholder="Search name or ID" hidden={{ classId }} />
            <LinkButton href={exportHref}>Export CSV</LinkButton>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={`Students (${total})`} padded={false}>
            <div className="px-5 pb-4">
              {students.length === 0 ? (
                <Empty>{q || classId ? "No students match this search." : "No students yet. Add one or import a list on the right."}</Empty>
              ) : (
                <Table head={["Name", "Student ID", "Class", "Status", ""]}>
                  {students.map((s) => (
                    <tr key={s.id}>
                      <Td>
                        <div className="font-semibold">{s.name}</div>
                        {s.email && <div className="text-xs text-ink-500">{s.email}</div>}
                      </Td>
                      <Td>
                        <code className="text-xs">{s.username}</code>
                      </Td>
                      <Td>
                        <form action={moveStudentToClass} className="flex items-center gap-1">
                          <input type="hidden" name="studentId" value={s.id} />
                          <Select name="classId" defaultValue={s.classId ?? ""} className="w-auto py-1 text-xs" aria-label={`Class for ${s.name}`}>
                            <option value="">No class</option>
                            {classes.map((c) => (
                              <option key={c.id} value={c.id}>
                                {className(c)}
                              </option>
                            ))}
                          </Select>
                          <button className="rounded border border-ink-200 px-1.5 py-1 text-xs font-semibold hover:bg-ink-100" aria-label={`Move ${s.name} to the selected class`}>Move</button>
                        </form>
                      </Td>
                      <Td>{s.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="red">Inactive</Badge>}</Td>
                      <Td className="whitespace-nowrap text-right">
                        <InlineAction action={toggleSchoolUserActive} hidden={{ id: s.id }} label={s.isActive ? "Deactivate" : "Activate"} />
                        <a href={`/api/exports/student/${s.id}`} className="mr-1 inline-flex items-center rounded-full px-2.5 py-1.5 text-sm font-bold text-ink-700 hover:bg-ink-100" title="Everything held about this child, as one JSON file">
                          Export data
                        </a>
                        <InlineAction action={deleteSchoolUser} hidden={{ id: s.id }} label="Delete" variant="danger" confirm={`Delete ${s.name} and everything about them (reading, colouring, stickers, ratings, parent links)? This cannot be undone.`} />
                      </Td>
                    </tr>
                  ))}
                </Table>
              )}
              <Pagination base="/school/students" page={page} total={total} params={{ q, classId }} />
            </div>
          </Card>

          {students.length > 0 && (
            <Card title="Reset a student password" description="Only students on this page are listed. Search to find others.">
              <ActionForm action={resetSchoolUserPassword} submitLabel="Reset password" className="grid gap-4 sm:grid-cols-2">
                <Field label="Student">
                  <Select name="userId" required>
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.username})
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

        <div className="space-y-6">
          <Card title="Add a student">
            <ActionForm action={createStudent} submitLabel="Add student">
              <Field label="Full name">
                <Input name="name" required />
              </Field>
              <Field label="Student ID (username)" hint="For example the admission number">
                <Input name="username" required />
              </Field>
              <Field label="Class">
                <Select name="classId" defaultValue={classId ?? ""}>
                  <option value="">Assign later</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {className(c)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Email (optional)">
                <Input name="email" type="email" />
              </Field>
              <Field label="Password">
                <Input name="password" type="password" required minLength={8} />
              </Field>
            </ActionForm>
          </Card>

          {classes.length > 0 && (
            <>
              <Card title="Import from CSV" description="A spreadsheet saved as CSV with a header row.">
                <ActionForm action={importStudentsCsv} submitLabel="Import CSV">
                  <Field label="Class">
                    <Select name="classId" required defaultValue={classId ?? classes[0].id}>
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {className(c)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="CSV file" hint="Columns: Name, Student ID, Password, Email. Password and Email are optional.">
                    <Input name="file" type="file" accept=".csv,text/csv" required />
                  </Field>
                  <Field label="Default password" hint="Used for rows without a password. At least 8 characters.">
                    <Input name="defaultPassword" placeholder="Welcome123" />
                  </Field>
                </ActionForm>
                <p className="mt-3 text-xs text-ink-500">
                  <a href="/api/exports/students-template.csv" className="font-semibold text-accent hover:underline">
                    Download a template
                  </a>{" "}
                  to fill in.
                </p>
              </Card>
              <Card title="Or paste a list">
                <ActionForm action={importStudents} submitLabel="Import">
                  <Field label="Class">
                    <Select name="classId" required defaultValue={classId ?? classes[0].id}>
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {className(c)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="One student per line" hint="Format: Name, Student ID, Password, Email (optional)">
                    <Textarea name="rows" rows={5} required placeholder={"Asha Kumar, S1001, Welcome123\nRavi Nair, S1002, Welcome123, ravi@example.com"} />
                  </Field>
                </ActionForm>
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  );
}
