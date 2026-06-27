import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { ThemeToggle } from "@/components/ThemeToggle";

export default async function Home() {
  // Identified, not-logged-off users skip the landing page entirely. The
  // dashboard's gate then sends them on to their projects (if they have a
  // Derush Stack) or to onboarding stack-creation (if they don't).
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  return (
    <div className="relative min-h-screen">
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>

      <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-10 px-6 text-center">
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            DeRush
          </p>
          <h1 className="text-balance text-4xl font-semibold sm:text-5xl">
            Your rushes, pre-edited in your style.
          </h1>
          <p className="text-balance text-lg text-muted-foreground">
            DeRush learns how you cut from your finished edits, then drafts a
            first-cut timeline from raw transcripts — ready to drop into your NLE.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/sign-up"
            className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            Get started
          </Link>
          <Link
            href="/sign-in"
            className="rounded-md border border-input px-5 py-2.5 text-sm font-medium text-foreground transition hover:border-ring"
          >
            Sign in
          </Link>
        </div>
      </main>
    </div>
  );
}
