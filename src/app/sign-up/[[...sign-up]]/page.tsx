import { AuthShell } from "@/components/AuthShell";
import { AuthCard } from "@/components/AuthCard";

export default function SignUpPage() {
  return (
    <AuthShell
      title="Bring your rushes to life in minutes"
      subtitle="Create your DeRush account to get started."
    >
      <AuthCard mode="sign-up" />
    </AuthShell>
  );
}
