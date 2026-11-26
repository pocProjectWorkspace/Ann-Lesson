import Link from "next/link";
import { requireSchoolRole } from "@/lib/auth";
import { studentHome } from "@/lib/data";
import { studentGrades } from "@/lib/grades";
import { studentStickers } from "@/lib/stickers";
import { dayString } from "@/lib/streaks";
import { LiveBanner } from "@/components/live/live-banner";
import { StickerShelf } from "@/components/sticker-shelf";
import { Bookshelf, cloth } from "@/components/child/bookshelf";
import { BookCover } from "@/components/child/book-cover";
import { WeekSuns } from "@/components/child/week-suns";
import { Empty } from "@/components/ui";
import { now } from "@/lib/time";

function greeting(d: Date) {
  const h = d.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** The child's home: a bookshelf. Books are their real covers; the one being read leans out. */
export default async function StudentHome() {
  const session = await requireSchoolRole("STUDENT");
  const [home, grades, shelf] = await Promise.all([studentHome(session.userId), studentGrades(session.userId), studentStickers(session.userId)]);
  const firstName = session.name.split(" ")[0];
  const hello = greeting(now());
  const today = dayString(now());

  if (!home.class) {
    return (
      <>
        <h1 className="font-display text-[34px] font-extrabold text-ink-950">
          {hello}, {firstName}
        </h1>
        <div className="mt-6">
          <Empty>You have not been placed in a class yet. Ask your school admin to add you to one.</Empty>
        </div>
      </>
    );
  }

  const cont = home.continueLesson;
  const subjectIndex = new Map(home.subjects.map((s, i) => [s.id, i]));
  const contTint = cont ? cloth((subjectIndex.get(cont.subjectId) ?? 0) * 3 + home.subjects.find((s) => s.id === cont.subjectId)!.lessons.findIndex((l) => l.id === cont.id)) : cloth(0);
  const streak = shelf.streak;

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-start">
        <div>
          <p className="text-[15px] font-bold text-ink-500">{home.class.name}</p>
          <h1 className="mt-0.5 font-display text-[36px] leading-[1.05] font-extrabold text-ink-950 sm:text-[44px]">
            {hello}, {firstName}!
          </h1>
          <p className="mt-2 text-[17px] font-semibold text-ink-700">
            {streak.current > 0 ? (streak.readToday ? `${streak.current} day${streak.current === 1 ? "" : "s"} in a row. Brilliant!` : `${streak.current} day${streak.current === 1 ? "" : "s"} in a row. Read one page today to keep it going.`) : "Read a page today to light up a sun."}
          </p>
        </div>
        <div className="rounded-[22px] border-2 border-ink-900/10 bg-white/70 px-4 py-3">
          <WeekSuns readDays={streak.recent} today={today} />
        </div>
      </div>

      <LiveBanner classId={home.class.id} />

      {cont && (
        <Link href={`/student/lessons/${cont.id}`} className="group mt-6 flex items-center gap-5 rounded-[26px] border-2 border-accent/30 bg-white px-5 py-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-lift sm:px-6">
          <span className="relative shrink-0 -rotate-3 transition group-hover:rotate-0">
            <BookCover fileId={cont.fileId} title={cont.title} width={84} tint={contTint} />
            <span className="absolute -top-3 right-3 h-9 w-3 rounded-b-sm bg-[#e4572e] shadow-sm" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-extrabold tracking-wide text-accent">{cont.finished ? "Read it again" : "Keep reading"}</span>
            <span className="block truncate font-display text-[26px] leading-tight font-extrabold text-ink-950">{cont.title}</span>
            <span className="block text-[15px] font-semibold text-ink-600">
              {cont.subjectName}
              {cont.pageCount ? ` · page ${Math.max(1, cont.lastPage)} of ${cont.pageCount}` : ""}
            </span>
          </span>
          <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-accent text-accent-fg shadow-md transition group-hover:scale-110">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </Link>
      )}

      <div className="mt-10 space-y-12">
        {home.subjects.length === 0 ? (
          <Empty>No books on your shelves yet. Check back once your teacher has added some.</Empty>
        ) : (
          home.subjects
            .filter((s) => s.lessons.length > 0)
            .map((s, i) => (
              <Bookshelf key={s.id} title={s.name} meta={s.learntCount === s.lessonCount ? "All read!" : `${s.lessons.filter((l) => l.finished || l.learnt).length} of ${s.lessonCount} finished`} books={s.lessons} hrefFor={(b) => `/student/lessons/${b.id}`} tintOffset={i * 3} />
            ))
        )}
        {home.subjects.length > 0 && home.subjects.every((s) => s.lessons.length === 0) && <Empty>No books on your shelves yet. Check back once your teacher has added some.</Empty>}
      </div>

      <StickerShelf streak={shelf.streak} stickers={shelf.stickers} next={shelf.next} />

      {grades && grades.subjects.some((s) => s.rating) && (
        <section className="mt-8 rounded-[22px] border border-ink-200/80 bg-white px-5 py-4 shadow-card" aria-label="My stars">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-[22px] font-extrabold text-ink-950">My stars</h2>
            <p className="text-sm font-semibold text-ink-500">
              Overall <span className="text-ink-900">{grades.overall}%</span>
              {grades.rank ? ` · rank ${grades.rank} of ${grades.gradedStudents}` : ""}
            </p>
          </div>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {grades.subjects.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 rounded-xl bg-paper px-3.5 py-2.5 text-sm">
                <span className="truncate font-bold text-ink-900">{s.name}</span>
                <span className="shrink-0 font-semibold text-ink-600" aria-label={`${s.name}: ${s.label}`}>
                  <span className="text-[#f7b733]" aria-hidden>
                    {s.rating ? "★".repeat(s.rating) + "☆".repeat(5 - s.rating) : "☆☆☆☆☆"}
                  </span>{" "}
                  {s.label}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
