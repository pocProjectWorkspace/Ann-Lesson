import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({ hashPassword: async (s: string) => `hashed:${s}` }));
process.env.AUTH_SECRET = "unit-test-secret-that-is-at-least-32-chars-long";

const sso = await import("@/lib/sso");

describe("sso secrets", () => {
  it("round-trips a client secret and never stores it in clear", () => {
    const stored = sso.encryptSecret("super-secret-value");
    expect(stored).not.toContain("super-secret-value");
    expect(sso.decryptSecret(stored)).toBe("super-secret-value");
    expect(sso.encryptSecret("x")).not.toBe(sso.encryptSecret("x")); // fresh IV each time
  });
});

describe("role mapping", () => {
  const school = { ssoAdminGroups: "11111111-aaaa, head@school.example", ssoTeacherGroups: "", ssoAutoProvision: true };
  it("admin groups win, by group id or email, case-insensitively", () => {
    expect(sso.roleFor(school, { sub: "1", groups: ["11111111-AAAA"] })).toBe("SCHOOL_ADMIN");
    expect(sso.roleFor(school, { sub: "1", email: "Head@School.example" })).toBe("SCHOOL_ADMIN");
  });
  it("with no teacher list, any staff sign-in becomes a teacher when auto-provision is on", () => {
    expect(sso.roleFor(school, { sub: "1", email: "someone@school.example" })).toBe("TEACHER");
    expect(sso.roleFor({ ...school, ssoAutoProvision: false }, { sub: "1", email: "someone@school.example" })).toBeNull();
  });
  it("with a teacher list, only its members get in", () => {
    const strict = { ...school, ssoTeacherGroups: "teachers-group-id" };
    expect(sso.roleFor(strict, { sub: "1", groups: ["teachers-group-id"] })).toBe("TEACHER");
    expect(sso.roleFor(strict, { sub: "1", groups: ["other"] })).toBeNull();
  });
});

describe("flow state", () => {
  it("signs and reads back the PKCE flow, and rejects tampering", async () => {
    const flow = sso.newFlow({ school: "SUN", next: "/teacher", client: "web", test: false });
    expect(flow.state).not.toBe(flow.nonce);
    const token = await sso.signFlow(flow);
    expect(await sso.readFlow(token)).toMatchObject({ school: "SUN", next: "/teacher", state: flow.state });
    expect(await sso.readFlow(token.slice(0, -2) + "xx")).toBeNull();
    expect(sso.codeChallenge(flow.verifier)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe("form login rule", () => {
  it("staff of an SSO school must use the provider, except break-glass; students never", () => {
    const ms = { authMode: "MICROSOFT" };
    expect(sso.mustUseSso(ms, { role: "TEACHER", isBreakGlass: false })).toBe(true);
    expect(sso.mustUseSso(ms, { role: "SCHOOL_ADMIN", isBreakGlass: true })).toBe(false);
    expect(sso.mustUseSso(ms, { role: "STUDENT", isBreakGlass: false })).toBe(false);
    expect(sso.mustUseSso({ authMode: "FORM" }, { role: "TEACHER", isBreakGlass: false })).toBe(false);
  });
  it("discovery URLs point at the right provider", () => {
    expect(sso.discoveryUrl({ authMode: "MICROSOFT", ssoTenant: "abc" })).toBe("https://login.microsoftonline.com/abc/v2.0/.well-known/openid-configuration");
    expect(sso.discoveryUrl({ authMode: "GOOGLE", ssoTenant: "school.example" })).toContain("accounts.google.com");
    expect(() => sso.discoveryUrl({ authMode: "FORM", ssoTenant: null })).toThrow();
  });
});
