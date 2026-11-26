import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSchoolRole } from "@/lib/auth";
import { studentSubject } from "@/lib/data";
import { Bookshelf } from "@/components/child/bookshelf";
import { Empty } from "@/components/ui";

/** One subject's shelf, with bigger covers. */
export default async function StudentSubject({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSchoolRole("STUDENT");
  const { id } = await params;
  const subject = await studentSubject(session.userId, id);
  if (!subject) notFound();
  const { lessonCount: total } = subject;
  const finished = subject.lessons.filter((l) => l.finished || l.learnt).length;

  return (
    <>
      <Link href="/student" className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-extrabold text-ink-700 shadow-card hover:text-ink-950">
        ← My shelves
      </Link>
      <h1 className="mt-4 font-display text-[36px] leading-tight font-extrabold text-ink-950">{subject.name}</h1>
      <p className="mt-1 text-[17px] font-semibold text-ink-600">{total === 0 ? "No books yet" : finished === total ? "You have finished every book here!" : `${finished} of ${total} book${total === 1 ? "" : "s"} finished`}</p>
      <div className="mt-8">{total === 0 ? <Empty>No books have been published in this subject yet.</Empty> : <Bookshelf books={subject.lessons} hrefFor={(b) => `/student/lessons/${b.id}`} coverWidth={120} />}</div>
    </>
  );
}
