"use client";

import { SignIn, SignUp } from "@clerk/nextjs";
import { useTheme } from "./ThemeProvider";

/**
 * Clerk's prebuilt card, restyled to match the Arcade-style layout: full-width
 * social buttons ("Continue with …"), an OR divider, a single email field, and a
 * dark `Continue` button. The `appearance` recomputes on theme change so the
 * card tracks our light/dark toggle.
 */
export function AuthCard({ mode }: { mode: "sign-in" | "sign-up" }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const appearance = {
    variables: {
      colorPrimary: isDark ? "#ffffff" : "#0a0a0b",
      colorText: isDark ? "#ededed" : "#0a0a0b",
      colorTextSecondary: isDark ? "#a3a3a3" : "#737373",
      colorBackground: "transparent",
      colorInputBackground: isDark ? "#171717" : "#f5f5f5",
      colorInputText: isDark ? "#ededed" : "#0a0a0b",
      borderRadius: "0.75rem",
      fontFamily: "inherit",
    },
    elements: {
      rootBox: "w-full",
      cardBox: "w-full shadow-none",
      card: "w-full bg-transparent shadow-none p-0 gap-5",
      header: "hidden",
      socialButtonsBlockButton:
        "h-12 justify-start gap-3 rounded-xl border border-black/10 bg-white px-4 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10",
      socialButtonsBlockButtonText: "font-medium",
      dividerRow: "my-1",
      dividerLine: "bg-black/10 dark:bg-white/15",
      dividerText:
        "text-xs uppercase tracking-widest text-neutral-400 dark:text-neutral-500",
      formFieldLabel: "text-neutral-600 dark:text-neutral-400",
      formFieldInput:
        "h-12 rounded-xl border-none bg-neutral-100 px-4 text-sm dark:bg-white/5",
      formButtonPrimary:
        "h-12 rounded-xl bg-neutral-900 text-sm font-medium normal-case text-white shadow-none transition hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200",
      footer:
        "bg-transparent text-neutral-500 dark:text-neutral-400 [&_a]:text-neutral-900 dark:[&_a]:text-white",
      footerActionLink: "text-neutral-900 dark:text-white",
      identityPreviewEditButton: "text-neutral-900 dark:text-white",
    },
  };

  return mode === "sign-in" ? (
    <SignIn
      appearance={appearance}
      signUpUrl="/sign-up"
      forceRedirectUrl="/dashboard"
    />
  ) : (
    <SignUp
      appearance={appearance}
      signInUrl="/sign-in"
      forceRedirectUrl="/dashboard"
    />
  );
}
