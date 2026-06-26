# DeRush

An AI video-editing assistant that ingests transcripts of raw footage, learns
an editor's storytelling logic, and outputs a pre-edited timeline ready to drop
into a video editor.

This repository currently implements **M0 — Skeleton**: a Next.js (App Router)
app wired to **Clerk** (auth) and **Convex** (reactive backend), with an
auth-gated dashboard and **project CRUD**. See [`PRD`](#) for the full roadmap.

## Stack

- **Next.js 15** (App Router, React 19, TypeScript)
- **Clerk** — authentication
- **Convex** — database + reactive backend
- **Tailwind CSS v4**

## What's here (M0)

- Auth-gated `/dashboard` (Clerk middleware protects `/dashboard/*`).
- Landing page with sign-in / sign-up and a "go to dashboard" link.
- Project CRUD: create, list, and delete projects scoped to the signed-in user.
- Convex schema for the full domain model (projects, rushes, segments,
  reference edits, editing memories, edit plans) — only `projects` is exercised
  in M0; later milestones fill in the rest.

## Project layout

```
convex/
  schema.ts          # full data model (PRD §4.2)
  auth.config.ts     # Clerk JWT validation for Convex
  projects.ts        # project CRUD (owner-scoped queries/mutations)
  _generated/        # Convex codegen (committed)
src/
  middleware.ts      # Clerk route protection
  app/
    layout.tsx       # ClerkProvider + Convex client provider
    page.tsx         # landing
    dashboard/       # auth-gated dashboard
    sign-in/, sign-up/
  components/
    ConvexClientProvider.tsx
    ProjectsDashboard.tsx
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure Convex

This project is linked to the Convex cloud deployment **little-bison-51**.

```bash
npx convex dev      # logs in (browser), syncs schema/functions, writes .env.local
```

### 3. Configure Clerk

This project links to Clerk application `app_3Fg4SPYDxB6RVBV8fkIYhv2k1TV`.

Using the Clerk CLI (recommended — writes your keys into `.env.local`):

```bash
npm install -g clerk
clerk auth login
clerk init --app app_3Fg4SPYDxB6RVBV8fkIYhv2k1TV
```

Or set the keys manually in `.env.local` (see `.env.example`):

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `CLERK_JWT_ISSUER_DOMAIN`

### 4. Wire Clerk ↔ Convex

1. In the Clerk dashboard, create a **JWT template named `convex`**
   (Configure → JWT Templates → New → Convex).
2. Set the issuer domain in the Convex deployment so it can validate tokens:

   ```bash
   npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-app>.clerk.accounts.dev
   ```

### 5. Run

```bash
npx convex dev      # terminal 1 — backend
npm run dev         # terminal 2 — frontend at http://localhost:3000
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run convex:dev` | Convex dev (sync + codegen) |
| `npm run convex:codegen` | Regenerate `convex/_generated` |

## Roadmap

- **M1** — SRT upload → parse → segment viewer.
- **M2** — Reference-edit ingestion → Editing Memory v1.
- **M3** — "Makable videos" analysis + Edit Plan generation.
- **M4** — Conversational refinement.
- **M5** — FCPXML export with a clean NLE round-trip.
- **M6** — Learn loop (re-ingest final cut → memory v2).
