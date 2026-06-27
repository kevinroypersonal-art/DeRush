import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { ProjectsDashboard } from "@/components/ProjectsDashboard";
import { OnboardingGate } from "@/components/OnboardingGate";

export default function DashboardPage() {
  return (
    <div className="mx-auto min-h-screen max-w-4xl px-6 py-8">
      <header className="mb-10 flex items-center justify-between">
        <Link href="/" className="text-sm font-semibold tracking-wide">
          DeRush
        </Link>
        <UserButton afterSignOutUrl="/" />
      </header>

      <div className="mb-8">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <p className="mt-1 text-sm text-neutral-400">
          A project is a workspace for a channel or client. Each one carries its
          own style brief and editing memory.
        </p>
      </div>

      <OnboardingGate>
        <ProjectsDashboard />
      </OnboardingGate>
    </div>
  );
}
