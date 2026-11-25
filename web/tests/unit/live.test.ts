import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));

const live = await import("@/lib/live");

describe("live rooms", () => {
  it("fans events out to subscribers of the same class only, and stops after unsubscribe", () => {
    const a: unknown[] = [];
    const b: unknown[] = [];
    const offA = live.subscribe("class-1", (e) => a.push(e));
    live.subscribe("class-2", (e) => b.push(e));
    live.broadcast("class-1", { type: "pick", name: "Aarav" });
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(0);
    offA();
    live.broadcast("class-1", { type: "pick", name: "Diya" });
    expect(a).toHaveLength(1);
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
