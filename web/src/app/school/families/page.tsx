import { requireSchoolRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { familiesOf } from "@/lib/family";
import { className } from "@/lib/data";
import { Badge, Card, Empty, Field, Input, PageHeader, Select, Table, Td } from "@/components/ui";
import { ActionForm, InlineAction } from "@/components/forms";
import { createParent, linkParent, unlinkParent, deleteSchoolUser, resetSchoolUserPassword, toggleSchoolUserActive } from "../actions";

/** School admin: parent accounts and which children they are linked to. */
export default async function FamiliesPage() {
  const { schoolId } = await requireSchoolRole("SCHOOL_ADMIN");
  const [families, students] = await Promise.all([familiesOf(schoolId), db.user.findMany({ where: { schoolId, role: "STUDENT", isActive: true }, orderBy: [{ class: { sortOrder: "asc" } }, { name: "asc" }], select: { id: true, name: true, username: true, class: { select: { name: true, section: true } } } })]);
  const studentOptions = students.map((s) => (
    <option key={s.id} value={s.id}>
      {s.name} ({s.username}){s.class ? ` · ${className(s.class)}` : ""}
    </option>
  ));

  return (
    <>
      <PageHeader title="Families" subtitle="Parents sign in with the school code, their parent ID and password, and see only their own children: this week's reading, the book to read together tonight, stickers and stars." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={`Parents (${families.length})`} padded={false}>
            <div className="px-5 pb-4">
              {families.length === 0 ? (
                <Empty>No parent accounts yet. Add one on the right and link a child.</Empty>
              ) : (
                <Table head={["Parent", "Parent ID", "Children", "Status", ""]}>
                  {families.map((p) => (
                    <tr key={p.id}>
                      <Td>
                        <div className="font-semibold">{p.name}</div>
                        {p.email && <div className="text-xs text-ink-500">{p.email}</div>}
                      </Td>
                      <Td>
                        <code className="text-xs">{p.username}</code>
                      </Td>
                      <Td>
                        {p.children.length === 0 ? (
                          <span className="text-xs text-ink-500">No child linked</span>
                        ) : (
                          <ul className="space-y-1">
                            {p.children.map((c) => (
                              <li key={c.id} className="flex items-center gap-2 text-sm">
                                <span>
                                  {c.name}
                                  {c.relation ? <span className="text-ink-500"> · {c.relation}</span> : null}
                                  {c.className ? <span className="text-xs text-ink-500"> · {c.className}</span> : null}
                                </span>
                                <InlineAction action={unlinkParent} hidden={{ parentId: p.id, studentId: c.id }} label="Unlink" ariaLabel={`Unlink ${c.name} from ${p.name}`} />
                              </li>
                            ))}
                          </ul>
                        )}
                      </Td>
                      <Td>{p.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="red">Inactive</Badge>}</Td>
                      <Td className="whitespace-nowrap text-right">
                        <InlineAction action={toggleSchoolUserActive} hidden={{ id: p.id }} label={p.isActive ? "Deactivate" : "Activate"} />
                        <InlineAction action={deleteSchoolUser} hidden={{ id: p.id }} label="Delete" variant="danger" confirm={`Delete parent ${p.name}? This cannot be undone.`} />
                      </Td>
                    </tr>
                  ))}
                </Table>
              )}
            </div>
          </Card>

          {families.length > 0 && (
            <div className="grid gap-6 md:grid-cols-2">
              <Card title="Link another child" description="For a parent with more than one child at the school.">
                <ActionForm action={linkParent} submitLabel="Link child">
                  <Field label="Parent">
                    <Select name="parentId" required>
                      {families.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.username})
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Child">
                    <Select name="studentId" required>
                      {studentOptions}
                    </Select>
                  </Field>
                  <Field label="Relation (optional)">
                    <Input name="relation" placeholder="e.g. Mother, Father, Grandparent" maxLength={40} />
                  </Field>
                </ActionForm>
              </Card>
              <Card title="Reset a parent password">
                <ActionForm action={resetSchoolUserPassword} submitLabel="Reset password">
                  <Field label="Parent">
                    <Select name="userId" required>
                      {families.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.username})
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="New password">
                    <Input name="password" type="password" required minLength={8} />
                  </Field>
                </ActionForm>
              </Card>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <Card title="Add a parent" description="Give them the school code, this parent ID and the password. They can change the password after signing in.">
            <ActionForm action={createParent} submitLabel="Add parent">
              <Field label="Parent's name">
                <Input name="name" required maxLength={120} />
              </Field>
              <Field label="Parent ID" hint="What they type to sign in, e.g. P001 or a phone number">
                <Input name="username" required />
              </Field>
              <Field label="Email (optional)">
                <Input name="email" type="email" />
              </Field>
              <Field label="Temporary password">
                <Input name="password" type="text" required minLength={8} autoComplete="off" />
              </Field>
              <Field label="Child">
                <Select name="studentId" required>
                  {studentOptions}
                </Select>
              </Field>
              <Field label="Relation (optional)">
                <Input name="relation" placeholder="e.g. Mother" maxLength={40} />
              </Field>
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
