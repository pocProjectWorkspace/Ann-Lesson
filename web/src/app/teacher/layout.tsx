import { requireSchoolRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppShell } from "@/components/shell";
import { navFor } from "@/components/nav";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSchoolRole("TEACHER");
  const school = await db.school.findUnique({ where: { id: session.schoolId }, select: { name: true } });
  return (
    <AppShell session={session} schoolName={school?.name} nav={navFor("TEACHER")}>
      {children}
    </AppShell>
  );
}
