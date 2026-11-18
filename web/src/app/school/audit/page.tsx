import { db } from "@/lib/db";
import { requireSchoolRole } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { AuditTable } from "@/components/audit-table";
import { listParams, Pagination, SearchBox } from "@/components/list-controls";

export default async function SchoolAudit({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { schoolId } = await requireSchoolRole("SCHOOL_ADMIN");
  const { q, page, skip, take } = listParams(await searchParams);
  const where = { schoolId, ...(q ? { OR: [{ summary: { contains: q, mode: "insensitive" as const } }, { actorName: { contains: q, mode: "insensitive" as const } }, { action: { contains: q, mode: "insensitive" as const } }] } : {}) };
  const [rows, total] = await Promise.all([db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }), db.auditLog.count({ where })]);
  return (
    <>
      <PageHeader title="Activity" subtitle="Who changed what in your school, newest first." actions={<SearchBox action="/school/audit" q={q} placeholder="Search activity" />} />
      <Card padded={false}>
        <div className="px-5 py-2">
          <AuditTable rows={rows} />
          <Pagination base="/school/audit" page={page} total={total} params={{ q }} />
        </div>
      </Card>
    </>
  );
}
