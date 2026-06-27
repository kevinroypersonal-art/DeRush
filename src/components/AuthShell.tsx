"use client";

import Link from "next/link";
import { type ReactNode } from "react";
import { ThemeToggle } from "./ThemeToggle";

const HIGHLIGHTS = [
  "No credit card required",
  "Draft a first cut in minutes — no manual logging",
  "Learns your style from your finished edits",
];

function Logo() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2 text-lg font-semibold tracking-tight text-neutral-900 dark:text-white"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-900 text-sm font-bold text-white dark:bg-white dark:text-neutral-900">
        D
      </span>
      DeRush
    </Link>
  );
}

/**
 * Arcade-style split auth screen: a centered form column on the left and a
 * marketing panel on the right. The `children` slot holds the Clerk card.
 */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <main className="relative grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>

      {/* Left: form column */}
      <div className="flex flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center">
            <Logo />
            <h1 className="mt-8 text-balance text-2xl font-semibold text-neutral-900 dark:text-white sm:text-3xl">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-2 text-balance text-sm text-neutral-500 dark:text-neutral-400">
                {subtitle}
              </p>
            ) : null}
          </div>

          {children}
        </div>
      </div>

      {/* Right: marketing panel */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-indigo-50 via-sky-50 to-white p-12 dark:from-indigo-950/40 dark:via-sky-950/30 dark:to-neutral-950 lg:flex lg:flex-col lg:justify-center">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-sky-200/40 blur-3xl dark:bg-sky-500/10"
        />
        <div className="relative max-w-md">
          <h2 className="text-2xl font-semibold text-neutral-900 dark:text-white">
            Join editors turning raw rushes into a first cut — try it free.
          </h2>
          <ul className="mt-8 space-y-4">
            {HIGHLIGHTS.map((item) => (
              <li
                key={item}
                className="flex items-start gap-3 text-sm text-neutral-700 dark:text-neutral-300"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mt-0.5 shrink-0 text-indigo-600 dark:text-indigo-400"
                  aria-hidden="true"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </main>
  );
}
