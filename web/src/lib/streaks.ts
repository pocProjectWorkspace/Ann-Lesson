/**
 * Pure date helpers for reading streaks. Days are "YYYY-MM-DD" strings in the child's own
 * calendar: the device sends its local date, and the server only checks it is within a
 * day of its own clock, so the product works the same in every time zone.
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const dayString = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return dayString(d);
}

/** The client's local date if it is plausible (within a day of the server's UTC date), else the server's. */
export function localDay(clientDay: string | undefined, now = new Date()) {
  const server = dayString(now);
  if (!clientDay || !DAY.test(clientDay) || Number.isNaN(Date.parse(`${clientDay}T00:00:00Z`))) return server;
  return clientDay === server || clientDay === addDays(server, 1) || clientDay === addDays(server, -1) ? clientDay : server;
}

/** Consecutive reading days ending today, or ending yesterday when today has not been read yet. */
export function currentStreak(days: Iterable<string>, today: string) {
  const set = new Set(days);
  let d = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

/** The longest run of consecutive days ever. */
export function bestStreak(days: Iterable<string>) {
  const sorted = [...new Set(days)].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}
