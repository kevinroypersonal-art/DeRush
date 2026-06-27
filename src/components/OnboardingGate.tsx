"use client";

import { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { Authenticated, AuthLoading } from "convex/react";
import { api } from "../../convex/_generated/api";

// Redirects users who haven't finished onboarding to /onboarding. Wraps the
// dashboard so the agents are set up before the user reaches their projects.
function Gate({ children }: { children: ReactNode }) {
  const state = useQuery(api.onboarding.getState);
  const router = useRouter();

  const completed = state?.profile?.status === "completed";

  useEffect(() => {
    // state === undefined while the query loads; only redirect once we know.
    if (state !== undefined && !completed) {
      router.replace("/onboarding");
    }
  }, [state, completed, router]);

  if (state === undefined) {
    return <p className="text-sm text-neutral-500">Loading…</p>;
  }
  if (!completed) {
    return <p className="text-sm text-neutral-500">Redirecting…</p>;
  }
  return <>{children}</>;
}

export function OnboardingGate({ children }: { children: ReactNode }) {
  return (
    <>
      <AuthLoading>
        <p className="text-sm text-neutral-500">Connecting…</p>
      </AuthLoading>
      <Authenticated>
        <Gate>{children}</Gate>
      </Authenticated>
    </>
  );
}
