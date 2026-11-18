import { beforeAll, describe, expect, it } from "vitest";
import { api, BASE, login, users } from "./helpers";

beforeAll(async () => {
  const r = await fetch(`${BASE}/api/health`).catch(() => null);
  if (!r || r.status !== 200) throw new Error(`Server at ${BASE} is not healthy. Start it with "npm run dev" and seed with "npm run seed:demo".`);
});

describe("authentication", () => {
  it("rejects a wrong password with 401 and no token", async () => {
    const r = await api<{ error: string }>("/api/mobile/login", { method: "POST", body: JSON.stringify({ schoolCode: "GREENWOOD", username: "S2001", password: "nope" }) });
    expect(r.status).toBe(401);
    expect(r.data?.error).toMatch(/Incorrect/);
  });

  it("refuses admins on the mobile login", async () => {
    const r = await api<{ error: string }>("/api/mobile/login", { method: "POST", body: JSON.stringify({ schoolCode: "GREENWOOD", username: "admin", password: "Welcome123" }) });
    expect(r.status).toBe(403);
  });

  it("logs a student in and returns their class", async () => {
    const u = users.greenwoodStudent;
    const s = await login(u.school, u.username, u.password);
    expect(s.token).toBeTruthy();
    expect(s.user.role).toBe("STUDENT");
    expect(s.user.class?.name).toMatch(/Nursery|LKG|UKG/);
  });

  it("requires a token for protected endpoints", async () => {
    expect((await api("/api/mobile/home")).status).toBe(401);
    expect((await api("/api/mobile/me", { token: "not-a-token" })).status).toBe(401);
  });

  it("revokes the session on logout", async () => {
    const u = users.greenwoodStudent2;
    const s = await login(u.school, u.username, u.password);
    expect((await api("/api/mobile/me", { token: s.token })).status).toBe(200);
    expect((await api("/api/mobile/logout", { method: "POST", token: s.token })).status).toBe(200);
    expect((await api("/api/mobile/me", { token: s.token })).status).toBe(401);
  });

  it("refuses cookie-authenticated cross-site POSTs", async () => {
    const r = await fetch(`${BASE}/admin`, { method: "POST", headers: { Origin: "https://evil.example" }, body: "x=1", redirect: "manual" });
    expect(r.status).toBe(403);
  });

  it("rate-limits repeated failures on one account", async () => {
    const body = JSON.stringify({ schoolCode: "RIVERSIDE", username: "ratelimit-probe", password: "x" });
    let last = 0;
    for (let i = 0; i < 6; i++) last = (await api("/api/mobile/login", { method: "POST", body })).status;
    expect(last).toBe(429);
  });
});
