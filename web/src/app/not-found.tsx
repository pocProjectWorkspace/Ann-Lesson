import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-semibold text-ink-500">404</p>
      <h1 className="mt-2 font-display text-3xl text-ink-950">This page does not exist</h1>
      <p className="mt-3 text-[15px] text-ink-500">It may have been moved or removed, or you may not have access to it.</p>
      <Link href="/" className="mt-6 rounded-lg bg-ink-900 px-4 py-2 text-sm font-semibold text-white hover:bg-ink-800">
        Go home
      </Link>
    </main>
  );
}
