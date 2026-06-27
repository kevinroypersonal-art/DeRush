import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { ProjectsDashboard } from "@/components/ProjectsDashboard";
import { OnboardingGate } from "@/components/OnboardingGate";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function DashboardPage() {
  return (
    <div className="mx-auto min-h-screen max-w-4xl px-6 py-8">
      <header className="mb-10 flex items-center justify-between">
        <Link href="/" className="text-sm font-semibold tracking-wide">
          DeRush
        </Link>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      <div className="mb-8">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A project is one video: upload its transcript and your Derush Stack
          produces a Premiere edit.
        </p>
      </div>

      <OnboardingGate>
        <ProjectsDashboard />
      </OnboardingGate>
    </div>
  );
}
