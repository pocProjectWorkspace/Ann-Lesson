import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { audit } from "@/lib/audit";

/**
 * GET /api/exports/student/:id → everything the platform holds about one child, as JSON.
 * For the school admin (own school) and the child's linked parents. This is the
 * "give me my child's data" path promised in the privacy notice; deleting the child
 * from the Students page removes all of it (every table cascades from the user row).
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const student = await db.user.findFirst({
    where: { id, role: "STUDENT" },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      schoolId: true,
      createdAt: true,
      isActive: true,
      class: { select: { name: true, section: true, academicYear: true } },
      progress: { select: { lesson: { select: { title: true } }, firstViewedAt: true, lastViewedAt: true, lastPage: true, maxPage: true, pageCount: true, finishedAt: true, learntAt: true, confirmedAt: true } },
      readingDays: { select: { day: true, pages: true }, orderBy: { day: "asc" } },
      stickers: { select: { kind: true, note: true, createdAt: true, givenBy: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
      gradesReceived: { select: { subject: { select: { name: true } }, rating: true, comment: true, updatedAt: true } },
      colourings: { select: { lesson: { select: { title: true } }, page: true, strokes: true, updatedAt: true } },
      pageDwell: { select: { lesson: { select: { title: true } }, page: true, ms: true, visits: true } },
      activitySubmissions: { select: { activity: { select: { page: true, prompt: true, createdAt: true, lessonId: true } }, strokes: true, done: true, updatedAt: true } },
      supportAlerts: { select: { kind: true, detail: true, createdAt: true, resolvedAt: true } },
      guardians: { select: { relation: true, parent: { select: { name: true, username: true } } } },
    },
  });
  if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let allowed = false;
  if (session.role === "SUPER_ADMIN") allowed = true;
  else if (session.role === "SCHOOL_ADMIN") allowed = session.schoolId === student.schoolId;
  else if (session.role === "PARENT") allowed = !!(await db.guardianLink.findFirst({ where: { parentId: session.userId, studentId: student.id }, select: { id: true } }));
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await audit(session, { action: "student.export", targetType: "User", targetId: student.id, summary: `Exported ${student.name}'s data` });
  const body = { exportedAt: new Date().toISOString(), exportedBy: session.role, ...student };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${student.username}-data.json"`, "Cache-Control": "private, no-store" },
  });
}
