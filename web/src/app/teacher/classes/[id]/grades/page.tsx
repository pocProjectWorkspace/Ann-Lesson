import { notFound } from "next/navigation";
import { requireSchoolRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { classGradebook, RATING_LABELS } from "@/lib/grades";
import { Card, Empty, LinkButton, PageHeader } from "@/components/ui";
import { ActionForm } from "@/components/forms";
import { GradeDashboard } from "@/components/grade-dashboard";
import { saveGrades } from "../../../actions";

/**
 * Teacher: rate every student in every subject of the class, and see the ranking that
 * results. Ratings are 1 to 5; the overall grade is their average as a percentage.
 */
export default async function TeacherGrades({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSchoolRole("TEACHER");
  const { id } = await params;
  const teaches = await db.teacherAssignment.findFirst({ where: { teacherId: session.userId, classId: id }, select: { id: true } });
  if (!teaches) notFound();
  const book = await classGradebook(id);
  if (!book) notFound();

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/teacher", label: "My classes" }, { href: `/teacher/classes/${book.id}`, label: book.name }, { label: "Grades" }]}
        title={`${book.name}: grades and ranking`}
        subtitle="Rate each student in each subject from 1 (needs support) to 5 (excellent). The overall grade is the average, and the class is ranked by it."
        actions={<LinkButton href={`/api/exports/progress.csv?classId=${book.id}`}>Export progress and grades</LinkButton>}
      />

      <GradeDashboard book={book} />

      <div className="mt-6">
        <Card title="Enter grades" description={`${book.students.length} student${book.students.length === 1 ? "" : "s"}, ${book.subjects.length} subject${book.subjects.length === 1 ? "" : "s"}. Save once for the whole table.`} padded={false}>
          {book.students.length === 0 || book.subjects.length === 0 ? (
            <div className="px-5 pb-5">
              <Empty>{book.students.length === 0 ? "No students in this class yet." : "No subjects in this class yet."}</Empty>
            </div>
          ) : (
            <ActionForm action={saveGrades} submitLabel="Save grades" resetOnSuccess={false} className="border-t border-ink-100">
              <input type="hidden" name="classId" value={book.id} />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-ink-500">
                      <th className="px-5 py-3 font-semibold">Student</th>
                      {book.subjects.map((s) => (
                        <th key={s.id} className="px-3 py-3 font-semibold">
                          {s.name}
                        </th>
                      ))}
                      <th className="px-5 py-3 text-right font-semibold">Overall</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...book.students].sort((a, b) => a.name.localeCompare(b.name)).map((st) => (
                      <tr key={st.id} className="border-t border-ink-100">
                        <td className="px-5 py-2.5">
                          <span className="block font-semibold text-ink-900">{st.name}</span>
                          <span className="block text-xs text-ink-500">{st.username}</span>
                        </td>
                        {st.ratings.map((r) => (
                          <td key={r.subjectId} className="px-3 py-2.5">
                            <select key={`${r.subjectId}:${r.rating ?? ""}`} name={`g:${st.id}:${r.subjectId}`} defaultValue={r.rating ?? ""} aria-label={`${st.name}, ${book.subjects.find((s) => s.id === r.subjectId)?.name}`} className="w-full min-w-36 rounded-lg border border-ink-200 bg-white px-2 py-1.5 text-sm">
                              <option value="">Not graded</option>
                              {[5, 4, 3, 2, 1].map((v) => (
                                <option key={v} value={v}>
                                  {v} · {RATING_LABELS[v]}
                                </option>
                              ))}
                            </select>
                          </td>
                        ))}
                        <td className="px-5 py-2.5 text-right font-semibold tabular-nums text-ink-900">{st.overall === null ? "–" : `${st.overall}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="px-5 pb-2 text-xs text-ink-500">Students are told when their grades change. Reading progress is shown for context and does not affect the grade.</p>
            </ActionForm>
          )}
        </Card>
      </div>
    </>
  );
}
