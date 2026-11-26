import Link from "next/link";
import type { ReactNode } from "react";
import type { Session } from "@/lib/auth";
import { logout } from "@/app/login/actions";
import { unreadCount } from "@/lib/notify";
import { SidebarNav, type NavItem } from "./sidebar-nav";

const roleLabels = {
  SUPER_ADMIN: "Platform owner",
  SCHOOL_ADMIN: "School admin",
  TEACHER: "Teacher",
  STUDENT: "Student",
  PARENT: "Parent",
} as const;

function Mark() {
  return (
    <span aria-hidden className="relative grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent text-accent-fg shadow-sm">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z" />
        <path d="M4 19a2.5 2.5 0 0 1 2.5-2.5H20" />
        <path d="M9 8h7M9 11.5h5" />
      </svg>
    </span>
  );
}

function Bell({ count, className }: { count: number; className?: string }) {
  return (
    <Link href="/notifications" aria-label={count ? `${count} unread notifications` : "Notifications"} className={`relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-300 hover:bg-white/10 hover:text-white ${className ?? ""}`}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {count > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-accent px-1 text-center text-[11px] font-bold leading-[18px] text-accent-fg">{count > 99 ? "99+" : count}</span>}
    </Link>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export async function AppShell({ session, nav, schoolName, children }: { session: Session; nav: NavItem[]; schoolName?: string | null; children: ReactNode }) {
  const brand = schoolName ?? "Lesson Plan";
  const unread = await unreadCount(session.userId);
  return (
    <div data-role={session.role} className="min-h-screen bg-paper text-ink-900 lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-ink-900 focus:shadow-lift">
        Skip to content
      </a>
      <aside aria-label="Sidebar" className="hidden w-64 shrink-0 flex-col bg-ink-950 text-white lg:flex lg:sticky lg:top-0 lg:h-screen">
        <div className="flex items-center gap-3 px-5 pt-6 pb-5">
          <Mark />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="line-clamp-2 font-display text-[17px] font-semibold leading-snug">{brand}</div>
            <div className="text-xs text-ink-300">{roleLabels[session.role]}</div>
          </div>
          <Bell count={unread} />
        </div>
        <div className="px-3">
          <SidebarNav items={nav} variant="side" />
        </div>
        <div className="mt-auto border-t border-white/10 px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-sm font-bold">{initials(session.name)}</span>
            <div className="min-w-0 flex-1 leading-tight">
              <Link href="/account" className="block truncate text-sm font-semibold hover:underline">
                {session.name}
              </Link>
              <form action={logout}>
                <button className="text-xs text-ink-300 hover:text-white">Sign out</button>
              </form>
            </div>
          </div>
        </div>
      </aside>

      <header className="bg-ink-950 px-4 pt-3 text-white lg:hidden">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Mark />
            <div className="min-w-0 leading-tight">
              <div className="truncate font-display text-[16px] font-semibold">{brand}</div>
              <Link href="/account" className="block text-xs text-ink-300 hover:text-white">
                {session.name} · {roleLabels[session.role]}
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Bell count={unread} />
            <form action={logout}>
              <button className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold text-ink-200 hover:bg-white/10">Sign out</button>
            </form>
          </div>
        </div>
        <SidebarNav items={nav} variant="top" />
      </header>

      <main id="main" className="min-w-0 flex-1" tabIndex={-1}>
        <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</div>
      </main>
    </div>
  );
}
