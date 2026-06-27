import Link from "next/link";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function Home() {
  return (
    <div className="relative min-h-screen">
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>

      <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-10 px-6 text-center">
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-400 dark:text-neutral-500">
            DeRush
          </p>
          <h1 className="text-balance text-4xl font-semibold text-neutral-900 dark:text-white sm:text-5xl">
            Your rushes, pre-edited in your style.
          </h1>
          <p className="text-balance text-lg text-neutral-600 dark:text-neutral-400">
            DeRush learns how you cut from your finished edits, then drafts a
            first-cut timeline from raw transcripts — ready to drop into your NLE.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <SignedOut>
            <Link
              href="/sign-up"
              className="rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
            >
              Get started
            </Link>
            <Link
              href="/sign-in"
              className="rounded-md border border-neutral-300 px-5 py-2.5 text-sm font-medium text-neutral-800 transition hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-200 dark:hover:border-neutral-500"
            >
              Sign in
            </Link>
          </SignedOut>
          <SignedIn>
            <Link
              href="/dashboard"
              className="rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
            >
              Go to dashboard
            </Link>
          </SignedIn>
        </div>
      </main>
    </div>
  );
}
