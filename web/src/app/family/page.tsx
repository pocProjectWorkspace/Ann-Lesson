import Link from "next/link";
import { requireSchoolRole } from "@/lib/auth";
import { familyOverview } from "@/lib/family";
import { Empty } from "@/components/ui";
import { now } from "@/lib/time";

function greeting(d: Date) {
  const h = d.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** Parent home: each child's week at a glance and the book to read together tonight. */
export default async function FamilyHome() {
  const session = await requireSchoolRole("PARENT");
  const children = await familyOverview(session.userId);

  return (
    <>
      <p className="text-[15px] text-ink-500">Family</p>
      <h1 className="mt-1 text-[30px] leading-tight text-ink-950 sm:text-[36px]">
        {greeting(now())}, {session.name.split(" ")[0]}
      </h1>
      {children.length === 0 ? (
        <div className="mt-6">
          <Empty>Your school has not linked a child to your account yet. Ask the school office to add you from the Families page.</Empty>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {children.map((c) => (
            <section key={c.id} className="rounded-[var(--radius-card)] border border-ink-200/80 bg-white shadow-card" aria-label={c.name}>
              <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink-100 px-5 py-4">
                <div>
                  <h2 className="font-display text-2xl text-ink-950">{c.name}</h2>
                  <p className="text-sm text-ink-500">
                    {c.className ?? "No class yet"}
                    {c.teachers.length ? ` · ${c.teachers.length === 1 ? "Teacher" : "Teachers"}: ${c.teachers.join(", ")}` : ""}
                  </p>
                </div>
                <p className="text-sm">
                  {c.streak.current > 0 ? (
                    <span className="rounded-full bg-orange-50 px-3 py-1 font-semibold text-orange-900">
                      🔥 {c.streak.current} day{c.streak.current === 1 ? "" : "s"} in a row{c.streak.readToday ? "" : " · not read today yet"}
                    </span>
                  ) : (
                    <span className="text-ink-500">No streak this week. One page tonight starts one.</span>
                  )}
                </p>
              </header>

              <div className="grid gap-5 px-5 py-4 lg:grid-cols-[1.2fr_1fr]">
                <div className="space-y-4">
                  {c.tonight ? (
                    <Link href={`/family/books/${c.tonight.lessonId}?child=${c.id}${c.tonight.fileId ? `&file=${c.tonight.fileId}` : ""}`} className="flex items-center gap-4 rounded-[var(--radius-card)] border border-accent/30 bg-accent-soft/60 px-5 py-4 transition hover:border-accent/60">
                      <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-accent-fg text-xl">📖</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-accent">{c.tonight.again ? "Read again together tonight" : "Read together tonight"}</span>
                        <span className="block truncate font-display text-lg text-ink-950">{c.tonight.title}</span>
                        <span className="block text-sm text-ink-500">
                          {c.tonight.subjectName}
                          {c.tonight.again ? ` · ${c.firstName} has finished every book; favourites are worth a second read` : c.tonight.started && c.tonight.pageCount ? ` · ${c.firstName} is on page ${Math.max(1, c.tonight.lastPage)} of ${c.tonight.pageCount}` : " · not started yet"}
                          {c.tonight.readToMe ? " · the teacher can read it aloud" : ""}
                        </span>
                      </span>
                    </Link>
                  ) : (
                    <p className="text-sm text-ink-500">No books published for {c.firstName}&apos;s class yet.</p>
                  )}
                  <dl className="grid grid-cols-3 gap-3 text-center">
                    <Stat label="Days read this week" value={c.week.days} />
                    <Stat label="Pages this week" value={c.week.pages} />
                    <Stat label="Books finished" value={`${c.books.finished} / ${c.books.total}`} />
                  </dl>
                </div>

                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-ink-900">Stickers {c.stickerCount ? <span className="font-normal text-ink-500">· {c.stickerCount}</span> : null}</h3>
                    {c.stickers.length === 0 ? (
                      <p className="mt-1 text-sm text-ink-500">None yet. The first one comes with the first finished book.</p>
                    ) : (
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {c.stickers.map((s) => (
                          <li key={s.id} className="flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 py-1 pr-3 pl-1.5 text-sm" title={s.note ?? s.label}>
                            <span className="grid h-7 w-7 place-items-center rounded-full bg-white" aria-hidden>
                              {s.emoji}
                            </span>
                            <span className="leading-tight">
                              <span className="block font-semibold text-ink-900">{s.label}</span>
                              {(s.note || s.givenBy) && <span className="block text-xs text-ink-500">{s.note ?? `from ${s.givenBy}`}</span>}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {c.grades && c.grades.subjects.some((s) => s.rating) && (
                    <div>
                      <h3 className="text-sm font-semibold text-ink-900">
                        Teacher&apos;s stars{c.grades.rank ? <span className="font-normal text-ink-500"> · rank {c.grades.rank} of {c.grades.classSize}</span> : null}
                      </h3>
                      <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                        {c.grades.subjects.map((s) => (
                          <li key={s.id} className="flex items-center justify-between gap-3 rounded-lg bg-paper/70 px-3 py-2 text-sm">
                            <span className="truncate font-semibold text-ink-900">{s.name}</span>
                            <span className="shrink-0 text-ink-600" aria-label={`${s.name}: ${s.label}`}>
                              <span className="text-accent" aria-hidden>
                                {s.rating ? "★".repeat(s.rating) + "☆".repeat(5 - s.rating) : "☆☆☆☆☆"}
                              </span>{" "}
                              {s.label}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg bg-paper/70 px-3 py-2.5">
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className="font-display text-xl text-ink-950">{value}</dd>
    </div>
  );
}
