"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { Authenticated, AuthLoading } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

const STATUS_LABEL: Record<string, string> = {
  draft: "No transcript yet",
  uploaded: "Transcript uploaded",
  parsing: "Parsing…",
  parsed: "Ready to edit",
  generating: "Generating edit…",
  ready: "Edit ready",
  error: "Error",
};

function StatusBadge({ status }: { status?: string }) {
  const s = status ?? "draft";
  const tone =
    s === "ready"
      ? "border-primary/50 text-primary"
      : s === "error"
        ? "border-destructive/60 text-destructive"
        : "border-input text-muted-foreground";
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] ${tone}`}
    >
      {STATUS_LABEL[s] ?? s}
    </span>
  );
}

function NewProjectForm() {
  const createProject = useMutation(api.projects.create);
  const stack = useQuery(api.projects.getDefaultStack);
  const router = useRouter();
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const id = await createProject({ name });
      router.push(`/dashboard/projects/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-8 space-y-3 rounded-lg border border-border bg-card p-4"
    >
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          New project{" "}
          <span className="text-muted-foreground">(one video)</span>
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Episode 12 — woodworking bench"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Derush Stack:{" "}
        <span className="text-muted-foreground">
          {stack === undefined
            ? "…"
            : (stack?.name ?? "set up at onboarding")}
        </span>
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button
        type="submit"
        disabled={submitting || !name.trim()}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? "Creating…" : "Create project"}
      </button>
    </form>
  );
}

function ProjectCard({
  id,
  name,
  status,
  createdAt,
}: {
  id: Id<"projects">;
  name: string;
  status?: string;
  createdAt: number;
}) {
  const removeProject = useMutation(api.projects.remove);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (deleting) return;
    if (!confirm(`Delete project "${name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await removeProject({ projectId: id });
    } catch {
      setDeleting(false);
    }
  }

  return (
    <li>
      <Link
        href={`/dashboard/projects/${id}`}
        className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card p-4 transition hover:border-ring"
      >
        <div className="min-w-0">
          <h3 className="truncate font-medium">{name}</h3>
          <div className="mt-2">
            <StatusBadge status={status} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Created {new Date(createdAt).toLocaleDateString()}
          </p>
        </div>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="shrink-0 rounded-md border border-input px-3 py-1.5 text-xs text-foreground transition hover:border-destructive hover:text-destructive disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Delete"}
        </button>
      </Link>
    </li>
  );
}

function ProjectList() {
  const projects = useQuery(api.projects.list);

  if (projects === undefined) {
    return <p className="text-sm text-muted-foreground">Loading projects…</p>;
  }
  if (projects.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No projects yet. Create one above to get started.
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {projects.map((p) => (
        <ProjectCard
          key={p._id}
          id={p._id}
          name={p.name}
          status={p.status}
          createdAt={p.createdAt}
        />
      ))}
    </ul>
  );
}

export function ProjectsDashboard() {
  return (
    <>
      <AuthLoading>
        <p className="text-sm text-muted-foreground">Connecting…</p>
      </AuthLoading>
      <Authenticated>
        <NewProjectForm />
        <ProjectList />
      </Authenticated>
    </>
  );
}
