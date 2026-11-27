import Link from "next/link";
import { notFound } from "next/navigation";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { renderMarkdown } from "@/lib/markdown";

const DOCS: Record<string, { file: string; title: string }> = {
  terms: { file: "terms.md", title: "Terms of service" },
  privacy: { file: "privacy.md", title: "Privacy notice" },
  dpa: { file: "dpa.md", title: "Data processing agreement" },
  security: { file: "security.md", title: "Security summary" },
};

export function generateStaticParams() {
  return Object.keys(DOCS).map((slug) => ({ slug }));
}

/** Public legal pages, rendered from web/content/legal/*.md (the same files a lawyer reviews). */
export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = DOCS[slug];
  if (!doc) notFound();
  let md: string;
  try {
    md = await readFile(path.join(process.cwd(), "content", "legal", doc.file), "utf8");
  } catch {
    notFound();
  }
  const html = renderMarkdown(md);
  return (
    <div className="min-h-screen bg-paper text-ink-900">
      <header className="border-b border-ink-200/70 bg-white/70">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-3">
          <Link href="/login" className="font-display text-lg font-bold text-ink-950">
            Lesson Plan
          </Link>
          <nav aria-label="Legal" className="flex gap-3 text-sm font-semibold text-ink-600">
            {Object.entries(DOCS).map(([s, d]) => (
              <Link key={s} href={`/legal/${s}`} aria-current={s === slug ? "page" : undefined} className={s === slug ? "text-ink-950 underline underline-offset-4" : "hover:text-ink-950"}>
                {d.title}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-10">
        <article className="legal rounded-[var(--radius-card)] border border-ink-200/80 bg-white px-6 py-8 shadow-card sm:px-10" dangerouslySetInnerHTML={{ __html: html }} />
        <p className="mt-6 text-center text-xs text-ink-500">
          Questions about these documents: ask your school office, which holds the agreement with the platform operator.
        </p>
      </main>
    </div>
  );
}
