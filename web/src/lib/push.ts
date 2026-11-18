import "server-only";
import { db } from "./db";
import { reportError } from "./report-error";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/**
 * Send a push notification to every registered device of the given users via
 * Expo's push service. Fire-and-forget: failures are reported, never thrown.
 * Tokens Expo marks as unregistered are deleted so we stop sending to them.
 * Disabled when PUSH_ENABLED=0 (useful in tests).
 */
export function sendPush(userIds: string[], message: { title: string; body?: string; data?: Record<string, unknown> }) {
  if (userIds.length === 0 || process.env.PUSH_ENABLED === "0") return;
  void (async () => {
    try {
      const tokens = await db.pushToken.findMany({ where: { userId: { in: userIds } }, select: { token: true } });
      if (tokens.length === 0) return;
      const messages = tokens.map((t) => ({ to: t.token, sound: "default", title: message.title, body: message.body, data: message.data }));
      for (let i = 0; i < messages.length; i += 100) {
        const chunk = messages.slice(i, i + 100);
        const res = await fetch(EXPO_PUSH_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}) },
          body: JSON.stringify(chunk),
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) throw new Error(`Expo push responded ${res.status}`);
        const out = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
        const dead = (out.data ?? []).map((r, idx) => (r.status === "error" && r.details?.error === "DeviceNotRegistered" ? chunk[idx].to : null)).filter((x): x is string => !!x);
        if (dead.length) await db.pushToken.deleteMany({ where: { token: { in: dead } } });
      }
    } catch (e) {
      reportError(e, { where: "push", extra: { users: userIds.length } });
    }
  })();
}
