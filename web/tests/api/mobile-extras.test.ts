import { beforeAll, describe, expect, it } from "vitest";
import { api, BASE, login, users } from "./helpers";

type Home = { subjects: { id: string; lessons: { id: string }[] }[] };

let student: string;
let teacher: string;
let subjectId: string;
let fileId: string;

beforeAll(async () => {
  student = (await login(users.greenwoodStudent.school, users.greenwoodStudent.username, users.greenwoodStudent.password)).token;
  teacher = (await login(users.greenwoodTeacher.school, users.greenwoodTeacher.username, users.greenwoodTeacher.password)).token;
  const home = (await api<Home>("/api/mobile/home", { token: student })).data!;
  subjectId = home.subjects[0].id;
  const lesson = (await api<{ files: { id: string }[] }>(`/api/mobile/lessons/${home.subjects[0].lessons[0].id}`, { token: student })).data!;
  fileId = lesson.files[0].id;
});

describe("subject endpoint", () => {
  it("returns the subject with lessons and progress state for its own student", async () => {
    const r = await api<{ id: string; lessons: { state: string }[]; lessonCount: number }>(`/api/mobile/subjects/${subjectId}`, { token: student });
    expect(r.status).toBe(200);
    expect(r.data?.id).toBe(subjectId);
    expect(r.data?.lessonCount).toBeGreaterThan(0);
    expect(["none", "viewed", "finished", "learnt", "confirmed"]).toContain(r.data!.lessons[0].state);
  });
  it("is hidden from teachers and other schools", async () => {
    expect((await api(`/api/mobile/subjects/${subjectId}`, { token: teacher })).status).toBe(403);
    const other = (await login(users.riversideStudent.school, users.riversideStudent.username, users.riversideStudent.password)).token;
    expect((await api(`/api/mobile/subjects/${subjectId}`, { token: other })).status).toBe(404);
  });
});

describe("push tokens", () => {
  const token = `ExponentPushToken[test-${Math.random().toString(36).slice(2)}]`;
  it("registers and removes an Expo push token", async () => {
    expect((await api("/api/mobile/push-token", { method: "POST", token: student, body: JSON.stringify({ token, platform: "android" }) })).status).toBe(200);
    expect((await api("/api/mobile/push-token", { method: "POST", token: student, body: JSON.stringify({ token, platform: "android" }) })).status).toBe(200); // idempotent
    expect((await api("/api/mobile/push-token", { method: "DELETE", token: student, body: JSON.stringify({ token }) })).status).toBe(200);
  });
  it("rejects a token that is not an Expo push token", async () => {
    expect((await api("/api/mobile/push-token", { method: "POST", token: student, body: JSON.stringify({ token: "not-a-push-token", platform: "ios" }) })).status).toBe(400);
  });
});

describe("web-view hand-off token", () => {
  it("opens the embedded viewer and the PDF without cookies, and cannot be replaced by a session token", async () => {
    const t = (await api<{ token: string }>("/api/mobile/webview-token", { method: "POST", token: student })).data!.token;
    expect((await fetch(`${BASE}/embed/viewer/${fileId}?t=${encodeURIComponent(t)}`)).status).toBe(200);
    expect((await fetch(`${BASE}/api/files/${fileId}?t=${encodeURIComponent(t)}`)).status).toBe(200);
    expect((await fetch(`${BASE}/api/files/${fileId}?t=${encodeURIComponent(student)}`)).status).toBe(401);
    expect((await fetch(`${BASE}/api/files/${fileId}`)).status).toBe(401);
  });
});

describe("CORS for the token API", () => {
  it("answers preflight for a local origin and refuses a foreign one", async () => {
    const ok = await fetch(`${BASE}/api/mobile/home`, { method: "OPTIONS", headers: { Origin: "http://localhost:3100", "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization" } });
    expect(ok.status).toBe(204);
    expect(ok.headers.get("access-control-allow-origin")).toBe("http://localhost:3100");
    const bad = await fetch(`${BASE}/api/mobile/home`, { method: "OPTIONS", headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "GET" } });
    expect(bad.status).toBe(403);
  });
});

describe("health and error reporting", () => {
  it("health endpoint reports the database", async () => {
    const r = await api<{ ok: boolean; db: string }>("/api/health");
    expect(r.status).toBe(200);
    expect(r.data?.db).toBe("up");
  });
  it("accepts a client error report", async () => {
    const r = await api("/api/client-error", { method: "POST", body: JSON.stringify({ message: "test render error", path: "/test" }) });
    expect(r.status).toBe(200);
  });
});
