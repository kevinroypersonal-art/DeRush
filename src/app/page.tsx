import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { SignInButton, SignUpButton } from "@clerk/nextjs";

export default async function Home() {
  // Identified, not-logged-off users skip the landing page entirely. The
  // dashboard's gate then sends them on to their projects (if they have a
  // Derush Stack) or to onboarding stack-creation (if they don't).
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-10 px-6 text-center">
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">
          DeRush
        </p>
        <h1 className="text-balance text-4xl font-semibold sm:text-5xl">
          Your rushes, pre-edited in your style.
        </h1>
        <p className="text-balance text-lg text-neutral-400">
          DeRush learns how you cut from your finished edits, then drafts a
          first-cut timeline from raw transcripts — ready to drop into your NLE.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <SignUpButton mode="modal" forceRedirectUrl="/dashboard">
          <button className="rounded-md bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-neutral-200">
            Get started
          </button>
        </SignUpButton>
        <SignInButton mode="modal" forceRedirectUrl="/dashboard">
          <button className="rounded-md border border-neutral-700 px-5 py-2.5 text-sm font-medium text-neutral-200 transition hover:border-neutral-500">
            Sign in
          </button>
        </SignInButton>
      </div>
    </main>
  );
}
