"use client";

import { ReactNode } from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth } from "@clerk/nextjs";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

// Instantiated once at module scope so React fast-refresh doesn't recreate it.
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!convex) {
    // Surfaces a clear message instead of a cryptic runtime crash when the
    // deployment URL hasn't been configured yet (see .env.example).
    return (
      <div className="mx-auto max-w-xl p-8 text-sm text-neutral-400">
        <p className="mb-2 font-semibold text-neutral-200">
          Convex is not configured.
        </p>
        <p>
          Set <code className="text-neutral-300">NEXT_PUBLIC_CONVEX_URL</code> in
          your <code className="text-neutral-300">.env.local</code> (run{" "}
          <code className="text-neutral-300">npx convex dev</code> to create a
          deployment).
        </p>
      </div>
    );
  }

  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
}
