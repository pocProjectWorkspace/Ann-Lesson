import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { AuditTable } from "@/components/audit-table";
import { listParams, Pagination, SearchBox } from "@/components/list-controls";

export default async function PlatformAudit({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole("SUPER_ADMIN");
  const { q, page, skip, take } = listParams(await searchParams);
  const where = q ? { OR: [{ summary: { contains: q, mode: "insensitive" as const } }, { actorName: { contains: q, mode: "insensitive" as const } }, { action: { contains: q, mode: "insensitive" as const } }, { school: { name: { contains: q, mode: "insensitive" as const } } }] } : {};
  const [rows, total] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip, take, include: { school: { select: { name: true } } } }),
    db.auditLog.count({ where }),
  ]);
  return (
    <>
      <PageHeader title="Activity" subtitle="Every admin action across the platform, newest first." actions={<SearchBox action="/admin/audit" q={q} placeholder="Search activity" />} />
      <Card padded={false}>
        <div className="px-5 py-2">
          <AuditTable rows={rows} showSchool />
          <Pagination base="/admin/audit" page={page} total={total} params={{ q }} />
        </div>
      </Card>
    </>
  );
}
