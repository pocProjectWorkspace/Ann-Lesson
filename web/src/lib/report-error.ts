import "server-only";

/**
 * Error reporting without a vendor lock-in.
 * - Always: one structured JSON line to stderr (picked up by Docker, journald, any log shipper).
 * - If ERROR_WEBHOOK_URL is set: POST the same payload (works with Slack, Discord, Teams,
 *   Better Stack, or a tiny collector). Never throws, never awaited by the caller's hot path.
 */
export type ErrorContext = { where: string; userId?: string | null; schoolId?: string | null; path?: string; extra?: Record<string, unknown> };

export function reportError(err: unknown, ctx: ErrorContext) {
  const e = err instanceof Error ? err : new Error(String(err));
  const payload = {
    level: "error",
    time: new Date().toISOString(),
    message: e.message,
    name: e.name,
    stack: process.env.NODE_ENV === "production" ? e.stack?.split("\n").slice(0, 6).join("\n") : e.stack,
    ...ctx,
    env: process.env.NODE_ENV,
    version: process.env.APP_VERSION ?? "dev",
  };
  console.error(JSON.stringify(payload));
  const url = process.env.ERROR_WEBHOOK_URL;
  if (!url) return;
  const text = `[Lesson Plan] ${ctx.where}: ${e.message}${ctx.path ? ` (${ctx.path})` : ""}`;
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, content: text, ...payload }),
    signal: AbortSignal.timeout(3000),
  }).catch(() => {});
}
