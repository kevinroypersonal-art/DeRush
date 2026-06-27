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
      ? "border-green-800 text-green-400"
      : s === "error"
        ? "border-red-800 text-red-400"
        : "border-neutral-700 text-neutral-400";
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
      className="mb-8 space-y-3 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4"
    >
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-400">
          New project{" "}
          <span className="text-neutral-600">(one video)</span>
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Episode 12 — woodworking bench"
          className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-neutral-500"
        />
      </div>
      <p className="text-xs text-neutral-600">
        Derush Stack:{" "}
        <span className="text-neutral-400">
          {stack === undefined
            ? "…"
            : (stack?.name ?? "set up at onboarding")}
        </span>
      </p>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={submitting || !name.trim()}
        className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
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
        className="flex items-start justify-between gap-4 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 transition hover:border-neutral-600"
      >
        <div className="min-w-0">
          <h3 className="truncate font-medium">{name}</h3>
          <div className="mt-2">
            <StatusBadge status={status} />
          </div>
          <p className="mt-2 text-xs text-neutral-600">
            Created {new Date(createdAt).toLocaleDateString()}
          </p>
        </div>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="shrink-0 rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 transition hover:border-red-700 hover:text-red-400 disabled:opacity-50"
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
    return <p className="text-sm text-neutral-500">Loading projects…</p>;
  }
  if (projects.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
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
        <p className="text-sm text-neutral-500">Connecting…</p>
      </AuthLoading>
      <Authenticated>
        <NewProjectForm />
        <ProjectList />
      </Authenticated>
    </>
  );
}
