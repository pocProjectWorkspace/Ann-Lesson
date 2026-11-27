import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getSessionFromRequest } from "@/lib/auth";
import { listBackups, runBackup } from "@/lib/backup";
import { db } from "@/lib/db";

export const maxDuration = 300;

/**
 * POST /api/admin/backup → run a database backup now.
 * GET  /api/admin/backup → the recent backups.
 * Allowed for the platform owner's session, or for the nightly GitHub Actions job that
 * sends the BACKUP_TOKEN in the x-backup-token header (constant-time compared).
 */
async function allowed(req: NextRequest) {
  const token = process.env.BACKUP_TOKEN;
  const given = req.headers.get("x-backup-token");
  if (token && given && token.length === given.length && timingSafeEqual(Buffer.from(token), Buffer.from(given))) return "token";
  const session = await getSessionFromRequest(req);
  return session?.role === "SUPER_ADMIN" ? "owner" : null;
}

export async function POST(req: NextRequest) {
  const who = await allowed(req);
  if (!who) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  try {
    const r = await runBackup();
    await db.auditLog.create({ data: { schoolId: null, actorId: null, actorName: who === "token" ? "Nightly backup" : "Platform owner", action: "backup.run", targetType: "Database", targetId: r.key, summary: `Database backup ${r.key} (${(r.bytes / 1024 / 1024).toFixed(1)} MB${r.pruned ? `, pruned ${r.pruned} old` : ""})` } }).catch(() => {});
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Backup failed";
    await db.auditLog.create({ data: { schoolId: null, actorId: null, actorName: who === "token" ? "Nightly backup" : "Platform owner", action: "backup.failed", targetType: "Database", targetId: null, summary: message.slice(0, 300) } }).catch(() => {});
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const who = await allowed(req);
  if (!who) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  return NextResponse.json({ backups: await listBackups() });
}
