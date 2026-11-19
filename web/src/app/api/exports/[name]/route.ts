import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { audit } from "@/lib/audit";
import { className } from "@/lib/data";

const fmt = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

function csvResponse(name: string, csv: string) {
  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store" },
  });
}

/**
 * GET /api/exports/students.csv[?classId=]      school admin
 * GET /api/exports/students-template.csv        school admin
 * GET /api/exports/progress.csv?classId=        school admin, or a teacher of that class
 * GET /api/exports/schools.csv                  platform owner
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { name } = await ctx.params;
  const classId = req.nextUrl.searchParams.get("classId") ?? undefined;

  if (name === "students-template.csv") {
    return csvResponse(name, toCsv([["Name", "Student ID", "Password", "Email"], ["Asha Kumar", "S1001", "Welcome123", "asha@example.com"], ["Ravi Nair", "S1002", "", ""]]));
  }

  if (name === "students.csv") {
    if (session.role !== "SCHOOL_ADMIN" || !session.schoolId) return new NextResponse("Forbidden", { status: 403 });
    const rows = await db.user.findMany({ where: { schoolId: session.schoolId, role: "STUDENT", ...(classId ? { classId } : {}) }, include: { class: true }, orderBy: [{ class: { sortOrder: "asc" } }, { name: "asc" }] });
    await audit(session, { action: "export.students", summary: `Exported ${rows.length} students to CSV` });
    return csvResponse(name, toCsv([["Name", "Student ID", "Email", "Class", "Academic year", "Status", "Created"], ...rows.map((r) => [r.name, r.username, r.email ?? "", className(r.class), r.class?.academicYear ?? "", r.isActive ? "Active" : "Inactive", fmt(r.createdAt)])]));
  }

  if (name === "progress.csv") {
    if (!classId || !session.schoolId) return new NextResponse("classId is required", { status: 400 });
    const cls = await db.class.findFirst({
      where: { id: classId, schoolId: session.schoolId, ...(session.role === "TEACHER" ? { teachers: { some: { teacherId: session.userId } } } : {}) },
      include: {
        students: { orderBy: { name: "asc" }, select: { id: true, name: true, username: true } },
        subjects: { orderBy: { sortOrder: "asc" }, include: { lessons: { orderBy: { sortOrder: "asc" }, include: { progress: true } } } },
      },
    });
    if (!cls || (session.role !== "SCHOOL_ADMIN" && session.role !== "TEACHER")) return new NextResponse("Forbidden", { status: 403 });
    const lessons = cls.subjects.flatMap((s) => s.lessons.map((l) => ({ ...l, subjectName: s.name })));
    const header = ["Student", "Student ID", ...lessons.map((l) => `${l.subjectName}: ${l.title}`), "Learnt", "Confirmed", "Total"];
    const body = cls.students.map((st) => {
      let learnt = 0;
      let confirmed = 0;
      const cells = lessons.map((l) => {
        const p = l.progress.find((x) => x.studentId === st.id);
        if (p?.confirmedAt) confirmed++;
        if (p?.learntAt) learnt++;
        return p?.confirmedAt ? "Confirmed" : p?.learntAt ? "Learnt" : p?.finishedAt ? "Finished reading" : p ? (p.pageCount && p.maxPage ? `Read ${Math.round((p.maxPage / p.pageCount) * 100)}%` : "Opened") : "";
      });
      return [st.name, st.username, ...cells, learnt, confirmed, lessons.length];
    });
    await audit(session, { action: "export.progress", targetType: "Class", targetId: cls.id, summary: `Exported progress for ${className(cls)}` });
    return csvResponse(`progress-${className(cls).replace(/\s+/g, "-").toLowerCase()}.csv`, toCsv([header, ...body]));
  }

  if (name === "schools.csv") {
    if (session.role !== "SUPER_ADMIN") return new NextResponse("Forbidden", { status: 403 });
    const rows = await db.school.findMany({ orderBy: { name: "asc" }, include: { users: { select: { role: true } }, _count: { select: { classes: true, lessons: true } } } });
    return csvResponse(name, toCsv([["School", "Code", "Plan", "Plan expires", "Active", "Teachers", "Students", "Classes", "Lessons", "Created"], ...rows.map((s) => [s.name, s.code, s.plan, fmt(s.planExpiresAt), s.isActive ? "Yes" : "No", s.users.filter((u) => u.role === "TEACHER").length, s.users.filter((u) => u.role === "STUDENT").length, s._count.classes, s._count.lessons, fmt(s.createdAt)])]));
  }

  return new NextResponse("Not found", { status: 404 });
}
