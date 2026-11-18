import { db } from "@/lib/db";
import { getSession, readWebviewSession } from "@/lib/auth";
import { Flipbook } from "@/components/flipbook";

/**
 * Minimal full-screen book viewer for the mobile app's web view.
 * Works with the session cookie, or with a "?t=" hand-off token when the web
 * view cannot keep cookies (some Android WebViews). The token is passed on to
 * the file request, where it is validated again against the session table.
 */
export default async function EmbeddedViewer({ params, searchParams }: { params: Promise<{ fileId: string }>; searchParams: Promise<{ t?: string }> }) {
  const { fileId } = await params;
  const { t } = await searchParams;
  const session = (await getSession()) ?? (await readWebviewSession(t));
  const file = session ? await db.lessonFile.findUnique({ where: { id: fileId }, select: { id: true, fileName: true, schoolId: true } }) : null;
  const allowed = !!session && !!file && (session.role === "SUPER_ADMIN" || session.schoolId === file.schoolId);

  if (!allowed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-900 p-6 text-center text-sm text-slate-200">
        This viewer link has expired. Go back and open the lesson again.
      </main>
    );
  }
  const src = `/api/files/${file.id}${t ? `?t=${encodeURIComponent(t)}` : ""}`;
  return (
    <main className="min-h-screen bg-slate-900 p-2">
      <Flipbook src={src} title={file.fileName} watermark={session.role === "STUDENT" || session.role === "TEACHER" ? session.name : undefined} />
    </main>
  );
}
