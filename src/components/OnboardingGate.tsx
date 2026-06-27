"use client";

import { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { Authenticated, AuthLoading } from "convex/react";
import { api } from "../../convex/_generated/api";

// Sends users without a finished Derush Stack to /onboarding. Wraps the
// dashboard so the stack exists before the user reaches their projects.
function Gate({ children }: { children: ReactNode }) {
  const state = useQuery(api.onboarding.getState);
  const router = useRouter();

  // Ready = onboarding completed AND a Derush Stack exists. No stack → onboarding.
  const ready = !!state?.stack && state?.profile?.status === "completed";

  useEffect(() => {
    // state === undefined while the query loads; only redirect once we know.
    if (state !== undefined && !ready) {
      router.replace("/onboarding");
    }
  }, [state, ready, router]);

  if (state === undefined) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (!ready) {
    return <p className="text-sm text-muted-foreground">Redirecting…</p>;
  }
  return <>{children}</>;
}

export function OnboardingGate({ children }: { children: ReactNode }) {
  return (
    <>
      <AuthLoading>
        <p className="text-sm text-muted-foreground">Connecting…</p>
      </AuthLoading>
      <Authenticated>
        <Gate>{children}</Gate>
      </Authenticated>
    </>
  );
}
