import { AuthShell } from "@/components/AuthShell";
import { AuthCard } from "@/components/AuthCard";

export default function SignInPage() {
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your DeRush account."
    >
      <AuthCard mode="sign-in" />
    </AuthShell>
  );
}
