import { requireRole, ALL_ROLES } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppShell } from "@/components/shell";
import { navFor } from "@/components/nav";
import { Badge, Card, Field, Input, PageHeader, Table, Td } from "@/components/ui";
import { ActionForm, InlineAction } from "@/components/forms";
import { changePassword, signOutDevice, signOutEverywhereElse } from "./actions";
import { formatDate } from "@/lib/utils";
import { now } from "@/lib/time";

function describe(ua: string | null) {
  if (!ua) return "Unknown device";
  if (/LessonPlan|okhttp|Expo/i.test(ua)) return "Mobile app";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /Firefox\//.test(ua) ? "Firefox" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

export default async function AccountPage() {
  const session = await requireRole(...ALL_ROLES);
  const [user, sessions] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: session.userId }, include: { school: { select: { name: true } } } }),
    db.session.findMany({ where: { userId: session.userId, revokedAt: null, expiresAt: { gt: now() } }, orderBy: { lastSeenAt: "desc" } }),
  ]);
  const nav = [...navFor(session.role), { href: "/account", label: "My account" }];

  return (
    <AppShell session={session} schoolName={user.school?.name} nav={nav}>
      <PageHeader title="My account" subtitle={`${user.name}${user.username !== user.name ? `, ${user.username}` : ""}`} />
      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <Card title="Change password" description="Changing it signs out every other device.">
          <ActionForm action={changePassword} submitLabel="Change password">
            <Field label="Current password">
              <Input name="current" type="password" required autoComplete="current-password" />
            </Field>
            <Field label="New password" hint="At least 8 characters.">
              <Input name="next" type="password" required minLength={8} autoComplete="new-password" />
            </Field>
            <Field label="Repeat new password">
              <Input name="confirm" type="password" required minLength={8} autoComplete="new-password" />
            </Field>
          </ActionForm>
        </Card>

        <Card
          title="Signed-in devices"
          description={`${sessions.length} active`}
          actions={sessions.length > 1 ? <InlineAction action={signOutEverywhereElse} label="Sign out everywhere else" variant="danger" confirm="Sign out of all other devices?" /> : undefined}
        >
          <Table head={["Device", "Signed in", "Last active", ""]}>
            {sessions.map((s) => (
              <tr key={s.id}>
                <Td>
                  <div className="font-semibold text-ink-900">{describe(s.userAgent)}</div>
                  <div className="text-xs text-ink-500">{s.kind === "mobile" ? "Mobile app" : "Web"}</div>
                </Td>
                <Td className="text-ink-600">{formatDate(s.createdAt)}</Td>
                <Td className="text-ink-600">{formatDate(s.lastSeenAt)}</Td>
                <Td className="text-right">{s.id === session.sid ? <Badge tone="green">This device</Badge> : <InlineAction action={signOutDevice} hidden={{ sid: s.id }} label="Sign out" variant="ghost" />}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </AppShell>
  );
}
