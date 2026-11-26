import { describe, expect, it } from "vitest";
import { addDays, bestStreak, currentStreak, localDay } from "@/lib/streaks";

describe("reading streaks", () => {
  it("counts consecutive days ending today, or yesterday when today is not read yet", () => {
    expect(currentStreak(["2026-03-01", "2026-03-02", "2026-03-03"], "2026-03-03")).toBe(3);
    expect(currentStreak(["2026-03-01", "2026-03-02", "2026-03-03"], "2026-03-04")).toBe(3);
    expect(currentStreak(["2026-03-01", "2026-03-02", "2026-03-03"], "2026-03-05")).toBe(0);
    expect(currentStreak(["2026-03-01", "2026-03-03"], "2026-03-03")).toBe(1);
    expect(currentStreak([], "2026-03-03")).toBe(0);
  });

  it("finds the best run across month ends and ignores duplicates", () => {
    expect(bestStreak(["2026-01-30", "2026-01-31", "2026-02-01", "2026-02-01", "2026-02-05", "2026-02-06"])).toBe(3);
    expect(bestStreak([])).toBe(0);
  });

  it("accepts the device's date only when it is within a day of the server's", () => {
    const now = new Date("2026-03-10T23:30:00Z");
    expect(localDay("2026-03-11", now)).toBe("2026-03-11");
    expect(localDay("2026-03-09", now)).toBe("2026-03-09");
    expect(localDay("2026-03-01", now)).toBe("2026-03-10");
    expect(localDay("not a date", now)).toBe("2026-03-10");
    expect(localDay(undefined, now)).toBe("2026-03-10");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});
