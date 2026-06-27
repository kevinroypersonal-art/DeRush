import Link from "next/link";

type CallToActionProps = {
  /** Label for the primary sign-up button. */
  primaryLabel?: string;
  /** When true, render the secondary "Sign in" link alongside the primary CTA. */
  showSignIn?: boolean;
  /** Center the buttons horizontally (defaults to true). */
  centered?: boolean;
};

/**
 * Shared call-to-action for the landing page. Signed-in visitors are redirected
 * to the dashboard before they ever reach this, so the landing only needs the
 * sign-up / sign-in entry points, which route to the dedicated auth pages.
 */
export function CallToAction({
  primaryLabel = "Start editing with AI",
  showSignIn = true,
  centered = true,
}: CallToActionProps) {
  return (
    <div
      className={`flex flex-wrap items-center gap-3 ${
        centered ? "justify-center" : "justify-start"
      }`}
    >
      <Link
        href="/sign-up"
        className="rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:bg-primary/90"
      >
        {primaryLabel}
      </Link>
      {showSignIn && (
        <Link
          href="/sign-in"
          className="rounded-md border border-input px-6 py-3 text-sm font-medium text-foreground transition hover:border-ring"
        >
          Sign in
        </Link>
      )}
    </div>
  );
}
