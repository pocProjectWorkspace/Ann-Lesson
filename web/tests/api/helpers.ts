/**
 * Helpers for API tests. They run against a live server (default http://localhost:3000)
 * seeded with `npm run db:seed`, `npm run seed:demo` and `npm run seed:sample`.
 */
export const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";

export type LoginResult = { token: string; user: { id: string; name: string; role: string; class: { id: string; name: string } | null; school: { id: string; code: string } } };

export async function api<T = unknown>(path: string, init: RequestInit & { token?: string } = {}) {
  const headers: Record<string, string> = { Accept: "application/json", ...(init.headers as Record<string, string>) };
  if (init.body && typeof init.body === "string") headers["Content-Type"] = "application/json";
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  const res = await fetch(`${BASE}${path}`, { ...init, headers, redirect: "manual" });
  const text = await res.text();
  let data: T | null = null;
  try {
    data = text ? (JSON.parse(text) as T) : null;
  } catch {
    data = null;
  }
  return { status: res.status, data, text, headers: res.headers };
}

export async function login(schoolCode: string, username: string, password: string) {
  const r = await api<LoginResult>("/api/mobile/login", { method: "POST", body: JSON.stringify({ schoolCode, username, password }) });
  if (r.status !== 200 || !r.data) throw new Error(`Login failed for ${schoolCode}/${username}: ${r.status} ${r.text}`);
  return r.data;
}

// Kindergarten demo data: Nursery A has the sample lesson; sunita teaches Nursery A in both schools.
export const users = {
  greenwoodStudent: { school: "GREENWOOD", username: "N001", password: "Learn1234" },
  greenwoodStudent2: { school: "GREENWOOD", username: "N002", password: "Learn1234" },
  greenwoodTeacher: { school: "GREENWOOD", username: "sunita", password: "Teach1234" },
  greenwoodAdmin: { school: "GREENWOOD", username: "admin", password: "Welcome123" },
  greenwoodParent: { school: "GREENWOOD", username: "P001", password: "Family1234" },
  riversideStudent: { school: "RIVERSIDE", username: "N001", password: "Learn1234" },
  riversideTeacher: { school: "RIVERSIDE", username: "sunita", password: "Teach1234" },
};
