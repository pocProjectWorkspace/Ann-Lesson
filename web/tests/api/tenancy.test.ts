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
  it("students and teachers never get a download disposition for PDFs", async () => {
    const r = await api(`/api/files/${greenwoodLesson.files[0].id}?download=1`, { token: gStudent });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-disposition")).toMatch(/^inline/);
    const t = await api(`/api/files/${greenwoodLesson.files[0].id}?download=1`, { token: gTeacher });
    expect(t.status).toBe(200);
    expect(t.headers.get("content-disposition")).toMatch(/^inline/);
  });
});
