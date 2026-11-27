import { beforeAll, describe, expect, it } from "vitest";
import { api, login, users } from "./helpers";

type Home = { role: string; subjects?: { lessons: { id: string; viewed: boolean }[] }[]; classes?: { id: string }[] };
type Lesson = { id: string; files: { id: string }[]; class: { id: string } };

let gStudent: string;
let gTeacher: string;
let rStudent: string;
let rTeacher: string;
let greenwoodLesson: Lesson;
let greenwoodClassId: string;

beforeAll(async () => {
  const [a, b, c, d] = await Promise.all([
    login(users.greenwoodStudent.school, users.greenwoodStudent.username, users.greenwoodStudent.password),
    login(users.greenwoodTeacher.school, users.greenwoodTeacher.username, users.greenwoodTeacher.password),
    login(users.riversideStudent.school, users.riversideStudent.username, users.riversideStudent.password),
    login(users.riversideTeacher.school, users.riversideTeacher.username, users.riversideTeacher.password),
  ]);
  gStudent = a.token;
  gTeacher = b.token;
  rStudent = c.token;
  rTeacher = d.token;
  const home = (await api<Home>("/api/mobile/home", { token: gStudent })).data!;
  const lessonId = home.subjects!.flatMap((s) => s.lessons)[0].id;
  greenwoodLesson = (await api<Lesson>(`/api/mobile/lessons/${lessonId}`, { token: gStudent })).data!;
  greenwoodClassId = greenwoodLesson.class.id;
});

describe("tenant isolation", () => {
  it("a student in another school cannot read the lesson", async () => {
    expect((await api(`/api/mobile/lessons/${greenwoodLesson.id}`, { token: rStudent })).status).toBe(404);
  });
  it("a student in another school cannot fetch the PDF", async () => {
    expect((await api(`/api/files/${greenwoodLesson.files[0].id}`, { token: rStudent })).status).toBe(403);
  });
  it("a teacher in another school cannot open the class or export its progress", async () => {
    expect((await api(`/api/mobile/classes/${greenwoodClassId}`, { token: rTeacher })).status).toBe(404);
    expect((await api(`/api/exports/progress.csv?classId=${greenwoodClassId}`, { token: rTeacher })).status).toBe(403);
  });
  it("the right teacher can open the class and export", async () => {
    expect((await api(`/api/mobile/classes/${greenwoodClassId}`, { token: gTeacher })).status).toBe(200);
    const r = await api(`/api/exports/progress.csv?classId=${greenwoodClassId}`, { token: gTeacher });
    expect(r.status).toBe(200);
    expect(r.text).toMatch(/^﻿?Student,Student ID/);
  });
  it("students cannot use staff-only exports or confirm endpoints", async () => {
    expect((await api("/api/exports/students.csv", { token: gStudent })).status).toBe(403);
    expect((await api(`/api/mobile/lessons/${greenwoodLesson.id}/learnt`, { method: "POST", token: gTeacher, body: JSON.stringify({ learnt: true }) })).status).toBe(403);
  });
  it("teachers grade students per subject; the gradebook ranks them; students see their own grades", async () => {
    const book = await api<{ subjects: { id: string }[]; students: { id: string; username: string; overall: number | null; rank: number | null }[] }>(`/api/mobile/classes/${greenwoodClassId}/grades`, { token: gTeacher });
    expect(book.status).toBe(200);
    const subjectId = book.data!.subjects[0].id;
    const me = book.data!.students.find((s) => s.username === users.greenwoodStudent.username)!;
    const set = await api<{ overall: number | null; rank: number | null }>(`/api/mobile/classes/${greenwoodClassId}/grades`, { method: "POST", token: gTeacher, body: JSON.stringify({ studentId: me.id, subjectId, rating: 4 }) });
    expect(set.status).toBe(200);
    expect(set.data!.overall).toBeGreaterThan(0);
    expect(set.data!.rank).toBeGreaterThanOrEqual(1);
    const home = await api<{ grades: { overall: number | null; subjects: { id: string; rating: number | null; label: string }[] } }>("/api/mobile/home", { token: gStudent });
    expect(typeof (home.data!.grades as { showRank?: boolean }).showRank).toBe("boolean");
    const mine = home.data!.grades.subjects.find((s) => s.id === subjectId)!;
    expect(mine.rating).toBe(4);
    expect(mine.label).toBe("Good");
    expect((await api(`/api/mobile/classes/${greenwoodClassId}/grades`, { token: rTeacher })).status).toBe(404);
    expect((await api(`/api/mobile/classes/${greenwoodClassId}/grades`, { token: gStudent })).status).toBe(403);
    expect((await api(`/api/mobile/classes/${greenwoodClassId}/grades`, { method: "POST", token: gTeacher, body: JSON.stringify({ studentId: me.id, subjectId, rating: 9 }) })).status).toBe(400);
    // Clear it again so the demo data stays clean.
    expect((await api(`/api/mobile/classes/${greenwoodClassId}/grades`, { method: "POST", token: gTeacher, body: JSON.stringify({ studentId: me.id, subjectId, rating: null }) })).status).toBe(200);
  });
  it("live classroom room: teacher opens and controls it, students read it and report presence, outsiders are kept out", async () => {
    const fileId = greenwoodLesson.files[0].id;
    const open = await api<{ ok: boolean; state: { page: number; follow: boolean } }>(`/api/live/${greenwoodClassId}`, { method: "POST", token: gTeacher, body: JSON.stringify({ type: "open", lessonId: greenwoodLesson.id, fileId, page: 2 }) });
    expect(open.status).toBe(200);
    expect(open.data!.state.page).toBe(2);
    const seen = await api<{ state: { page: number } | null; people: { id: string; page: number | null }[] }>(`/api/live/${greenwoodClassId}`, { token: gStudent });
    expect(seen.status).toBe(200);
    expect(seen.data!.state?.page).toBe(2);
    expect((await api(`/api/live/${greenwoodClassId}`, { method: "POST", token: gStudent, body: JSON.stringify({ type: "page", page: 3 }) })).status).toBe(403);
    expect((await api(`/api/live/${greenwoodClassId}`, { method: "POST", token: gStudent, body: JSON.stringify({ type: "here", page: 2 }) })).status).toBe(200);
    const after = await api<{ people: { role: string; page: number | null }[] }>(`/api/live/${greenwoodClassId}`, { token: gTeacher });
    expect(after.data!.people.some((p) => p.role === "STUDENT" && p.page === 2)).toBe(true);
    expect((await api(`/api/live/${greenwoodClassId}`, { token: rStudent })).status).toBe(404);
    expect((await api(`/api/live/${greenwoodClassId}`, { method: "POST", token: rTeacher, body: JSON.stringify({ type: "page", page: 1 }) })).status).toBe(404);
    const follow = await api<{ state: { follow: boolean } }>(`/api/live/${greenwoodClassId}`, { method: "POST", token: gTeacher, body: JSON.stringify({ type: "follow", on: true }) });
    expect(follow.data!.state.follow).toBe(true);
    expect((await api(`/api/live/${greenwoodClassId}`, { method: "POST", token: gTeacher, body: JSON.stringify({ type: "close" }) })).status).toBe(200);
    expect((await api<{ state: unknown }>(`/api/live/${greenwoodClassId}`, { token: gStudent })).data!.state).toBeNull();
  });
  it("stickers and streaks: reading counts towards a streak, badges arrive on their own, teachers give stickers, students see them", async () => {
    type Shelf = { streak: { current: number; best: number; readToday: boolean }; stickers: { id: string; kind: string; label: string; givenBy: string | null; note: string | null }[]; count: number };
    const today = new Date().toISOString().slice(0, 10);
    // A page report with the device's date starts (or continues) today's streak.
    const pos = await api<{ streak: Shelf["streak"]; earned: { kind: string }[] }>(`/api/mobile/lessons/${greenwoodLesson.id}/position`, { method: "POST", token: gStudent, body: JSON.stringify({ page: 1, pageCount: 4, day: today }) });
    expect(pos.status).toBe(200);
    expect(pos.data!.streak.readToday).toBe(true);
    expect(pos.data!.streak.current).toBeGreaterThanOrEqual(1);
    // A date far from the server's is ignored rather than trusted.
    expect((await api(`/api/mobile/lessons/${greenwoodLesson.id}/position`, { method: "POST", token: gStudent, body: JSON.stringify({ page: 2, pageCount: 4, day: "2001-01-01" }) })).status).toBe(200);
    // Finishing the book earns the first-book badge, once.
    expect((await api(`/api/mobile/lessons/${greenwoodLesson.id}/position`, { method: "POST", token: gStudent, body: JSON.stringify({ page: 4, pageCount: 4, day: today }) })).status).toBe(200);
    const home = await api<{ stickers: Shelf }>("/api/mobile/home", { token: gStudent });
    expect(home.data!.stickers.stickers.filter((s) => s.kind === "first-book")).toHaveLength(1);
    expect(home.data!.stickers.streak.readToday).toBe(true);
    // The teacher gives a sticker with a note; the student sees it and gets told.
    const list = await api<{ kinds: { kind: string }[]; students: { id: string; username: string }[] }>(`/api/mobile/classes/${greenwoodClassId}/stickers`, { token: gTeacher });
    expect(list.status).toBe(200);
    const me = list.data!.students.find((s) => s.username === users.greenwoodStudent.username)!;
    const before = home.data!.stickers.count;
    const give = await api<{ given: string[] }>(`/api/mobile/classes/${greenwoodClassId}/stickers`, { method: "POST", token: gTeacher, body: JSON.stringify({ studentIds: [me.id], kind: "listener", note: "Listened so well" }) });
    expect(give.status).toBe(200);
    expect(give.data!.given).toEqual([me.id]);
    const after = (await api<{ stickers: Shelf }>("/api/mobile/home", { token: gStudent })).data!.stickers;
    expect(after.count).toBe(before + 1);
    expect(after.stickers[0]).toMatchObject({ kind: "listener", note: "Listened so well" });
    expect(typeof after.stickers[0].givenBy).toBe("string");
    const notes = await api<{ items: { title: string }[] }>("/api/mobile/notifications", { token: gStudent });
    expect(notes.data!.items.some((n) => n.title.includes("Great listener"))).toBe(true);
    // Guard rails: unknown kinds, students, and teachers of other schools.
    expect((await api(`/api/mobile/classes/${greenwoodClassId}/stickers`, { method: "POST", token: gTeacher, body: JSON.stringify({ studentIds: [me.id], kind: "first-book" }) })).status).toBe(400);
    expect((await api(`/api/mobile/classes/${greenwoodClassId}/stickers`, { method: "POST", token: gStudent, body: JSON.stringify({ studentIds: [me.id], kind: "star" }) })).status).toBe(403);
    expect((await api(`/api/mobile/classes/${greenwoodClassId}/stickers`, { method: "POST", token: rTeacher, body: JSON.stringify({ studentIds: [me.id], kind: "star" }) })).status).toBe(404);
    expect((await api(`/api/mobile/classes/${greenwoodClassId}/stickers`, { token: rTeacher })).status).toBe(404);
  });
  it("read to me: a teacher records a clip per page, the class hears it, nobody else does", async () => {
    const fileId = greenwoodLesson.files[0].id;
    // A tiny WAV header is enough for the upload path; the server stores bytes, it does not decode.
    const wav = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20, 16, 0, 0, 0, 1, 0, 1, 0, 0x40, 0x1f, 0, 0, 0x80, 0x3e, 0, 0, 2, 0, 16, 0, 0x64, 0x61, 0x74, 0x61, 0, 0, 0, 0]);
    const put = (token: string, page = 1, type = "audio/wav") => api<{ ok: boolean; page: number }>(`/api/uploads/narration?fileId=${fileId}&page=${page}&duration=1500`, { method: "PUT", token, headers: { "Content-Type": type }, body: wav });
    expect((await put(gStudent)).status).toBe(403);
    expect((await put(rTeacher)).status).toBe(404);
    expect((await put(gTeacher, 1, "text/plain")).status).toBe(415);
    const saved = await put(gTeacher, 1);
    expect(saved.status).toBe(200);
    expect(saved.data!.page).toBe(1);
    // The class hears it; another school does not; a page without a clip is a clean 404.
    const heard = await api(`/api/files/${fileId}/narration?page=1`, { token: gStudent });
    expect(heard.status).toBe(200);
    expect(heard.headers.get("content-type")).toContain("audio/wav");
    expect((await api(`/api/files/${fileId}/narration?page=1`, { token: rStudent })).status).toBe(403);
    expect((await api(`/api/files/${fileId}/narration?page=4321`, { token: gStudent })).status).toBe(404);
    // Re-recording replaces, removing clears.
    expect((await put(gTeacher, 1)).status).toBe(200);
    expect((await api(`/api/uploads/narration?fileId=${fileId}&page=1`, { method: "DELETE", token: gStudent })).status).toBe(403);
    expect((await api(`/api/uploads/narration?fileId=${fileId}&page=1`, { method: "DELETE", token: gTeacher })).status).toBe(200);
    expect((await api(`/api/files/${fileId}/narration?page=1`, { token: gStudent })).status).toBe(404);
  });
  it("page insights and alerts: the viewer's page time is recorded and summarised for the teacher; alerts are the teacher's only", async () => {
    const today = new Date().toISOString().slice(0, 10);
    type Ins0 = { pages: { page: number; measured: number }[] };
    const before = (await api<Ins0>(`/api/mobile/lessons/${greenwoodLesson.id}/insights`, { token: gTeacher })).data!;
    const measuredBefore = before.pages.find((p) => p.page === 2)?.measured ?? 0;
    const r = await api(`/api/mobile/lessons/${greenwoodLesson.id}/position`, { method: "POST", token: gStudent, body: JSON.stringify({ page: 2, pageCount: 4, day: today, dwell: [{ page: 1, ms: 12_000 }, { page: 2, ms: 700 }] }) });
    expect(r.status).toBe(200);
    type Ins = { pageCount: number; pages: { page: number; reached: number; avgMs: number | null; measured: number }[]; students: { id: string; totalMs: number }[] };
    const ins = await api<Ins>(`/api/mobile/lessons/${greenwoodLesson.id}/insights`, { token: gTeacher });
    expect(ins.status).toBe(200);
    expect(ins.data!.pageCount).toBeGreaterThanOrEqual(4);
    const p1 = ins.data!.pages.find((p) => p.page === 1)!;
    expect(p1.measured).toBeGreaterThanOrEqual(1);
    expect(p1.avgMs).toBeGreaterThanOrEqual(12_000);
    expect(p1.reached).toBeGreaterThanOrEqual(1);
    // Sub-second blips are ignored: page 2 gained no measurement.
    expect(ins.data!.pages.find((p) => p.page === 2)!.measured).toBe(measuredBefore);
    expect((await api(`/api/mobile/lessons/${greenwoodLesson.id}/insights`, { token: rTeacher })).status).toBe(404);
    expect((await api(`/api/mobile/lessons/${greenwoodLesson.id}/insights`, { token: gStudent })).status).toBe(403);
    const alerts = await api<{ alerts: unknown[] }>(`/api/mobile/classes/${greenwoodClassId}/alerts`, { token: gTeacher });
    expect(alerts.status).toBe(200);
    expect(Array.isArray(alerts.data!.alerts)).toBe(true);
    expect((await api(`/api/mobile/classes/${greenwoodClassId}/alerts`, { token: rTeacher })).status).toBe(404);
    expect((await api(`/api/mobile/classes/${greenwoodClassId}/alerts`, { method: "POST", token: gTeacher, body: JSON.stringify({ alertId: "00000000-0000-4000-8000-000000000000" }) })).status).toBe(404);
  });
  it("parent companion: a parent sees only their child, can open the child's book read-only, and hears about stickers", async () => {
    const parent = (await login(users.greenwoodParent.school, users.greenwoodParent.username, users.greenwoodParent.password)).token;
    type Fam = { role: string; children: { id: string; name: string; tonight: { fileId: string | null; lessonId: string } | null; stickers: unknown[]; week: { days: number } }[] };
    const home = await api<Fam>("/api/mobile/home", { token: parent });
    expect(home.status).toBe(200);
    expect(home.data!.role).toBe("PARENT");
    // The demo parent is linked to the first child of each class, so at least Aarav.
    expect(home.data!.children.length).toBeGreaterThanOrEqual(1);
    const child = home.data!.children.find((c) => c.name === "Aarav Mehta")!;
    expect(child).toBeTruthy();
    // The child's book opens; another school's does not; nothing is written to the child's progress.
    expect((await api(`/api/files/${greenwoodLesson.files[0].id}`, { token: parent })).status).toBe(200);
    const riverside = (await api<{ subjects: { lessons: { id: string }[] }[] }>("/api/mobile/home", { token: rStudent })).data!;
    const rLesson = (await api<{ files: { id: string }[] }>(`/api/mobile/lessons/${riverside.subjects.flatMap((s) => s.lessons)[0].id}`, { token: rStudent })).data!;
    expect((await api(`/api/files/${rLesson.files[0].id}`, { token: parent })).status).toBe(403);
    expect((await api(`/api/mobile/lessons/${greenwoodLesson.id}/position`, { method: "POST", token: parent, body: JSON.stringify({ page: 1, pageCount: 4 }) })).status).toBe(403);
    expect((await api(`/api/mobile/classes/${greenwoodClassId}/grades`, { token: parent })).status).toBe(403);
    expect((await api(`/api/live/${greenwoodClassId}`, { token: parent })).status).toBe(403);
    // A sticker from the teacher reaches the parent too.
    const list = await api<{ students: { id: string; username: string }[] }>(`/api/mobile/classes/${greenwoodClassId}/stickers`, { token: gTeacher });
    const me = list.data!.students.find((s) => s.username === users.greenwoodStudent.username)!;
    expect((await api(`/api/mobile/classes/${greenwoodClassId}/stickers`, { method: "POST", token: gTeacher, body: JSON.stringify({ studentIds: [me.id], kind: "star", note: "Shone in circle time" }) })).status).toBe(200);
    const notes = await api<{ items: { title: string; body: string | null }[] }>("/api/mobile/notifications", { token: parent });
    expect(notes.data!.items.some((n) => n.title.includes("Aarav got a sticker: Star of the day"))).toBe(true);
  });
  it("colouring: a child colours a page with fills and crayons, it is saved per page, the teacher sees the gallery", async () => {
    const fileId = greenwoodLesson.files[0].id;
    const strokes = [
      { tool: "fill", color: "#facc15", width: 0.001, points: [[0.5, 0.6]] },
      { tool: "crayon", color: "#ef4444", width: 0.022, points: [[0.2, 0.2], [0.3, 0.25], [0.4, 0.2]] },
    ];
    const saved = await api<{ ok: boolean; page: number }>(`/api/mobile/lessons/${greenwoodLesson.id}/colouring`, { method: "POST", token: gStudent, body: JSON.stringify({ fileId, page: 3, strokes }) });
    expect(saved.status).toBe(200);
    expect(saved.data!.page).toBe(3);
    const mine = await api<{ pages: { page: number; strokes: unknown[] }[] }>(`/api/mobile/lessons/${greenwoodLesson.id}/colouring?fileId=${fileId}`, { token: gStudent });
    expect(mine.status).toBe(200);
    expect(mine.data!.pages.find((p) => p.page === 3)!.strokes).toHaveLength(2);
    const gallery = await api<{ gallery: { studentName: string; page: number }[] }>(`/api/mobile/lessons/${greenwoodLesson.id}/colouring?fileId=${fileId}`, { token: gTeacher });
    expect(gallery.status).toBe(200);
    expect(gallery.data!.gallery.some((g) => g.studentName === "Aarav Mehta" && g.page === 3)).toBe(true);
    // Unknown tools and other schools are refused; a classmate sees only their own pages.
    expect((await api(`/api/mobile/lessons/${greenwoodLesson.id}/colouring`, { method: "POST", token: gStudent, body: JSON.stringify({ fileId, page: 3, strokes: [{ tool: "spray", color: "#000000", width: 0.01, points: [[0.1, 0.1]] }] }) })).status).toBe(400);
    expect((await api(`/api/mobile/lessons/${greenwoodLesson.id}/colouring?fileId=${fileId}`, { token: rStudent })).status).toBe(404);
    expect((await api(`/api/mobile/lessons/${greenwoodLesson.id}/colouring?fileId=${fileId}`, { token: rTeacher })).status).toBe(404);
    const other = (await login(users.greenwoodStudent2.school, users.greenwoodStudent2.username, users.greenwoodStudent2.password)).token;
    expect((await api<{ pages: { page: number }[] }>(`/api/mobile/lessons/${greenwoodLesson.id}/colouring?fileId=${fileId}`, { token: other })).data!.pages.some((p) => p.page === 3)).toBe(false);
    // Clearing the page removes it.
    expect((await api(`/api/mobile/lessons/${greenwoodLesson.id}/colouring`, { method: "POST", token: gStudent, body: JSON.stringify({ fileId, page: 3, strokes: [] }) })).status).toBe(200);
    expect((await api<{ pages: { page: number }[] }>(`/api/mobile/lessons/${greenwoodLesson.id}/colouring?fileId=${fileId}`, { token: gStudent })).data!.pages.some((p) => p.page === 3)).toBe(false);
  });
  it("pilot pack: legal pages are public, a child's data exports for the school admin and parent only, login options carry branding", async () => {
    expect((await api("/legal/privacy")).status).toBe(200);
    expect((await api("/legal/terms")).text).toContain("Terms of service");
    expect((await api("/legal/nope")).status).toBe(404);
    const parent = (await login(users.greenwoodParent.school, users.greenwoodParent.username, users.greenwoodParent.password)).token;
    const me = (await api<{ id?: string; user?: { id: string } }>("/api/mobile/me", { token: gStudent })).data!;
    const id = me.id ?? me.user!.id;
    const byParent = await api<{ name: string; progress: unknown[]; readingDays: unknown[]; stickers: unknown[] }>(`/api/exports/student/${id}`, { token: parent });
    expect(byParent.status).toBe(200);
    expect(byParent.data!.name).toBe("Aarav Mehta");
    expect(Array.isArray(byParent.data!.readingDays)).toBe(true);
    expect(byParent.headers.get("content-disposition")).toContain("attachment");
    expect((await api(`/api/exports/student/${id}`, { token: gStudent })).status).toBe(403);
    expect((await api(`/api/exports/student/${id}`, { token: rTeacher })).status).toBe(403);
    const opts = await api<{ name: string; brandColor: string | null; logoUrl: string | null }>("/api/auth/login-options?code=GREENWOOD");
    expect(opts.status).toBe(200);
    expect("brandColor" in opts.data!).toBe(true);
    expect((await api("/api/admin/backup", { method: "POST", token: gTeacher })).status).toBe(403);
    expect((await api("/api/admin/backup", { method: "POST", headers: { "x-backup-token": "wrong" } })).status).toBe(403);
  });
  it("board to desk: the teacher sends a page, students draw and submit, the board sees every drawing, closing ends it", async () => {
    type Room = { state: { page: number; activity: { id: string; page: number; prompt: string | null } | null } | null; submissions: { studentId: string; done: boolean }[] };
    const fileId = greenwoodLesson.files[0].id;
    const stroke = { tool: "pen", color: "#1d4ed8", width: 0.01, points: [[0.1, 0.1], [0.2, 0.3]] };
    // Nothing to send before a book is open.
    expect((await api(`/api/live/${greenwoodClassId}`, { method: "POST", token: gTeacher, body: JSON.stringify({ type: "activity.open" }) })).status).toBe(409);
    expect((await api(`/api/live/${greenwoodClassId}`, { method: "POST", token: gTeacher, body: JSON.stringify({ type: "open", lessonId: greenwoodLesson.id, fileId, page: 1 }) })).status).toBe(200);
    // Only the teacher opens an activity; it lands on the requested page with its prompt.
    expect((await api(`/api/live/${greenwoodClassId}`, { method: "POST", token: gStudent, body: JSON.stringify({ type: "activity.open", page: 3 }) })).status).toBe(403);
    const opened = await api<{ state: Room["state"] }>(`/api/live/${greenwoodClassId}`, { method: "POST", token: gTeacher, body: JSON.stringify({ type: "activity.open", page: 3, prompt: "Circle the red things" }) });
    expect(opened.status).toBe(200);
    const activity = opened.data!.state!.activity!;
    expect(activity.page).toBe(3);
    expect(activity.prompt).toBe("Circle the red things");
    // The student sees it, draws, and sends; staff cannot submit; bad ink is rejected.
    expect((await api<Room>(`/api/live/${greenwoodClassId}`, { token: gStudent })).data!.state!.activity!.id).toBe(activity.id);
    expect((await api(`/api/live/${greenwoodClassId}`, { method: "POST", token: gTeacher, body: JSON.stringify({ type: "activity.submit", activityId: activity.id, strokes: [stroke] }) })).status).toBe(403);
    expect((await api(`/api/live/${greenwoodClassId}`, { method: "POST", token: gStudent, body: JSON.stringify({ type: "activity.submit", activityId: activity.id, strokes: [{ ...stroke, color: "red" }] }) })).status).toBe(400);
    expect((await api(`/api/live/${greenwoodClassId}`, { method: "POST", token: rStudent, body: JSON.stringify({ type: "activity.submit", activityId: activity.id, strokes: [stroke] }) })).status).toBe(404);
    expect((await api(`/api/live/${greenwoodClassId}`, { method: "POST", token: gStudent, body: JSON.stringify({ type: "activity.submit", activityId: activity.id, strokes: [stroke] }) })).status).toBe(200);
    const sent = await api<{ done: boolean }>(`/api/live/${greenwoodClassId}`, { method: "POST", token: gStudent, body: JSON.stringify({ type: "activity.submit", activityId: activity.id, strokes: [stroke, stroke], done: true }) });
    expect(sent.status).toBe(200);
    expect(sent.data!.done).toBe(true);
    // The board gets the wall; the student gets only their own card.
    const wall = (await api<Room>(`/api/live/${greenwoodClassId}`, { token: gTeacher })).data!;
    expect(wall.submissions).toHaveLength(1);
    expect(wall.submissions[0].done).toBe(true);
    const mine = (await api<Room>(`/api/live/${greenwoodClassId}`, { token: gStudent })).data!;
    expect(mine.submissions.map((s) => s.studentId)).toEqual([wall.submissions[0].studentId]);
    // Closing the activity keeps the book open but stops submissions.
    const closed = await api<{ state: Room["state"] }>(`/api/live/${greenwoodClassId}`, { method: "POST", token: gTeacher, body: JSON.stringify({ type: "activity.close" }) });
    expect(closed.status).toBe(200);
    expect(closed.data!.state!.activity).toBeNull();
    expect((await api(`/api/live/${greenwoodClassId}`, { method: "POST", token: gStudent, body: JSON.stringify({ type: "activity.submit", activityId: activity.id, strokes: [stroke] }) })).status).toBe(409);
    expect((await api(`/api/live/${greenwoodClassId}`, { method: "POST", token: gTeacher, body: JSON.stringify({ type: "close" }) })).status).toBe(200);
  });
  it("students and teachers never get a download disposition for PDFs", async () => {
    const r = await api(`/api/files/${greenwoodLesson.files[0].id}?download=1`, { token: gStudent });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-disposition")).toMatch(/^inline/);
    const t = await api(`/api/files/${greenwoodLesson.files[0].id}?download=1`, { token: gTeacher });
    expect(t.status).toBe(200);
    expect(t.headers.get("content-disposition")).toMatch(/^inline/);
  });
});
