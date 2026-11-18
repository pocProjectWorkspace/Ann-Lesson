import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { planLabel } from "@/lib/plans";
import { Badge, Card, Empty, Field, Input, LinkButton, PageHeader, Select, Stat, Table, Td } from "@/components/ui";
import { ActionForm, InlineAction } from "@/components/forms";
import { listParams, Pagination, SearchBox } from "@/components/list-controls";
import { createSchool, toggleSchoolActive } from "./actions";
import { formatDate } from "@/lib/utils";
import { now } from "@/lib/time";

export default async function AdminHome({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole("SUPER_ADMIN");
  const { q, page, skip, take } = listParams(await searchParams, 25);
  const where = q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { code: { contains: q, mode: "insensitive" as const } }] } : {};
  const [schools, total, allSchools] = await Promise.all([
    db.school.findMany({ where, orderBy: { createdAt: "desc" }, skip, take, include: { _count: { select: { classes: true, lessons: true } }, users: { select: { role: true } } } }),
    db.school.count({ where }),
    db.school.findMany({ select: { isActive: true, planExpiresAt: true, users: { select: { role: true } } } }),
  ]);
  const count = (s: { users: { role: string }[] }, role: string) => s.users.filter((u) => u.role === role).length;
  const totals = allSchools.reduce((a, s) => ({ students: a.students + count(s, "STUDENT"), teachers: a.teachers + count(s, "TEACHER") }), { students: 0, teachers: 0 });
  const today = now();
  const expiring = allSchools.filter((s) => s.planExpiresAt && s.planExpiresAt.getTime() - today.getTime() < 14 * 86_400_000).length;

  return (
    <>
      <PageHeader
        title="Schools"
        subtitle="Each school is its own space, with its own admin, teachers, students and syllabus."
        actions={
          <>
            <SearchBox action="/admin" q={q} placeholder="Search name or code" />
            <LinkButton href="/api/exports/schools.csv">Export CSV</LinkButton>
          </>
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Schools" value={allSchools.length} hint={`${allSchools.filter((s) => s.isActive).length} active${expiring ? `, ${expiring} expiring or expired` : ""}`} />
        <Stat label="Teachers" value={totals.teachers} />
        <Stat label="Students" value={totals.students} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_22rem]">
        <Card title={q ? `Results for "${q}"` : "All schools"} padded={false}>
          <div className="px-5 pb-4">
            {schools.length === 0 ? (
              <Empty>{q ? "No schools match." : "No schools yet. Create the first one on the right."}</Empty>
            ) : (
              <Table head={["School", "Code", "Plan", "Teachers", "Students", "Classes", "Status", ""]}>
                {schools.map((s) => {
                  const expired = !!s.planExpiresAt && s.planExpiresAt < today;
                  return (
                    <tr key={s.id}>
                      <Td>
                        <Link href={`/admin/schools/${s.id}`} className="whitespace-nowrap font-semibold text-ink-900 hover:text-accent">
                          {s.name}
                        </Link>
                        <div className="whitespace-nowrap text-xs text-ink-500">Created {formatDate(s.createdAt)}</div>
                      </Td>
                      <Td>
                        <code className="rounded bg-ink-100 px-1.5 py-0.5 text-xs font-semibold text-ink-700">{s.code}</code>
                      </Td>
                      <Td className="whitespace-nowrap">
                        {planLabel(s.plan)}
                        {s.planExpiresAt && <div className={`text-xs ${expired ? "text-rose-600" : "text-ink-500"}`}>{expired ? "Expired" : "Until"} {formatDate(s.planExpiresAt)}</div>}
                      </Td>
                      <Td>{count(s, "TEACHER")}</Td>
                      <Td>{count(s, "STUDENT")}</Td>
                      <Td>{s._count.classes}</Td>
                      <Td>{s.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="red">Inactive</Badge>}</Td>
                      <Td className="text-right">
                        <InlineAction action={toggleSchoolActive} hidden={{ id: s.id }} label={s.isActive ? "Deactivate" : "Activate"} variant={s.isActive ? "danger" : "secondary"} confirm={s.isActive ? `Deactivate ${s.name}? All its users will be locked out.` : undefined} />
                      </Td>
                    </tr>
                  );
                })}
              </Table>
            )}
            <Pagination base="/admin" page={page} total={total} pageSize={25} params={{ q }} />
          </div>
        </Card>

        <Card title="Create a school" description="You will hand the code and the admin login to the school.">
          <ActionForm action={createSchool} submitLabel="Create school">
            <Field label="School name">
              <Input name="name" required placeholder="Greenwood High School" />
            </Field>
            <Field label="School code" hint="Short and unique. Users type it at sign-in.">
              <Input name="code" required placeholder="GREENWOOD" className="uppercase placeholder:normal-case" />
            </Field>
            <Field label="Plan" hint="Trial is 30 days with 50 students. You can change it later.">
              <Select name="plan" defaultValue="TRIAL">
                <option value="TRIAL">Trial</option>
                <option value="BASIC">Basic</option>
                <option value="PRO">Pro</option>
              </Select>
            </Field>
            <hr className="border-ink-100" />
            <p className="text-sm font-semibold text-ink-700">First school admin</p>
            <Field label="Name">
              <Input name="adminName" required />
            </Field>
            <Field label="Username">
              <Input name="adminUsername" required placeholder="admin" />
            </Field>
            <Field label="Email (optional)">
              <Input name="adminEmail" type="email" />
            </Field>
            <Field label="Password" hint="At least 8 characters.">
              <Input name="adminPassword" type="password" required minLength={8} />
            </Field>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
