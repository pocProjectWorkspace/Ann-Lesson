import { addDays } from "@/lib/streaks";

/**
 * The last seven days as suns: a bright sun for a day with reading, a pale one without,
 * today ringed. A five-year-old reads "two more to go" from this without numbers.
 */
export function WeekSuns({ readDays, today, label }: { readDays: string[]; today: string; label?: string }) {
  const set = new Set(readDays);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const names = days.map((d) => ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"][new Date(`${d}T00:00:00Z`).getUTCDay()]);
  return (
    <div role="img" aria-label={label ?? `${set.size} of the last 7 days with reading`} className="flex items-end gap-1.5 sm:gap-2">
      {days.map((d, i) => {
        const on = set.has(d);
        const isToday = d === today;
        return (
          <div key={d} className="flex flex-col items-center gap-1">
            <span className={`grid h-9 w-9 place-items-center rounded-full text-lg transition sm:h-10 sm:w-10 ${on ? "bg-[#f7b733] shadow-[0_0_0_4px_rgba(247,183,51,0.25)]" : "bg-ink-100"} ${isToday ? "ring-2 ring-ink-900 ring-offset-2 ring-offset-paper" : ""}`} aria-hidden>
              {on ? "☀️" : isToday ? "·" : ""}
            </span>
            <span className={`text-[10px] font-bold ${isToday ? "text-ink-900" : "text-ink-400"}`} aria-hidden>
              {names[i]}
            </span>
          </div>
        );
      })}
    </div>
  );
}
