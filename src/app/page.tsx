import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { CallToAction } from "@/components/CallToAction";
import { ThemeToggle } from "@/components/ThemeToggle";

const STEPS = [
  {
    step: "01",
    title: "Drop in your raw footage",
    body: "Upload the transcripts of your rushes — interviews, vlogs, B-roll narration, podcast tape. DeRush reads every word so you don't have to scrub the timeline.",
  },
  {
    step: "02",
    title: "It learns your style",
    body: "Feed it a few of your finished edits. DeRush studies how you cut — your pacing, your hooks, the moments you keep and the ones you drop — and turns that into editing memory.",
  },
  {
    step: "03",
    title: "Get a pre-edited timeline",
    body: "In seconds, DeRush drafts a first-cut timeline in your storytelling logic, ready to drop straight into your NLE. You start from a draft, not a blank canvas.",
  },
  {
    step: "04",
    title: "Refine and improve, video after video",
    body: "Tweak the cut, export, and let DeRush re-ingest your final edit. Every project sharpens the quality data behind your assistant, so the next draft lands even closer.",
  },
];

const FEATURES = [
  {
    title: "Hours of work in seconds",
    body: "Skip the first, soul-crushing pass through hours of raw tape. DeRush surfaces the story beats instantly and assembles a draft while you grab a coffee.",
  },
  {
    title: "Trained on your edits, not a template",
    body: "This isn't a generic auto-editor. DeRush mirrors how you cut, so the draft sounds like you — not like everyone else's AI.",
  },
  {
    title: "Transcript-first selection",
    body: "Because it works from what's actually said, DeRush finds the best takes, trims the rambles, and removes dead air without you watching every second.",
  },
  {
    title: "A clean NLE round-trip",
    body: "Export a timeline that drops cleanly into your editor. Keep full creative control — DeRush hands you a head start, never a locked cut.",
  },
  {
    title: "Gets better with quality data",
    body: "Every finished edit you feed back teaches the assistant. Your results compound: the more you cut, the smarter your drafts become.",
  },
  {
    title: "Built for creators who ship",
    body: "Vloggers, podcasters, course makers, agencies — anyone drowning in footage and deadlines. DeRush turns volume into output.",
  },
];

export default async function Home() {
  // Identified, not-logged-off users skip the landing page entirely. The
  // dashboard's gate then sends them on to their projects (if they have a
  // Derush Stack) or to onboarding stack-creation (if they don't).
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  return (
    <div className="relative min-h-screen">
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>

      <main className="flex min-h-screen flex-col">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,var(--accent),transparent_70%)] opacity-60"
          />
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-8 px-6 pb-20 pt-28 text-center sm:pt-36">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
              DeRush · AI video-editing assistant
            </p>
            <h1 className="text-balance text-4xl font-semibold leading-tight sm:text-6xl">
              Swallow hours of editing in just a few seconds.
            </h1>
            <p className="max-w-2xl text-balance text-lg text-muted-foreground sm:text-xl">
              DeRush is the AI-powered assistant that drafts your video edit for
              you. It learns how you cut, turns raw transcripts into a pre-edited
              timeline, and gets sharper with every video you finish.
            </p>
            <CallToAction primaryLabel="Get started" />
            <p className="text-sm text-muted-foreground">
              Improve your results video after video — powered by your own
              quality data.
            </p>
          </div>
        </section>

        {/* Problem → Promise */}
        <section className="border-t border-border bg-card/40">
          <div className="mx-auto max-w-4xl px-6 py-20">
            <div className="grid gap-10 sm:grid-cols-2">
              <div className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                  The grind today
                </h2>
                <p className="text-2xl font-medium leading-snug text-muted-foreground">
                  You shoot for an hour and edit for ten. The hardest part isn't
                  the cut — it's the endless first pass: scrubbing tape, hunting
                  for the good takes, killing the dead air.
                </p>
              </div>
              <div className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                  With DeRush
                </h2>
                <p className="text-2xl font-medium leading-snug text-foreground">
                  You open your editor and the draft is already there —
                  assembled in your style, in seconds. You spend your time on
                  craft, not on grunt work.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto w-full max-w-5xl px-6 py-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold sm:text-4xl">
              How DeRush works
            </h2>
            <p className="mt-4 text-balance text-lg text-muted-foreground">
              Four steps from raw footage to a draft that already sounds like
              you.
            </p>
          </div>
          <div className="mt-14 grid gap-6 sm:grid-cols-2">
            {STEPS.map((s) => (
              <div
                key={s.step}
                className="rounded-2xl border border-border bg-card p-7 transition hover:border-ring"
              >
                <span className="text-sm font-semibold text-muted-foreground">
                  {s.step}
                </span>
                <h3 className="mt-3 text-xl font-semibold">{s.title}</h3>
                <p className="mt-2 text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="border-t border-border bg-card/40">
          <div className="mx-auto w-full max-w-5xl px-6 py-24">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-semibold sm:text-4xl">
                Why creators reach for DeRush
              </h2>
              <p className="mt-4 text-balance text-lg text-muted-foreground">
                Everything you need to go from a pile of rushes to a publishable
                cut — faster, and more like you, every single time.
              </p>
            </div>
            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <div
                  key={f.title}
                  className="rounded-2xl border border-border bg-card p-7"
                >
                  <h3 className="text-lg font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {f.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* The learning loop */}
        <section className="mx-auto w-full max-w-4xl px-6 py-24">
          <div className="rounded-3xl border border-border bg-gradient-to-b from-card to-background p-10 text-center sm:p-14">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              The compounding advantage
            </h2>
            <p className="mt-5 text-balance text-2xl font-medium leading-snug sm:text-3xl">
              Most tools stay the same on day 100. DeRush doesn&apos;t. Every
              finished edit you feed back becomes quality data — so your drafts
              get closer to final, video after video.
            </p>
            <p className="mt-6 text-balance text-lg text-muted-foreground">
              The assistant you train today is the editing partner you keep for
              every project tomorrow.
            </p>
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-t border-border">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-7 px-6 py-24 text-center">
            <h2 className="text-balance text-3xl font-semibold sm:text-5xl">
              Stop scrubbing. Start shipping.
            </h2>
            <p className="max-w-xl text-balance text-lg text-muted-foreground">
              Hand the first pass to your AI editing assistant and reclaim hours
              on every video. Your next draft is a few seconds away.
            </p>
            <CallToAction primaryLabel="Get started" />
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-border">
          <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
            <span className="font-semibold tracking-wide text-foreground">
              DeRush
            </span>
            <span>Your rushes, pre-edited in your style.</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
