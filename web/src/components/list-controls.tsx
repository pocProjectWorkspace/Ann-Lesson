import Link from "next/link";
import { Input } from "./ui";

export const PAGE_SIZE = 50;

/** Parse ?q= and ?page= from a page's searchParams. */
export function listParams(sp: Record<string, string | undefined>, pageSize = PAGE_SIZE) {
  const q = (sp.q ?? "").trim().slice(0, 100);
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  return { q, page, skip: (page - 1) * pageSize, take: pageSize };
}

function withParams(base: string, params: Record<string, string | number | undefined>) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "" && v !== 0) u.set(k, String(v));
  const s = u.toString();
  return s ? `${base}?${s}` : base;
}

export function SearchBox({ action, q, placeholder, hidden }: { action: string; q: string; placeholder: string; hidden?: Record<string, string | undefined> }) {
  return (
    <form method="get" action={action} className="flex items-center gap-2" role="search">
      {hidden && Object.entries(hidden).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <Input name="q" defaultValue={q} placeholder={placeholder} className="w-56" aria-label={placeholder} />
      <button className="rounded-lg border border-ink-200 bg-white px-3 py-2.5 text-sm font-semibold hover:bg-ink-100">Search</button>
      {q && (
        <Link href={withParams(action, hidden ?? {})} className="text-sm font-semibold text-ink-500 hover:text-ink-900">
          Clear
        </Link>
      )}
    </form>
  );
}

export function Pagination({ base, page, total, pageSize = PAGE_SIZE, params }: { base: string; page: number; total: number; pageSize?: number; params?: Record<string, string | undefined> }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const link = (p: number) => withParams(base, { ...(params ?? {}), page: p === 1 ? undefined : p });
  return (
    <nav aria-label="Pages" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-ink-600">
      <span>
        Showing {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        {page > 1 ? (
          <Link href={link(page - 1)} className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 font-semibold hover:bg-ink-100">
            Previous
          </Link>
        ) : (
          <span className="rounded-lg border border-ink-100 px-3 py-1.5 text-ink-300">Previous</span>
        )}
        <span className="px-2 tabular-nums">
          Page {page} of {pages}
        </span>
        {page < pages ? (
          <Link href={link(page + 1)} className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 font-semibold hover:bg-ink-100">
            Next
          </Link>
        ) : (
          <span className="rounded-lg border border-ink-100 px-3 py-1.5 text-ink-300">Next</span>
        )}
      </div>
    </nav>
  );
}
