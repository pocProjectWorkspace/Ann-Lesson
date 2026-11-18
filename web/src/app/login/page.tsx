import { redirect } from "next/navigation";
import { getSession, homeFor } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const session = await getSession();
  if (session) redirect(homeFor[session.role]);
  const { next = "", error } = await searchParams;

  return (
    <div className="grid min-h-screen bg-paper lg:grid-cols-[1.1fr_1fr]">
      {/* Left: the bookshelf */}
      <aside aria-label="About Lesson Plan" className="relative hidden overflow-hidden bg-ink-950 px-12 py-14 text-white lg:flex lg:flex-col">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-violet-600">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z" />
              <path d="M4 19a2.5 2.5 0 0 1 2.5-2.5H20" />
            </svg>
          </span>
          <span className="font-display text-xl font-semibold">Lesson Plan</span>
        </div>

        <div className="mt-auto max-w-md">
          <h1 className="font-display text-5xl leading-[1.08] text-white">
            Every lesson,
            <br />
            in order.
          </h1>
          <p className="mt-5 text-[17px] leading-relaxed text-ink-300">
            The school&apos;s syllabus as a bookshelf. Students open the right chapter, teachers see who has read it.
          </p>
        </div>

        {/* Books, drawn in CSS */}
        <div aria-hidden className="pointer-events-none absolute -right-6 bottom-0 flex items-end gap-2 opacity-90">
          {[
            ["#2360c8", 230, 42],
            ["#c77a12", 190, 34],
            ["#0f766e", 260, 48],
            ["#4f46e5", 210, 38],
            ["#b4323f", 175, 30],
            ["#1f7a4d", 245, 44],
          ].map(([c, h, w], i) => (
            <div key={i} className="rounded-t-md shadow-lift" style={{ background: c as string, height: h as number, width: w as number }}>
              <div className="mx-auto mt-4 h-[60%] w-[3px] rounded bg-white/25" />
            </div>
          ))}
        </div>
      </aside>

      {/* Right: the form */}
      <main className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-violet-600 text-white">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z" />
                <path d="M4 19a2.5 2.5 0 0 1 2.5-2.5H20" />
              </svg>
            </span>
            <span className="font-display text-xl font-semibold text-ink-950">Lesson Plan</span>
          </div>

          <h2 className="font-display text-[30px] text-ink-950">Sign in</h2>
          <p className="mt-1.5 text-[15px] text-ink-500">Use the school code and login your school gave you.</p>

          {error === "signed-out" && (
            <p className="mt-5 rounded-lg border border-ink-200 bg-ink-100/70 px-3.5 py-2.5 text-sm font-medium text-ink-700">Your session has ended. Sign in again to continue.</p>
          )}
          {error === "inactive" && (
            <p className="mt-5 rounded-lg border border-marigold-100 bg-marigold-100/70 px-3.5 py-2.5 text-sm font-medium text-marigold-600">
              Your account or school is inactive. Contact your administrator.
            </p>
          )}
          <div className="mt-6">
            <LoginForm next={next} />
          </div>
          <p className="mt-6 text-[13px] leading-relaxed text-ink-500">Platform owner? Leave the school code blank and sign in with your email.</p>
        </div>
      </main>
    </div>
  );
}
