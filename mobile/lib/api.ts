import { API_URL } from "./config";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

let currentToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

/**
 * Requests wait until the saved session has been restored from storage, so a
 * screen opened directly (deep link, browser reload) never fires unauthenticated.
 */
let resolveAuthReady: () => void = () => {};
let authReady = new Promise<void>((r) => (resolveAuthReady = r));
export function markAuthReady() {
  resolveAuthReady();
}
export function resetAuthReady() {
  authReady = new Promise<void>((r) => (resolveAuthReady = r));
}

export function setToken(token: string | null) {
  currentToken = token;
}
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  await authReady;
  const headers: Record<string, string> = { Accept: "application/json", ...(init.headers as Record<string, string>) };
  if (init.body) headers["Content-Type"] = "application/json";
  const sentWithToken = currentToken; // capture: the token may be restored while this request is in flight
  if (sentWithToken) headers.Authorization = `Bearer ${sentWithToken}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, `Cannot reach the server at ${API_URL}. Check your connection.`);
  }
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    // Only a 401 for a request that carried the *current* token means the session is gone.
    if (res.status === 401 && sentWithToken && sentWithToken === currentToken) onUnauthorized?.();
    let message = `Request failed (${res.status})`;
    if (data && typeof data === "object" && "error" in data) {
      const err = (data as { error?: unknown }).error;
      if (typeof err === "string" && err) message = err;
    }
    throw new ApiError(res.status, message);
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/* ---------- Types mirrored from the web API ---------- */

export type Role = "STUDENT" | "TEACHER";
export type User = {
  id: string;
  name: string;
  role: Role;
  username: string;
  school: { id: string; name: string; code: string } | null;
  class: { id: string; name: string } | null;
};
export type ProgressState = "none" | "viewed" | "finished" | "learnt" | "confirmed";
export type LessonSummary = { id: string; title: string; description: string | null; fileCount: number; viewed: boolean; learnt: boolean; confirmed?: boolean; finished?: boolean; percent?: number; lastPage?: number; pageCount?: number | null; state: ProgressState };
export type SubjectSummary = { id: string; name: string; lessonCount: number; learntCount: number; readPercent?: number; lessons: LessonSummary[] };
export type SubjectDetail = SubjectSummary & { class: { id: string; name: string } };
export type StudentGrades = { subjects: { id: string; name: string; rating: number | null; label: string }[]; overall: number | null; rank: number | null; classSize: number; gradedStudents: number };
export type StudentHome = { role: "STUDENT"; class: { id: string; name: string; academicYear: string | null } | null; totals: { lessons: number; learnt: number }; continueLessonId: string | null; subjects: SubjectSummary[]; grades?: StudentGrades | null };
export type Gradebook = {
  id: string;
  name: string;
  subjects: { id: string; name: string; average: number | null; gradedCount: number }[];
  students: { id: string; name: string; username: string; ratings: { subjectId: string; rating: number | null }[]; overall: number | null; readPercent: number; rank: number | null }[];
  classAverage: number | null;
  gradedStudents: number;
};
export type ClassSummary = { id: string; name: string; academicYear: string | null; studentCount: number; subjectCount: number; lessonCount: number; learntPercent: number };
export type TeacherHome = { role: "TEACHER"; classes: ClassSummary[] };
export type Home = StudentHome | TeacherHome;

export type TeacherLesson = { id: string; title: string; description: string | null; fileCount: number; published?: boolean; viewedCount: number; learntCount: number; confirmedCount: number };
export type ClassDetail = { id: string; name: string; academicYear: string | null; studentCount: number; subjects: { id: string; name: string; lessons: TeacherLesson[] }[] };

export type LessonFile = { id: string; fileName: string; sizeBytes: number; url: string; viewerPath: string };
export type LessonBase = {
  id: string;
  title: string;
  description: string | null;
  subject: { id: string; name: string };
  class: { id: string; name: string };
  files: LessonFile[];
  prevLessonId: string | null;
  nextLessonId: string | null;
};
export type Progress = { viewed: boolean; learnt: boolean; learntAt: string | null; lastViewedAt: string | null; confirmedAt?: string | null; finished?: boolean; percent?: number; lastPage?: number; pageCount?: number | null };
export type StudentLesson = LessonBase & { progress: Progress };
export type TeacherLessonDetail = LessonBase & { students: { id: string; name: string; username: string; viewedAt: string | null; learntAt: string | null; confirmedAt?: string | null; finishedAt?: string | null; percent?: number }[] };
export type NotificationItem = { id: string; title: string; body: string | null; href: string | null; createdAt: string; readAt: string | null };

/* ---------- Calls ---------- */

export const api = {
  loginOptions: (code: string) => request<{ code: string; name: string; mode: "FORM" | "MICROSOFT" | "GOOGLE"; provider: string | null; studentsSso: boolean }>(`/api/auth/login-options?code=${encodeURIComponent(code)}`),
  login: (body: { schoolCode: string; username: string; password: string }) => request<{ token: string; user: User }>("/api/mobile/login", { method: "POST", body: JSON.stringify(body) }),
  me: () => request<User>("/api/mobile/me"),
  home: () => request<Home>("/api/mobile/home"),
  subject: (id: string) => request<SubjectDetail>(`/api/mobile/subjects/${id}`),
  gradebook: (classId: string) => request<Gradebook>(`/api/mobile/classes/${classId}/grades`),
  setGrade: (classId: string, studentId: string, subjectId: string, rating: number | null) => request<{ overall: number | null; rank: number | null }>(`/api/mobile/classes/${classId}/grades`, { method: "POST", body: JSON.stringify({ studentId, subjectId, rating }) }),
  classDetail: (id: string) => request<ClassDetail>(`/api/mobile/classes/${id}`),
  lesson: (id: string) => request<StudentLesson | TeacherLessonDetail>(`/api/mobile/lessons/${id}`),
  setLearnt: (id: string, learnt: boolean) => request<Progress>(`/api/mobile/lessons/${id}/learnt`, { method: "POST", body: JSON.stringify({ learnt }) }),
  logout: () => request<{ ok: true }>("/api/mobile/logout", { method: "POST" }),
  changePassword: (currentPassword: string, newPassword: string) => request<{ ok: true }>("/api/mobile/password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }),
  confirmLearnt: (lessonId: string, studentId: string, confirm: boolean) => request<{ studentId: string; learntAt: string | null; confirmedAt: string | null }>(`/api/mobile/lessons/${lessonId}/confirm`, { method: "POST", body: JSON.stringify({ studentId, confirm }) }),
  notifications: () => request<{ unread: number; items: NotificationItem[] }>("/api/mobile/notifications"),
  markNotificationsRead: (ids?: string[]) => request<{ ok: true }>("/api/mobile/notifications", { method: "POST", body: JSON.stringify(ids ? { ids } : {}) }),
  registerPushToken: (token: string, platform: "ios" | "android" | "web") => request<{ ok: true }>("/api/mobile/push-token", { method: "POST", body: JSON.stringify({ token, platform }) }),
  removePushToken: (token: string) => request<{ ok: true }>("/api/mobile/push-token", { method: "DELETE", body: JSON.stringify({ token }) }),
  webviewToken: () => request<{ token: string; exchangePath: string; expiresInSeconds: number }>("/api/mobile/webview-token", { method: "POST" }),
};
