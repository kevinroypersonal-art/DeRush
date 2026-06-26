"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Authenticated, AuthLoading } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

function NewProjectForm() {
  const createProject = useMutation(api.projects.create);
  const [name, setName] = useState("");
  const [style, setStyle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await createProject({ name, style });
      setName("");
      setStyle("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
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
          Project name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. My YouTube channel"
          className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-neutral-500"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-400">
          Style brief{" "}
          <span className="text-neutral-600">(how you like to edit)</span>
        </label>
        <textarea
          value={style}
          onChange={(e) => setStyle(e.target.value)}
          rows={3}
          placeholder="Punchy talking-head edits. Open on a hook, cut filler words, keep tight pacing with a little breathing room."
          className="w-full resize-y rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-neutral-500"
        />
      </div>
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
  style,
  createdAt,
}: {
  id: Id<"projects">;
  name: string;
  style: string;
  createdAt: number;
}) {
  const removeProject = useMutation(api.projects.remove);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
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
    <li className="flex items-start justify-between gap-4 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="min-w-0">
        <h3 className="truncate font-medium">{name}</h3>
        {style ? (
          <p className="mt-1 line-clamp-2 text-sm text-neutral-400">{style}</p>
        ) : (
          <p className="mt-1 text-sm italic text-neutral-600">
            No style brief yet
          </p>
        )}
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
          style={p.style}
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
