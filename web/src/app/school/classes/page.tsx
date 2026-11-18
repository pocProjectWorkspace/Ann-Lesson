import Link from "next/link";
import { requireSchoolRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { className } from "@/lib/data";
import { Badge, Card, Empty, Field, Input, PageHeader, spineColor } from "@/components/ui";
import { ActionForm } from "@/components/forms";
import { createClass } from "../actions";

export default async function ClassesPage() {
  const { schoolId } = await requireSchoolRole("SCHOOL_ADMIN");
  const classes = await db.class.findMany({
    where: { schoolId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { subjects: true, students: true, teachers: true } },
      subjects: { select: { name: true, lessons: { select: { _count: { select: { files: true } } } } } },
    },
  });

  return (
    <>
      <PageHeader title="Classes & syllabus" subtitle="A class holds subjects, each subject holds lessons, and each lesson holds its PDF files." />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div>
          {classes.length === 0 ? (
            <Empty>No classes yet. Create one on the right to start building the syllabus.</Empty>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2" aria-label="Classes">
              {classes.map((c, i) => {
                const lessons = c.subjects.flatMap((s) => s.lessons);
                const missing = lessons.filter((l) => l._count.files === 0).length;
                return (
                  <li key={c.id}>
                    <Link href={`/school/classes/${c.id}`} className="group flex h-full overflow-hidden rounded-[var(--radius-card)] border border-ink-200/80 bg-white shadow-card transition hover:-translate-y-0.5 hover:shadow-lift">
                      <span aria-hidden className="w-3 shrink-0" style={{ background: spineColor(i) }} />
                      <div className="flex min-w-0 flex-1 flex-col px-5 py-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-display text-[22px] leading-tight text-ink-950">{className(c)}</div>
                            <div className="text-sm text-ink-500">{c.academicYear ?? "No academic year set"}</div>
                          </div>
                          {missing > 0 && <Badge tone="amber">{missing} without PDF</Badge>}
                        </div>
                        <dl className="mt-4 grid grid-cols-4 gap-2">
                          {[
                            ["Subjects", c._count.subjects],
                            ["Lessons", lessons.length],
                            ["Teachers", c._count.teachers],
                            ["Students", c._count.students],
                          ].map(([k, v]) => (
                            <div key={k as string}>
                              <dt className="text-xs text-ink-500">{k}</dt>
                              <dd className="font-display text-xl text-ink-950">{v}</dd>
                            </div>
                          ))}
                        </dl>
                        {c.subjects.length > 0 && <div className="mt-3 truncate text-xs text-ink-500">{c.subjects.map((s) => s.name).join(", ")}</div>}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <Card title="Create a class" description="For example Nursery, section A.">
          <ActionForm action={createClass} submitLabel="Create class">
            <Field label="Class name">
              <Input name="name" required placeholder="Nursery" />
            </Field>
            <Field label="Section (optional)">
              <Input name="section" placeholder="A" />
            </Field>
            <Field label="Academic year (optional)">
              <Input name="academicYear" placeholder="2026-27" />
            </Field>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
