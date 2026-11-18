import "server-only";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { copyFile, mkdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, CopyObjectCommand } from "@aws-sdk/client-s3";
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

export const storageDriver = driver;
