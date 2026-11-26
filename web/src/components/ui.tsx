import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "danger" | "ghost";

const buttonStyles: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:brightness-110 disabled:opacity-50 shadow-sm",
  secondary: "bg-white text-ink-800 border border-ink-200 hover:border-ink-300 hover:bg-ink-100/60",
  danger: "bg-white text-rose-600 border border-rose-100 hover:bg-rose-100/60",
  ghost: "text-ink-700 hover:bg-ink-100",
};

const buttonBase = "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition disabled:cursor-not-allowed";

export function Button({ className, variant = "primary", ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={cx(buttonBase, buttonStyles[variant], className)} {...props} />;
}

export function LinkButton({ className, variant = "secondary", ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cx(buttonBase, buttonStyles[variant], className)} {...props} />;
}

const inputBase =
  "block w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-[15px] text-ink-900 placeholder:text-ink-400 transition focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx(inputBase, className)} {...props} />;
}
export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cx(inputBase, "pr-8", className)} {...props} />;
}
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(inputBase, "leading-relaxed", className)} {...props} />;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-ink-700">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs leading-relaxed text-ink-500">{hint}</span>}
    </label>
  );
}

export function Card({
  title,
  children,
  actions,
  className,
  padded = true,
  description,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={cx("rounded-[var(--radius-card)] border border-ink-200/80 bg-white shadow-card", className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
          <div>
            {title && <h2 className="text-[19px] text-ink-950">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-ink-500">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className={cx(padded ? "px-5 pb-5" : "", title || actions ? "" : padded ? "pt-5" : "")}>{children}</div>
    </section>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  crumbs,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  crumbs?: Array<{ href?: string; label: string }>;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {crumbs && crumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-1.5 text-[13px] text-ink-500">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-ink-300">/</span>}
                {c.href ? (
                  <Link href={c.href} className="hover:text-ink-900">
                    {c.label}
                  </Link>
                ) : (
                  <span className="text-ink-700">{c.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <h1 className="text-[30px] leading-tight text-ink-950 sm:text-[34px]">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-[15px] text-ink-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Table({ head, children, caption }: { head: string[]; children: ReactNode; caption?: string }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5" tabIndex={0}>
      <table className="min-w-full text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-ink-200 text-left text-[13px] font-semibold text-ink-500">
            {head.map((h, i) => (
              <th key={i} scope="col" className="px-3 py-2.5 first:pl-0 last:pr-0">
                {h || <span className="sr-only">Actions</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cx("px-3 py-3 align-middle text-ink-800 first:pl-0 last:pr-0", className)}>{children}</td>;
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-ink-300 bg-paper/60 px-6 py-8 text-center">
      <EmptyShelf />
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-500">{children}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "green" | "red" | "amber" | "indigo" | "accent" }) {
  const tones = {
    slate: "bg-ink-100 text-ink-700",
    green: "bg-leaf-100 text-leaf-600",
    red: "bg-rose-100 text-rose-600",
    amber: "bg-marigold-100 text-marigold-600",
    indigo: "bg-sky-100 text-sky-600",
    accent: "bg-accent-soft text-accent",
  }[tone];
  return <span className={cx("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold", tones)}>{children}</span>;
}

export function Alert({ kind, children }: { kind: "error" | "success"; children: ReactNode }) {
  const styles = kind === "error" ? "border-rose-100 bg-rose-100/60 text-rose-600" : "border-leaf-100 bg-leaf-100/70 text-leaf-600";
  return (
    <div role={kind === "error" ? "alert" : "status"} className={cx("rounded-lg border px-3.5 py-2.5 text-sm font-medium", styles)}>
      {children}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-ink-200/80 bg-white px-5 py-4 shadow-card">
      <div className="text-sm text-ink-500">{label}</div>
      <div className="mt-1 font-display text-3xl text-ink-950">{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-400">{hint}</div>}
    </div>
  );
}

export function ProgressBar({ value, className, label }: { value: number; className?: string; label?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={cx("h-2 w-full overflow-hidden rounded-full bg-ink-100", className)} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label} aria-valuetext={`${pct} percent`}>
      <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Numbered circle used in lesson lists. */
export function Numeral({ n, done }: { n: number; done?: boolean }) {
  return (
    <span
      className={cx(
        "grid h-9 w-9 shrink-0 place-items-center rounded-full font-display text-[15px] font-semibold",
        done ? "bg-accent text-accent-fg" : "bg-ink-100 text-ink-700",
      )}
    >
      {done ? "✓" : n}
    </span>
  );
}

/** Coloured spine used on subject cards, cycling through a fixed bookshelf palette. */
export const spineColors = ["#2360c8", "#0f766e", "#9c5d0b", "#4f46e5", "#b4323f", "#1f7a4d", "#7c3aed", "#0369a1"];
export const spineColor = (i: number) => spineColors[i % spineColors.length];

/** A small empty shelf, drawn inline, for empty states: an invitation rather than a grey box. */
function EmptyShelf() {
  return (
    <svg aria-hidden width="120" height="56" viewBox="0 0 120 56" className="mx-auto block">
      <rect x="18" y="20" width="14" height="24" rx="2" fill="var(--color-ink-200)" />
      <rect x="36" y="14" width="12" height="30" rx="2" fill="var(--accent-soft)" />
      <rect x="52" y="24" width="16" height="20" rx="2" fill="var(--color-ink-200)" transform="rotate(-8 60 44)" />
      <rect x="8" y="44" width="104" height="6" rx="2" fill="#b07a45" />
      <rect x="8" y="50" width="104" height="3" rx="1" fill="#8a5a2e" />
    </svg>
  );
}
