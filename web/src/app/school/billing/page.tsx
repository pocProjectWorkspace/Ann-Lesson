import { requireSchoolRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { planStatus } from "@/lib/plans";
import { Badge, Card, Empty, PageHeader, ProgressBar, Stat, Table, Td } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { now } from "@/lib/time";

function money(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}

export default async function BillingPage() {
  const { schoolId } = await requireSchoolRole("SCHOOL_ADMIN");
  const school = await db.school.findUniqueOrThrow({ where: { id: schoolId } });
  const [status, invoices] = await Promise.all([planStatus(school), db.invoice.findMany({ where: { schoolId }, orderBy: { issuedAt: "desc" } })]);
  const due = invoices.filter((i) => !i.paidAt);
  const pct = (used: number, max: number) => (max ? Math.min(100, (used / max) * 100) : 0);

  return (
    <>
      <PageHeader title="Plan & billing" subtitle="Your current plan, what you are using, and invoices from the platform." />
      {status.expired && (
        <div className="mb-6 rounded-lg border border-rose-100 bg-rose-100/60 px-4 py-3 text-sm font-medium text-rose-600">
          Your {status.label} plan expired on {formatDate(status.expiresAt)}. Everyone can still sign in and read, but new students, teachers and uploads are paused until it is renewed. Contact the platform owner.
        </div>
      )}
      {!status.expired && status.daysLeft !== null && status.daysLeft <= 14 && (
        <div className="mb-6 rounded-lg border border-marigold-100 bg-marigold-100/70 px-4 py-3 text-sm font-medium text-marigold-600">
          Your {status.label} plan ends in {status.daysLeft} day{status.daysLeft === 1 ? "" : "s"}, on {formatDate(status.expiresAt)}.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Plan" value={status.label} hint={status.expiresAt ? `Until ${formatDate(status.expiresAt)}` : "No end date"} />
        <Stat label="Students" value={`${status.students.used} / ${status.students.max}`} />
        <Stat label="Teachers" value={`${status.teachers.used} / ${status.teachers.max}`} />
        <Stat label="Storage" value={`${status.storage.usedMb} MB`} hint={`of ${status.storage.maxMb} MB`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[20rem_1fr]">
        <Card title="Usage">
          <div className="space-y-4">
            {[
              ["Students", status.students.used, status.students.max],
              ["Teachers", status.teachers.used, status.teachers.max],
              ["Storage (MB)", status.storage.usedMb, status.storage.maxMb],
            ].map(([label, used, max]) => (
              <div key={label as string}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-ink-700">{label}</span>
                  <span className="text-ink-500">
                    {used} / {max}
                  </span>
                </div>
                <ProgressBar value={pct(used as number, max as number)} label={`${label} used`} />
              </div>
            ))}
          </div>
        </Card>

        <Card title="Invoices" description={due.length ? `${due.length} awaiting payment` : "Nothing outstanding"} padded={false}>
          <div className="px-5 pb-4">
            {invoices.length === 0 ? (
              <Empty>No invoices yet.</Empty>
            ) : (
              <Table head={["Invoice", "Description", "Amount", "Due", "Status"]}>
                {invoices.map((i) => (
                  <tr key={i.id}>
                    <Td className="whitespace-nowrap font-semibold">{i.number}</Td>
                    <Td>
                      {i.description}
                      {i.note && <div className="text-xs text-ink-500">{i.note}</div>}
                    </Td>
                    <Td className="whitespace-nowrap">{money(i.amountCents, i.currency)}</Td>
                    <Td className="whitespace-nowrap text-ink-600">{formatDate(i.dueAt)}</Td>
                    <Td>{i.paidAt ? <Badge tone="green">Paid {formatDate(i.paidAt)}</Badge> : i.dueAt < now() ? <Badge tone="red">Overdue</Badge> : <Badge tone="amber">Due</Badge>}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
