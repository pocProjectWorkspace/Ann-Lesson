import Link from "next/link";
import { ALL_ROLES, requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppShell } from "@/components/shell";
import { navFor } from "@/components/nav";
import { Card, Empty, PageHeader } from "@/components/ui";
import { InlineAction } from "@/components/forms";
import { listParams, Pagination } from "@/components/list-controls";
import { markAllRead, markRead } from "./actions";
import { now } from "@/lib/time";

function when(d: Date, ref: Date) {
  const diff = ref.getTime() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requireRole(...ALL_ROLES);
  const { page, skip, take } = listParams(await searchParams, 30);
  const [school, rows, total, unread] = await Promise.all([
    session.schoolId ? db.school.findUnique({ where: { id: session.schoolId }, select: { name: true } }) : null,
    db.notification.findMany({ where: { userId: session.userId }, orderBy: { createdAt: "desc" }, skip, take }),
    db.notification.count({ where: { userId: session.userId } }),
    db.notification.count({ where: { userId: session.userId, readAt: null } }),
  ]);

  const today = now();
  return (
    <AppShell session={session} schoolName={school?.name} nav={navFor(session.role)}>
      <PageHeader
        title="Notifications"
        subtitle={unread ? `${unread} unread` : "You are all caught up."}
        actions={unread ? <InlineAction action={markAllRead} label="Mark all as read" variant="secondary" /> : undefined}
      />
      {rows.length === 0 ? (
        <Empty>Nothing yet. You will be told here when new lessons are published or your class changes.</Empty>
      ) : (
        <Card padded={false}>
          <ul>
            {rows.map((n) => (
              <li key={n.id} className={`flex items-start gap-4 border-t border-ink-100 px-5 py-4 first:border-t-0 ${n.readAt ? "" : "bg-accent-soft/40"}`}>
                <span aria-hidden className={`mt-2 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-accent"}`} />
                <div className="min-w-0 flex-1">
                  {n.href ? (
                    <Link href={n.href} className="font-semibold text-ink-900 hover:text-accent">
                      {n.title}
                    </Link>
                  ) : (
                    <span className="font-semibold text-ink-900">{n.title}</span>
                  )}
                  {n.body && <div className="text-sm text-ink-600">{n.body}</div>}
                  <div className="mt-0.5 text-xs text-ink-400">{when(n.createdAt, today)}</div>
                </div>
                {!n.readAt && <InlineAction action={markRead} hidden={{ id: n.id }} label="Mark read" />}
              </li>
            ))}
          </ul>
          <div className="px-5 pb-4">
            <Pagination base="/notifications" page={page} total={total} pageSize={30} />
          </div>
        </Card>
      )}
    </AppShell>
  );
}
