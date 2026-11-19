import { beforeAll, describe, expect, it } from "vitest";
import { api, login, users } from "./helpers";

type Home = { subjects: { lessons: { id: string; viewed: boolean; learnt: boolean }[] }[] };
type Lesson = { id: string; files: { id: string }[]; progress: { viewed: boolean; learnt: boolean; confirmedAt: string | null } };
type Notifications = { unread: number; items: { id: string; title: string; readAt: string | null }[] };

let student: string;
let teacher: string;
let studentId: string;
let unviewed: string | undefined;

beforeAll(async () => {
  const s = await login(users.riversideStudent.school, users.riversideStudent.username, users.riversideStudent.password);
  student = s.token;
  studentId = s.user.id;
  teacher = (await login(users.riversideTeacher.school, users.riversideTeacher.username, users.riversideTeacher.password)).token;
  const home = (await api<Home>("/api/mobile/home", { token: student })).data!;
  unviewed = home.subjects.flatMap((x) => x.lessons).find((l) => !l.viewed && !l.learnt)?.id;
});

describe("learning flow", () => {
  it("refuses to mark an unopened lesson as learnt", async () => {
    if (!unviewed) return; // all lessons already viewed in this database; nothing to assert
    const r = await api<{ error: string }>(`/api/mobile/lessons/${unviewed}/learnt`, { method: "POST", token: student, body: JSON.stringify({ learnt: true }) });
    expect(r.status).toBe(409);
    expect(r.data?.error).toMatch(/Open the lesson/);
  });

  it("records a view when the PDF is fetched, then allows learnt", async () => {
    if (!unviewed) return;
    const lesson = (await api<Lesson>(`/api/mobile/lessons/${unviewed}`, { token: student })).data!;
    expect((await api(`/api/files/${lesson.files[0].id}`, { token: student })).status).toBe(200);
    const after = (await api<Lesson>(`/api/mobile/lessons/${unviewed}`, { token: student })).data!;
    expect(after.progress.viewed).toBe(true);
    const r = await api<{ learnt: boolean }>(`/api/mobile/lessons/${unviewed}/learnt`, { method: "POST", token: student, body: JSON.stringify({ learnt: true }) });
    expect(r.status).toBe(200);
    expect(r.data?.learnt).toBe(true);
  });

  it("tracks reading position and marks the lesson finished at the last page", async () => {
    const home = (await api<Home>("/api/mobile/home", { token: student })).data!;
    const lessonId = home.subjects.flatMap((x) => x.lessons)[0].id;
    type Pos = { percent: number; finished: boolean; lastPage: number; state: string };
    const mid = await api<Pos>(`/api/mobile/lessons/${lessonId}/position`, { method: "POST", token: student, body: JSON.stringify({ page: 2, pageCount: 4 }) });
    expect(mid.status).toBe(200);
    expect(mid.data!.lastPage).toBe(2);
    expect([false, true]).toContain(mid.data!.finished); // may already be finished from an earlier run
    const back = await api<Pos>(`/api/mobile/lessons/${lessonId}/position`, { method: "POST", token: student, body: JSON.stringify({ page: 1, pageCount: 4 }) });
    expect(back.data!.lastPage).toBe(1);
    expect(back.data!.percent).toBeGreaterThanOrEqual(mid.data!.finished ? 100 : 50); // furthest page, not current page, drives the percent
    const end = await api<Pos>(`/api/mobile/lessons/${lessonId}/position`, { method: "POST", token: student, body: JSON.stringify({ page: 4, pageCount: 4 }) });
    expect(end.data!.finished).toBe(true);
    expect(end.data!.percent).toBe(100);
    const detail = (await api<{ progress: { percent: number; finished: boolean; lastPage: number } }>(`/api/mobile/lessons/${lessonId}`, { token: student })).data!;
    expect(detail.progress.finished).toBe(true);
    expect(detail.progress.lastPage).toBe(4);
    expect((await api(`/api/mobile/lessons/${lessonId}/position`, { method: "POST", token: student, body: JSON.stringify({ page: 0, pageCount: 4 }) })).status).toBe(400);
    expect((await api(`/api/mobile/lessons/${lessonId}/position`, { method: "POST", token: teacher, body: JSON.stringify({ page: 1, pageCount: 4 }) })).status).toBe(403);
  });

  it("teacher confirmation locks the lesson for the student", async () => {
    const home = (await api<Home>("/api/mobile/home", { token: student })).data!;
    const learnt = home.subjects.flatMap((x) => x.lessons).find((l) => l.learnt)!;
    const c = await api(`/api/mobile/lessons/${learnt.id}/confirm`, { method: "POST", token: teacher, body: JSON.stringify({ studentId, confirm: true }) });
    expect(c.status).toBe(200);
    const undo = await api<{ error: string }>(`/api/mobile/lessons/${learnt.id}/learnt`, { method: "POST", token: student, body: JSON.stringify({ learnt: false }) });
    expect(undo.status).toBe(409);
    expect(undo.data?.error).toMatch(/confirmed/);
    // tidy up so the test can run again
    expect((await api(`/api/mobile/lessons/${learnt.id}/confirm`, { method: "POST", token: teacher, body: JSON.stringify({ studentId, confirm: false }) })).status).toBe(200);
  });

  it("confirmation sends the student a notification that can be marked read", async () => {
    const n = (await api<Notifications>("/api/mobile/notifications", { token: student })).data!;
    expect(n.items.some((i) => /confirmed you learnt/.test(i.title))).toBe(true);
    expect((await api("/api/mobile/notifications", { method: "POST", token: student, body: JSON.stringify({}) })).status).toBe(200);
    expect((await api<Notifications>("/api/mobile/notifications", { token: student })).data!.unread).toBe(0);
  });

  it("password change requires the current password and keeps the current session", async () => {
    const bad = await api(`/api/mobile/password`, { method: "POST", token: student, body: JSON.stringify({ currentPassword: "wrong", newPassword: "Another123" }) });
    expect(bad.status).toBe(400);
    const ok = await api(`/api/mobile/password`, { method: "POST", token: student, body: JSON.stringify({ currentPassword: users.riversideStudent.password, newPassword: "Another123" }) });
    expect(ok.status).toBe(200);
    expect((await api("/api/mobile/me", { token: student })).status).toBe(200);
    // restore
    expect((await api(`/api/mobile/password`, { method: "POST", token: student, body: JSON.stringify({ currentPassword: "Another123", newPassword: users.riversideStudent.password }) })).status).toBe(200);
  });
});
