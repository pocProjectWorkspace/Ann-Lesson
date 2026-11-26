import { notFound } from "next/navigation";
import { requireSchoolRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { className } from "@/lib/data";
import { classStickers, TEACHER_STICKERS } from "@/lib/stickers";
import { Card, Empty, Input, PageHeader } from "@/components/ui";
import { ActionForm } from "@/components/forms";
import { giveStickers } from "../../../actions";

/**
 * Teacher: give stickers to one or more children, and see every child's streak and shelf.
 */
export default async function TeacherStickers({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSchoolRole("TEACHER");
  const { id } = await params;
  const teaches = await db.teacherAssignment.findFirst({ where: { teacherId: session.userId, classId: id }, select: { class: { select: { id: true, name: true, section: true, academicYear: true } } } });
  if (!teaches) notFound();
  const cls = teaches.class;
  const students = await classStickers(id);

  return (
    <>
      <PageHeader crumbs={[{ href: "/teacher", label: "My classes" }, { href: `/teacher/classes/${cls.id}`, label: className(cls) }, { label: "Stickers" }]} title={`${className(cls)}: stickers and streaks`} subtitle="Pick a sticker, tick the children who earned it, add a word if you like. They see it on their home screen straight away, and badges for reading milestones arrive on their own." />

      <Card title="Give a sticker" padded={false}>
        {students.length === 0 ? (
          <div className="px-5 pb-5">
            <Empty>No students in this class yet.</Empty>
          </div>
        ) : (
          <ActionForm action={giveStickers} submitLabel="Give sticker" className="border-t border-ink-100 px-5 py-4">
            <input type="hidden" name="classId" value={cls.id} />
            <fieldset>
              <legend className="text-sm font-semibold text-ink-900">Sticker</legend>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {TEACHER_STICKERS.map((s, i) => (
                  <label key={s.kind} className="flex cursor-pointer items-center gap-3 rounded-xl border border-ink-200 px-3 py-2.5 has-checked:border-amber-400 has-checked:bg-amber-50">
                    <input type="radio" name="kind" value={s.kind} defaultChecked={i === 0} className="sr-only" />
                    <span className="text-2xl" aria-hidden>
                      {s.emoji}
                    </span>
                    <span className="leading-tight">
                      <span className="block text-sm font-semibold text-ink-900">{s.label}</span>
                      <span className="block text-xs text-ink-500">{s.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="mt-4">
              <legend className="text-sm font-semibold text-ink-900">Who earned it</legend>
              <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
                {students.map((st) => (
                  <label key={st.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-paper/70 has-checked:bg-amber-50">
                    <input type="checkbox" name={`s:${st.id}`} className="h-4 w-4 accent-amber-500" />
                    <span className="truncate text-ink-900">{st.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="mt-4 block text-sm">
              <span className="font-semibold text-ink-900">A word for them (optional)</span>
              <Input name="note" maxLength={120} placeholder="e.g. Lovely reading of Letter A today" className="mt-1" />
            </label>
          </ActionForm>
        )}
      </Card>

      <div className="mt-6">
        <Card title="Shelves" description="Each child's streak and their latest stickers. A streak counts days with any reading, in the child's own time zone." padded={false}>
          <ul className="border-t border-ink-100">
            {students.map((st) => (
              <li key={st.id} className="grid gap-x-4 gap-y-1 border-t border-ink-100 px-5 py-3 first:border-t-0 sm:grid-cols-[14rem_11rem_1fr]">
                <span>
                  <span className="block font-semibold text-ink-900">{st.name}</span>
                  <span className="block text-xs text-ink-500">
                    {st.count} sticker{st.count === 1 ? "" : "s"}, {st.streak.days} reading day{st.streak.days === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="text-sm text-ink-700">{st.streak.current > 0 ? `🔥 ${st.streak.current} day${st.streak.current === 1 ? "" : "s"} in a row${st.streak.readToday ? "" : " (not yet today)"}` : st.streak.best > 0 ? `Best streak ${st.streak.best}` : "No streak yet"}</span>
                <span className="flex flex-wrap gap-1 text-xl" aria-label={st.stickers.length ? st.stickers.slice(0, 12).map((s) => s.label).join(", ") : "No stickers yet"}>
                  {st.stickers.slice(0, 12).map((s) => (
                    <span key={s.id} title={`${s.label}${s.note ? `: ${s.note}` : ""}${s.givenBy ? ` (from ${s.givenBy})` : ""}`} aria-hidden>
                      {s.emoji}
                    </span>
                  ))}
                  {st.stickers.length === 0 && <span className="text-sm text-ink-400">No stickers yet</span>}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
