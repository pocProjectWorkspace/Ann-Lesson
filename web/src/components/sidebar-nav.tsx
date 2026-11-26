"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

export type NavItem = { href: string; label: string; exact?: boolean };

export function SidebarNav({ items, variant }: { items: NavItem[]; variant: "side" | "top" }) {
  const pathname = usePathname();
  const isActive = (n: NavItem) => (n.exact || n.href.split("/").length <= 2 ? pathname === n.href : pathname.startsWith(n.href));

  if (variant === "top") {
    return (
      <nav aria-label="Main" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-2">
        {items.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={isActive(n) ? "page" : undefined}
            className={cx(
              "shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition",
              isActive(n) ? "bg-accent text-accent-fg" : "text-ink-200 hover:bg-white/10 hover:text-white",
            )}
          >
            {n.label}
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {items.map((n) => {
        const active = isActive(n);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "relative flex items-center rounded-xl px-3.5 py-2.5 text-[15px] font-bold transition",
              active ? "bg-white/12 text-white" : "text-ink-300 hover:bg-white/6 hover:text-white",
            )}
          >
            {active && <span aria-hidden className="absolute -left-3 top-1/2 h-7 w-1.5 -translate-y-1/2 rounded-r-full bg-accent shadow-[0_0_0_3px_rgba(255,255,255,0.08)]" />}
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
