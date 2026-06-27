import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { OnboardingGate } from "@/components/OnboardingGate";
import { ProjectDetail } from "@/components/ProjectDetail";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <div className="mx-auto min-h-screen max-w-3xl px-6 py-8">
      <header className="mb-8 flex items-center justify-between">
        <Link href="/dashboard" className="text-sm font-semibold tracking-wide">
          DeRush
        </Link>
        <UserButton afterSignOutUrl="/" />
      </header>
      <OnboardingGate>
        <ProjectDetail projectId={projectId} />
      </OnboardingGate>
    </div>
  );
}
