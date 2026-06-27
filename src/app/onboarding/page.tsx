import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { OnboardingWizard } from "@/components/OnboardingWizard";

export default function OnboardingPage() {
  return (
    <div className="mx-auto min-h-screen max-w-3xl px-6 py-8">
      <header className="mb-10 flex items-center justify-between">
        <Link href="/" className="text-sm font-semibold tracking-wide">
          DeRush
        </Link>
        <UserButton afterSignOutUrl="/" />
      </header>
      <OnboardingWizard />
    </div>
  );
}
