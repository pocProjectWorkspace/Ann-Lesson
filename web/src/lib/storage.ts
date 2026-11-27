import "server-only";
import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, mkdir, readFile, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, CopyObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { readdir } from "node:fs/promises";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Upload } from "@aws-sdk/lib-storage";

/**
 * Storage abstraction. "local" writes under UPLOAD_DIR and streams through
 * /api/files/[id]; "s3" works with AWS S3 or any S3-compatible service.
 * Keys are prefixed with the school id so a tenant's files sit together.
 */
export type StoredObject = { key: string };

const driver = process.env.STORAGE_DRIVER === "s3" ? "s3" : "local";
const uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR || "./uploads");

let s3: S3Client | null = null;
function s3Client() {
  if (!s3) {
    s3 = new S3Client({
      region: process.env.S3_REGION || "auto",
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: !!process.env.S3_ENDPOINT,
      credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "", secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "" },
    });
  }
  return s3;
}
const bucket = () => process.env.S3_BUCKET ?? "";

export function makeKey(schoolId: string, lessonId: string, fileName: string) {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  return `${schoolId}/${lessonId}/${randomUUID()}-${safe}`;
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<StoredObject> {
  if (driver === "s3") {
    await s3Client().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }));
  } else {
    const full = path.join(uploadDir, key);
    await mkdir(path.dirname(full), { recursive: true });
    await pipeline(Readable.from(body), createWriteStream(full));
  }
  return { key };
}

/** Stream an upload to storage without holding the whole file in memory. */
export async function putObjectStream(key: string, body: ReadableStream<Uint8Array>, contentType: string, sizeHint?: number): Promise<StoredObject> {
  if (driver === "s3") {
    const upload = new Upload({
      client: s3Client(),
      params: { Bucket: bucket(), Key: key, Body: Readable.fromWeb(body as import("stream/web").ReadableStream<Uint8Array>), ContentType: contentType, ContentLength: sizeHint },
      queueSize: 3,
      partSize: 8 * 1024 * 1024,
    });
    await upload.done();
  } else {
    const full = path.join(uploadDir, key);
    await mkdir(path.dirname(full), { recursive: true });
    try {
      await pipeline(Readable.fromWeb(body as import("stream/web").ReadableStream<Uint8Array>), createWriteStream(full));
    } catch (e) {
      await unlink(full).catch(() => {});
      throw e;
    }
  }
  return { key };
}

/** Duplicate a stored object under a new key (used when a syllabus is copied to a new class). */
export async function copyObject(fromKey: string, toKey: string) {
  if (driver === "s3") {
    await s3Client().send(new CopyObjectCommand({ Bucket: bucket(), CopySource: `${bucket()}/${fromKey}`, Key: toKey }));
  } else {
    const dest = path.join(uploadDir, toKey);
    await mkdir(path.dirname(dest), { recursive: true });
    await copyFile(path.join(uploadDir, fromKey), dest);
  }
}

export async function deleteObject(key: string) {
  if (driver === "s3") {
    await s3Client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
  } else {
    await unlink(path.join(uploadDir, key)).catch(() => {});
  }
}

/** Objects under a prefix (key, size, last modified). Local: files under UPLOAD_DIR/prefix. */
export async function listObjects(prefix: string): Promise<{ key: string; size: number; lastModified: Date }[]> {
  if (driver === "s3") {
    const out: { key: string; size: number; lastModified: Date }[] = [];
    let token: string | undefined;
    do {
      const r = await s3Client().send(new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix, ContinuationToken: token }));
      for (const o of r.Contents ?? []) if (o.Key) out.push({ key: o.Key, size: o.Size ?? 0, lastModified: o.LastModified ?? new Date(0) });
      token = r.IsTruncated ? r.NextContinuationToken : undefined;
    } while (token);
    return out;
  }
  const dir = path.join(uploadDir, prefix);
  try {
    const names = await readdir(dir);
    const rows = await Promise.all(names.map(async (n) => ({ key: prefix + n, ...(await stat(path.join(dir, n)).then((s) => ({ size: s.size, lastModified: s.mtime }))) })));
    return rows;
  } catch {
    return [];
  }
}

export async function deleteObjects(keys: string[]) {
  if (!keys.length) return;
  if (driver === "s3") {
    for (let i = 0; i < keys.length; i += 1000) await s3Client().send(new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })) } }));
  } else {
    await Promise.all(keys.map((k) => unlink(path.join(uploadDir, k)).catch(() => {})));
  }
}

/** For S3: a short-lived URL the browser can open directly. For local: null. */
export async function signedUrl(key: string, fileName: string, disposition: "inline" | "attachment" = "inline"): Promise<string | null> {
  if (driver !== "s3") return null;
  return getSignedUrl(
    s3Client(),
    new GetObjectCommand({ Bucket: bucket(), Key: key, ResponseContentDisposition: `${disposition}; filename="${encodeURIComponent(fileName)}"` }),
    { expiresIn: 300 },
  );
}

/** Local driver only: read the bytes to stream through the API route. */
export async function readLocal(key: string) {
  return readFile(path.join(uploadDir, key));
}

/** Local driver only: size of a stored object, or null when it is missing. */
export async function statLocal(key: string) {
  try {
    return (await stat(path.join(uploadDir, key))).size;
  } catch {
    return null;
  }
}

/** Local driver only: a web stream over [start, end] (inclusive) of a stored object. */
export function readLocalRange(key: string, start: number, end: number): ReadableStream<Uint8Array> {
  const node = createReadStream(path.join(uploadDir, key), { start, end });
  return Readable.toWeb(node) as ReadableStream<Uint8Array>;
}

export const storageDriver = driver;
