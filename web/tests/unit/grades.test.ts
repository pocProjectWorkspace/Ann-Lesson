import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/data", () => ({ className: () => "", readPercent: () => 0 }));

const g = await import("@/lib/grades");

describe("overall grade", () => {
  it("averages 1-5 ratings to a percentage and ignores ungraded subjects", () => {
    expect(g.overallPercent([5, 5, 5])).toBe(100);
    expect(g.overallPercent([4, 2])).toBe(60);
    expect(g.overallPercent([3, null, undefined])).toBe(60);
    expect(g.overallPercent([null, null])).toBeNull();
    expect(g.overallPercent([])).toBeNull();
  });
  it("labels ratings", () => {
    expect(g.ratingLabel(5)).toBe("Excellent");
    expect(g.ratingLabel(1)).toBe("Needs support");
    expect(g.ratingLabel(null)).toBe("Not graded");
  });
});

describe("ranking", () => {
  it("orders by overall, shares ranks on ties, leaves ungraded students unranked at the end", () => {
    const out = g.rank([
      { name: "a", overall: 60 },
      { name: "b", overall: null },
      { name: "c", overall: 90 },
      { name: "d", overall: 60 },
      { name: "e", overall: 40 },
    ]);
    expect(out.map((r) => `${r.name}:${r.rank}`)).toEqual(["c:1", "a:2", "d:2", "e:4", "b:null"]);
  });
});
