import Link from "next/link";
import type { AlertView } from "@/lib/insights";
import { groupAlerts } from "@/lib/insights";
import { InlineAction } from "@/components/forms";
import { Card } from "@/components/ui";

const KIND_LABEL: Record<string, string> = { quiet: "Gone quiet", stuck: "Stuck on a book", behind: "Falling behind", "slow-page": "Struggling on a page" };

/**
 * The teacher's early-support card: children the platform thinks may need a hand this
 * week, why, and one concrete thing to try. Each line can be marked handled.
 */
export function NeedsAHand({ classId, alerts, onHandle }: { classId: string; alerts: AlertView[]; onHandle: (formData: FormData) => Promise<void> }) {
  const groups = groupAlerts(alerts);
  return (
    <Card title="Needs a hand" description={groups.length ? `${groups.length} ${groups.length === 1 ? "child" : "children"} this week, from reading patterns. Alerts clear on their own when the pattern changes.` : "Nobody flagged right now. The platform watches for children who go quiet, get stuck on a book most of the class finished, fall behind, or spend much longer than the class on one page."} padded={false}>
      {groups.length > 0 && (
        <ul className="border-t border-ink-100">
          {groups.map((g) => (
            <li key={g.studentId} className="border-t border-ink-100 px-5 py-3 first:border-t-0">
              <div className="font-semibold text-ink-900">{g.studentName}</div>
              <ul className="mt-1.5 space-y-2">
                {g.alerts.map((a) => (
                  <li key={a.id} className="grid gap-x-4 gap-y-1 sm:grid-cols-[1fr_auto]">
                    <div className="text-sm">
                      <span className="mr-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">{KIND_LABEL[a.kind] ?? a.kind}</span>
                      <span className="text-ink-800">{a.detail}.</span>
                      <span className="block text-ink-500">Try: {a.action}.</span>
                      {a.lessonId && (
                        <Link href={`/teacher/lessons/${a.lessonId}/insights`} className="text-xs font-semibold text-accent hover:underline">
                          Page insights for {a.lessonTitle}
                        </Link>
                      )}
                    </div>
                    <div className="self-start">
                      <InlineAction action={onHandle} hidden={{ alertId: a.id, classId }} label="Handled" />
                    </div>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
