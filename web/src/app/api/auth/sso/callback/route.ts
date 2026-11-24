import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { createMobileSession, createWebSession, homeFor } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { exchangeCode, flowCookieOptions, providerLabel, readFlow, resolveUser, roleFor, SSO_COOKIE, type AuthMode } from "@/lib/sso";
import { publicOrigin } from "../start/route";

const escape = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

function backToLogin(req: NextRequest, code: string, reason: string, message?: string) {
  const u = new URL("/login", req.url);
  u.searchParams.set("school", code);
  u.searchParams.set("error", "sso");
  u.searchParams.set("reason", reason);
  if (message) u.searchParams.set("message", message.slice(0, 160));
  const res = NextResponse.redirect(u);
  res.cookies.set(SSO_COOKIE, "", { ...flowCookieOptions, maxAge: 0 });
  return res;
}

/**
 * GET /api/auth/sso/callback?code=…&state=…
 * The provider sends the browser back here. We check the state against the flow cookie,
 * exchange the code, verify the ID token, find or create the person, and open a session.
 * In test mode (owner's "Test connection") nothing is created; a summary page is shown.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const flow = await readFlow(req.cookies.get(SSO_COOKIE)?.value);
  if (!flow) return backToLogin(req, q.get("school") ?? "", "expired");
  if (q.get("error")) return backToLogin(req, flow.school, "denied", q.get("error_description") ?? q.get("error") ?? undefined);
  if (q.get("state") !== flow.state || !q.get("code")) return backToLogin(req, flow.school, "state");

  const school = await db.school.findUnique({ where: { code: flow.school } });
  if (!school || !school.isActive) return backToLogin(req, flow.school, "school");

  let claims;
  try {
    claims = await exchangeCode(school, flow, q.get("code")!, `${publicOrigin(req)}/api/auth/sso/callback`);
  } catch (e) {
    console.error("sso callback", e);
    return backToLogin(req, flow.school, "provider", e instanceof Error ? e.message : undefined);
  }

  if (flow.test) {
    const role = roleFor(school, claims);
    const existing = claims.email ? await db.user.findFirst({ where: { schoolId: school.id, email: { equals: claims.email, mode: "insensitive" } }, select: { role: true, username: true } }) : null;
    const html = `<!doctype html><meta charset="utf-8"><title>SSO test</title><body style="font:15px/1.5 system-ui;max-width:40rem;margin:3rem auto;padding:0 1rem;color:#1b2430">
<h1 style="font-size:1.4rem">${escape(providerLabel[school.authMode as AuthMode])} sign-in works for ${escape(school.name)}</h1>
<p>The provider returned this identity. Nothing was created or changed.</p>
<table style="border-collapse:collapse"><tbody>
<tr><td style="padding:.25rem 1rem .25rem 0;color:#60708a">Name</td><td>${escape(claims.name)}</td></tr>
<tr><td style="padding:.25rem 1rem .25rem 0;color:#60708a">Email</td><td>${escape(claims.email ?? claims.preferred_username)}</td></tr>
<tr><td style="padding:.25rem 1rem .25rem 0;color:#60708a">Provider id</td><td><code>${escape(claims.sub)}</code></td></tr>
<tr><td style="padding:.25rem 1rem .25rem 0;color:#60708a">Groups in token</td><td>${claims.groups?.length ? escape(claims.groups.join(", ")) : "none (configure the groups claim, or use email lists)"}</td></tr>
<tr><td style="padding:.25rem 1rem .25rem 0;color:#60708a">Would sign in as</td><td>${existing ? `existing ${escape(existing.role.toLowerCase().replace("_", " "))} <code>${escape(existing.username)}</code> (linked by email)` : role ? `new ${escape(role.toLowerCase().replace("_", " "))}` : "refused: not in any admin or teacher list"}</td></tr>
</tbody></table>
<p style="margin-top:2rem"><a href="/admin">Back to schools</a></p></body>`;
    const res = new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
    res.cookies.set(SSO_COOKIE, "", { ...flowCookieOptions, maxAge: 0 });
    return res;
  }

  const r = await resolveUser(school, claims);
  if ("error" in r) return backToLogin(req, flow.school, "refused", r.error);
  const actor = { userId: r.user.id, name: r.user.name, schoolId: school.id };
  if (r.created) await audit(actor, { action: "user.sso.create", targetType: "User", targetId: r.user.id, summary: `${r.user.name} signed in with ${providerLabel[school.authMode as AuthMode]} for the first time and was created as ${r.user.role.toLowerCase().replace("_", " ")}` });
  else if (r.linked) await audit(actor, { action: "user.sso.link", targetType: "User", targetId: r.user.id, summary: `${r.user.name} linked their ${providerLabel[school.authMode as AuthMode]} account` });

  if (flow.client === "mobile") {
    const { token } = await createMobileSession(r.user);
    const me = { id: r.user.id, role: r.user.role, name: r.user.name, username: r.user.username, school: { id: school.id, name: school.name, code: school.code }, class: null };
    const target = new URL(flow.redirect ?? "lessonplan://sso");
    target.hash = new URLSearchParams({ token, user: Buffer.from(JSON.stringify(me)).toString("base64url") }).toString();
    const res = NextResponse.redirect(target.toString());
    res.cookies.set(SSO_COOKIE, "", { ...flowCookieOptions, maxAge: 0 });
    return res;
  }

  await createWebSession(r.user);
  const res = NextResponse.redirect(new URL(flow.next || homeFor[r.user.role], req.url));
  res.cookies.set(SSO_COOKIE, "", { ...flowCookieOptions, maxAge: 0 });
  return res;
}
