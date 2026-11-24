import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { planStatus, PLANS, planKeys } from "@/lib/plans";
import { Badge, Card, Empty, Field, Input, PageHeader, Select, Stat, Table, Td, Textarea } from "@/components/ui";
import { ActionForm, InlineAction } from "@/components/forms";
import { AuditTable } from "@/components/audit-table";
import { addSchoolAdmin, applyPlanPreset, createInvoice, deleteInvoice, deleteSchool, markInvoicePaid, resetUserPassword, schoolDeleteBlockers, toggleSchoolActive, toggleUserActive, updateSchoolAuth, updateSchoolPlan } from "../../actions";
import { SsoFields } from "@/components/sso-fields";
import { providerLabel, ssoConfigured, type AuthMode } from "@/lib/sso";
import { formatDate } from "@/lib/utils";
import { daysFromNow, now } from "@/lib/time";

function money(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}
const dateInput = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export default async function SchoolDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("SUPER_ADMIN");
  const { id } = await params;
  const school = await db.school.findUnique({
    where: { id },
    include: {
      users: { where: { role: "SCHOOL_ADMIN" }, orderBy: { name: "asc" } },
      invoices: { orderBy: { issuedAt: "desc" } },
      audits: { orderBy: { createdAt: "desc" }, take: 15 },
      _count: { select: { classes: true, subjects: true, lessons: true, files: true } },
    },
  });
  if (!school) notFound();
  const status = await planStatus(school);
  const blockers = await schoolDeleteBlockers(school.id);
  const admins = school.users;
  const in30 = daysFromNow(30);

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/admin", label: "Schools" }, { label: school.name }]}
        title={school.name}
        subtitle={`Code ${school.code}, created ${formatDate(school.createdAt)}`}
        actions={
          <>
            {school.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="red">Inactive</Badge>}
            <InlineAction action={toggleSchoolActive} hidden={{ id: school.id }} label={school.isActive ? "Deactivate school" : "Activate school"} variant={school.isActive ? "danger" : "primary"} confirm={school.isActive ? `Deactivate ${school.name}?` : undefined} />
            {blockers.length === 0 ? (
              <InlineAction action={deleteSchool} hidden={{ id: school.id }} label="Delete school" variant="danger" confirm={`Delete ${school.name} (${school.code}) and its ${admins.length === 1 ? "admin account" : `${admins.length} admin accounts`}? This cannot be undone.`} />
            ) : (
              <span className="text-xs text-ink-500" title="Only an empty school can be deleted">Cannot delete: has {blockers.join(", ")}</span>
            )}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Plan" value={status.label} hint={status.expired ? `Expired ${formatDate(status.expiresAt)}` : status.expiresAt ? `Until ${formatDate(status.expiresAt)}` : "No end date"} />
        <Stat label="Students" value={`${status.students.used} / ${status.students.max}`} />
        <Stat label="Teachers" value={`${status.teachers.used} / ${status.teachers.max}`} />
        <Stat label="Storage" value={`${status.storage.usedMb} MB`} hint={`of ${status.storage.maxMb} MB, ${school._count.files} files`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card
            title="Plan and limits"
            description={status.expired ? "The plan has expired. The school can read but not add anything." : undefined}
            actions={
              <div className="flex gap-1">
                {(["TRIAL", "BASIC", "PRO"] as const).map((p) => (
                  <InlineAction key={p} action={applyPlanPreset} hidden={{ schoolId: school.id, plan: p }} label={`Apply ${PLANS[p].label}`} variant="secondary" confirm={`Set ${school.name} to ${PLANS[p].label} for ${PLANS[p].days} days from today?`} />
                ))}
              </div>
            }
          >
            <ActionForm action={updateSchoolPlan} submitLabel="Save plan" className="grid gap-4 sm:grid-cols-2" resetOnSuccess={false}>
              <input type="hidden" name="schoolId" value={school.id} />
              <Field label="Plan">
                <Select name="plan" defaultValue={school.plan}>
                  {planKeys.map((k) => (
                    <option key={k} value={k}>
                      {PLANS[k].label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Expires on" hint="Leave blank for no end date.">
                <Input name="planExpiresAt" type="date" defaultValue={dateInput(school.planExpiresAt)} />
              </Field>
              <Field label="Max students">
                <Input name="maxStudents" type="number" min={0} defaultValue={school.maxStudents} />
              </Field>
              <Field label="Max teachers">
                <Input name="maxTeachers" type="number" min={0} defaultValue={school.maxTeachers} />
              </Field>
              <Field label="Storage (MB)">
                <Input name="maxStorageMb" type="number" min={0} defaultValue={school.maxStorageMb} />
              </Field>
            </ActionForm>
          </Card>

          <Card title="Invoices" description={school.invoices.some((i) => !i.paidAt) ? `${school.invoices.filter((i) => !i.paidAt).length} unpaid` : "Nothing outstanding"} padded={false}>
            <div className="px-5 pb-4">
              {school.invoices.length === 0 ? (
                <Empty>No invoices yet. Raise one on the right.</Empty>
              ) : (
                <Table head={["Invoice", "Description", "Amount", "Due", "Status", ""]}>
                  {school.invoices.map((i) => (
                    <tr key={i.id}>
                      <Td className="whitespace-nowrap font-semibold">{i.number}</Td>
                      <Td>{i.description}</Td>
                      <Td className="whitespace-nowrap">{money(i.amountCents, i.currency)}</Td>
                      <Td className="whitespace-nowrap text-ink-600">{formatDate(i.dueAt)}</Td>
                      <Td>{i.paidAt ? <Badge tone="green">Paid {formatDate(i.paidAt)}</Badge> : i.dueAt < now() ? <Badge tone="red">Overdue</Badge> : <Badge tone="amber">Due</Badge>}</Td>
                      <Td className="whitespace-nowrap text-right">
                        <InlineAction action={markInvoicePaid} hidden={{ id: i.id }} label={i.paidAt ? "Mark unpaid" : "Mark paid"} variant={i.paidAt ? "ghost" : "secondary"} />
                        {!i.paidAt && <InlineAction action={deleteInvoice} hidden={{ id: i.id }} label="Delete" variant="danger" confirm={`Delete ${i.number}?`} />}
                      </Td>
                    </tr>
                  ))}
                </Table>
              )}
            </div>
          </Card>

          <Card
            title="Sign-in"
            description={school.authMode === "FORM" ? "School code, username and password for everyone." : `Staff sign in with ${providerLabel[school.authMode as AuthMode]}. Students use their student ID and password${school.ssoStudents ? ", or the provider" : ""}.`}
            actions={ssoConfigured(school) ? <a href={`/api/auth/sso/start?school=${encodeURIComponent(school.code)}&test=1`} target="_blank" rel="noreferrer" className="rounded-full border border-ink-200 bg-white px-3.5 py-1.5 text-sm font-semibold text-ink-900 hover:bg-ink-100">Test connection</a> : undefined}
          >
            <ActionForm action={updateSchoolAuth} submitLabel="Save sign-in settings" resetOnSuccess={false}>
              <input type="hidden" name="schoolId" value={school.id} />
              <SsoFields defaults={{ authMode: school.authMode, ssoTenant: school.ssoTenant, ssoClientId: school.ssoClientId, hasSecret: !!school.ssoClientSecret, ssoAdminGroups: school.ssoAdminGroups, ssoTeacherGroups: school.ssoTeacherGroups, ssoAutoProvision: school.ssoAutoProvision, ssoStudents: school.ssoStudents }} />
            </ActionForm>
            {school.authMode !== "FORM" && <p className="mt-3 text-xs text-ink-500">Test connection opens the provider in a new tab; sign in with an account from the school to see what it would be mapped to. Nothing is created by a test.</p>}
          </Card>

          <Card title="School admins">
            {admins.length === 0 ? (
              <Empty>No admins. Add one on the right.</Empty>
            ) : (
              <Table head={["Name", "Username", "Email", "Status", ""]}>
                {admins.map((u) => (
                  <tr key={u.id}>
                    <Td className="font-semibold">{u.name}</Td>
                    <Td>
                      <code className="text-xs">{u.username}</code>
                    </Td>
                    <Td>{u.email ?? "—"}</Td>
                    <Td>
                      {u.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="red">Inactive</Badge>} {u.isBreakGlass && <Badge tone="slate">Break-glass login</Badge>}
                      {u.authProvider !== "FORM" && <Badge tone="slate">{providerLabel[u.authProvider as AuthMode]}</Badge>}
                    </Td>
                    <Td className="text-right">
                      <InlineAction action={toggleUserActive} hidden={{ id: u.id }} label={u.isActive ? "Deactivate" : "Activate"} variant={u.isActive ? "danger" : "secondary"} />
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>

          <Card title="Recent activity" description="Last 15 actions in this school.">
            <AuditTable rows={school.audits} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Raise an invoice">
            <ActionForm action={createInvoice} submitLabel="Create invoice">
              <input type="hidden" name="schoolId" value={school.id} />
              <Field label="Description">
                <Input name="description" required placeholder={`${status.label} plan, 2026-27`} />
              </Field>
              <div className="grid grid-cols-[1fr_6rem] gap-3">
                <Field label="Amount">
                  <Input name="amount" type="number" step="0.01" min={0} required />
                </Field>
                <Field label="Currency">
                  <Input name="currency" defaultValue="INR" maxLength={3} className="uppercase" />
                </Field>
              </div>
              <Field label="Due date">
                <Input name="dueAt" type="date" required defaultValue={dateInput(in30)} />
              </Field>
              <Field label="Note (optional)">
                <Textarea name="note" rows={2} placeholder="Bank details, reference, anything the school should know" />
              </Field>
            </ActionForm>
          </Card>

          <Card title="Add another admin">
            <ActionForm action={addSchoolAdmin} submitLabel="Add admin">
              <input type="hidden" name="schoolId" value={school.id} />
              <Field label="Name">
                <Input name="name" required />
              </Field>
              <Field label="Username">
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

          {admins.length > 0 && (
            <Card title="Reset an admin password">
              <ActionForm action={resetUserPassword} submitLabel="Reset password">
                <Field label="Admin">
                  <Select name="userId" required>
                    {admins.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.username})
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
      </div>
    </>
  );
}
