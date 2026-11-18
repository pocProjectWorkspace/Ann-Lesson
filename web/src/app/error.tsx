"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Server components already log; this covers client-side render errors.
    fetch("/api/client-error", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: error.message, digest: error.digest, path: location.pathname }) }).catch(() => {});
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-semibold text-rose-600">Something went wrong</p>
      <h1 className="mt-2 font-display text-3xl text-ink-950">We could not load this page</h1>
      <p className="mt-3 text-[15px] text-ink-500">The problem has been recorded. Try again, or go back to your home page. {error.digest ? `Reference ${error.digest}.` : ""}</p>
      <div className="mt-6 flex gap-3">
        <button onClick={reset} className="rounded-lg bg-ink-900 px-4 py-2 text-sm font-semibold text-white hover:bg-ink-800">
          Try again
        </button>
        <Link href="/" className="rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm font-semibold text-ink-800 hover:bg-ink-100">
          Go home
        </Link>
      </div>
    </main>
  );
}
