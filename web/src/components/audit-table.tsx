import type { AuditLog } from "@prisma/client";
import { Empty, Table, Td } from "./ui";

function when(d: Date) {
  return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function AuditTable({ rows, showSchool }: { rows: (AuditLog & { school?: { name: string } | null })[]; showSchool?: boolean }) {
  if (rows.length === 0) return <Empty>No activity recorded yet.</Empty>;
  return (
    <Table head={showSchool ? ["When", "School", "Who", "What"] : ["When", "Who", "What"]}>
      {rows.map((r) => (
        <tr key={r.id}>
          <Td className="whitespace-nowrap text-ink-500">{when(r.createdAt)}</Td>
          {showSchool && <Td className="whitespace-nowrap">{r.school?.name ?? <span className="text-ink-400">Platform</span>}</Td>}
          <Td className="whitespace-nowrap font-semibold">{r.actorName}</Td>
          <Td>
            <div className="text-ink-900">{r.summary}</div>
            <div className="text-xs text-ink-400">{r.action}</div>
          </Td>
        </tr>
      ))}
    </Table>
  );
}
