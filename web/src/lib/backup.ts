import "server-only";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { deleteObjects, listObjects, putObjectStream } from "./storage";

/**
 * Database backups. `pg_dump` (custom format, compressed) is streamed straight into the
 * same storage as the books under `_backups/db/`, so a dump never touches the app's
 * disk and lives in a different system from the database. Dumps older than
 * BACKUP_KEEP_DAYS (default 30) are pruned after each run.
 *
 * Triggered nightly by the GitHub Actions workflow (POST /api/admin/backup with the
 * BACKUP_TOKEN header) and on demand by the platform owner from /admin.
 * Restore: see docs/DEPLOY-RAILWAY.md ("Backups and restore").
 */
export const BACKUP_PREFIX = "_backups/db/";
const KEEP_DAYS = Number(process.env.BACKUP_KEEP_DAYS ?? 30);

export type BackupResult = { key: string; bytes: number; ms: number; pruned: number };

export async function runBackup(): Promise<BackupResult> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const started = Date.now();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const key = `${BACKUP_PREFIX}db-${stamp}.dump`;

  const child = spawn("pg_dump", ["--format=custom", "--compress=6", "--no-owner", "--no-privileges", url], { stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d.toString()));
  let bytes = 0;
  const counted = child.stdout.pipe(
    new (await import("node:stream")).Transform({
      transform(chunk, _enc, cb) {
        bytes += chunk.length;
        cb(null, chunk);
      },
    }),
  );
  const exit = new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  await putObjectStream(key, Readable.toWeb(counted) as ReadableStream<Uint8Array>, "application/octet-stream");
  const code = await exit;
  if (code !== 0 || bytes < 1024) {
    // Never leave an empty or partial dump behind to be mistaken for a good one.
    await deleteObjects([key]).catch(() => {});
    throw new Error(code !== 0 ? `pg_dump exited with ${code}: ${stderr.trim().slice(0, 400)}` : `pg_dump produced only ${bytes} bytes: ${stderr.trim().slice(0, 400)}`);
  }

  const cutoff = Date.now() - KEEP_DAYS * 86_400_000;
  const old = (await listObjects(BACKUP_PREFIX)).filter((o) => o.key !== key && o.lastModified.getTime() < cutoff).map((o) => o.key);
  if (old.length) await deleteObjects(old);
  return { key, bytes, ms: Date.now() - started, pruned: old.length };
}

export async function listBackups() {
  const all = await listObjects(BACKUP_PREFIX);
  return all.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime()).slice(0, 40);
}
