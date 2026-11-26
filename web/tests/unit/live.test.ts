import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));

const live = await import("@/lib/live");

describe("live rooms", () => {
  it("fans events out to subscribers of the same class only, and stops after unsubscribe", () => {
    const a: unknown[] = [];
    const b: unknown[] = [];
    const offA = live.subscribe("class-1", (e) => a.push(e), { userId: "t1", controls: true });
    live.subscribe("class-2", (e) => b.push(e), { userId: "t2", controls: true });
    live.broadcast("class-1", { type: "pick", name: "Aarav" });
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(0);
    offA();
    live.broadcast("class-1", { type: "pick", name: "Diya" });
    expect(a).toHaveLength(1);
  });

  it("sends a child's submission to staff and to that child only, never to classmates", () => {
    const teacher: unknown[] = [];
    const author: unknown[] = [];
    const classmate: unknown[] = [];
    live.subscribe("class-4", (e) => teacher.push(e), { userId: "t1", controls: true });
    live.subscribe("class-4", (e) => author.push(e), { userId: "s1", controls: false });
    live.subscribe("class-4", (e) => classmate.push(e), { userId: "s2", controls: false });
    live.broadcast("class-4", { type: "submission", activityId: "a1", submission: { studentId: "s1", name: "Nila", strokes: [], done: false, updatedAt: "now" } });
    live.broadcast("class-4", { type: "pick", name: "Kabir" });
    expect(teacher).toHaveLength(2);
    expect(author).toHaveLength(2);
    expect(classmate).toHaveLength(1);
  });

  it("tracks presence, updates pages, and forgets people who go quiet", () => {
    vi.useFakeTimers();
    live.touch("class-3", { id: "s1", name: "Nila", role: "STUDENT", page: 2 });
    live.touch("class-3", { id: "s2", name: "Kabir", role: "STUDENT", page: 1 });
    expect(live.people("class-3").map((p) => `${p.name}:${p.page}`)).toEqual(["Kabir:1", "Nila:2"]);
    live.touch("class-3", { id: "s2", name: "Kabir", role: "STUDENT", page: 3 });
    expect(live.people("class-3").find((p) => p.id === "s2")?.page).toBe(3);
    vi.advanceTimersByTime(50_000);
    expect(live.people("class-3")).toHaveLength(0);
    vi.useRealTimers();
  });

  it("encodes SSE frames", () => {
    expect(live.sseFrame({ type: "ping" })).toBe('data: {"type":"ping"}\n\n');
  });
});
