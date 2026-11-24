import { notFound } from "next/navigation";
import { requireSchoolRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { classGradebook, ratingLabel } from "@/lib/grades";
import { Card, Empty, LinkButton, PageHeader, Table, Td } from "@/components/ui";
import { GradeDashboard } from "@/components/grade-dashboard";

/** School admin: read-only view of a class's grades and ranking. Teachers enter the grades. */
export default async function SchoolClassGrades({ params }: { params: Promise<{ id: string }> }) {
  const { schoolId } = await requireSchoolRole("SCHOOL_ADMIN");
  const { id } = await params;
  const exists = await db.class.findFirst({ where: { id, schoolId }, select: { id: true } });
  if (!exists) notFound();
  const book = await classGradebook(id);
  if (!book) notFound();

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/school/classes", label: "Classes" }, { href: `/school/classes/${book.id}`, label: book.name }, { label: "Grades" }]}
        title={`${book.name}: grades and ranking`}
        subtitle="Entered by the class teachers. Overall grade is the average rating across subjects."
        actions={<LinkButton href={`/api/exports/progress.csv?classId=${book.id}`}>Export progress and grades</LinkButton>}
      />
      <GradeDashboard book={book} />
      <div className="mt-6">
        <Card title="All grades" padded={false}>
          {book.students.length === 0 ? (
            <div className="px-5 pb-5">
              <Empty>No students in this class.</Empty>
            </div>
          ) : (
            <Table head={["Student", ...book.subjects.map((s) => s.name), "Overall", "Rank"]} caption={`Grades for ${book.name}`}>
              {book.students.map((st) => (
                <tr key={st.id}>
                  <Td className="font-semibold">{st.name}</Td>
                  {st.ratings.map((r) => (
                    <Td key={r.subjectId}>{r.rating ? `${r.rating} · ${ratingLabel(r.rating)}` : "–"}</Td>
                  ))}
                  <Td className="font-semibold tabular-nums">{st.overall === null ? "–" : `${st.overall}%`}</Td>
                  <Td>{st.rank ?? "–"}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
