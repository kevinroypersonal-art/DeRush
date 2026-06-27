"use client";

import { useState } from "react";
import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

const primaryBtn =
  "rounded-md bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryBtn =
  "rounded-md border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:border-neutral-500 disabled:opacity-50";
const card = "rounded-lg border border-neutral-800 bg-neutral-900/40 p-4";

function fmt(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ProjectDetail({ projectId: raw }: { projectId: string }) {
  const projectId = raw as Id<"projects">;
  const project = useQuery(api.projects.get, { projectId });
  const segments = useQuery(api.projects.getProjectSegments, { projectId });
  const editPlan = useQuery(api.projects.getEditPlan, { projectId });
  const xmlUrl = useQuery(api.projects.getXmlDownloadUrl, { projectId });

  const generateSrtUploadUrl = useMutation(api.projects.generateSrtUploadUrl);
  const recordSrtUpload = useMutation(api.projects.recordSrtUpload);
  const parseSrtFile = useAction(api.projectsNode.parseSrtFile);
  const generateEdit = useAction(api.projectsNode.generateEdit);

  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (project === undefined) {
    return <p className="text-sm text-neutral-500">Loading…</p>;
  }

  const status = project.status ?? "draft";

  async function handleUpload() {
    if (!file || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const url = await generateSrtUploadUrl();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type || "text/plain" },
        body: file,
      });
      const { storageId } = await res.json();
      await recordSrtUpload({ projectId, storageId, filename: file.name });
      await parseSrtFile({ projectId });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerate() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      await generateEdit({ projectId });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  const segById = new Map((segments ?? []).map((s) => [s._id, s]));

  return (
    <div>
      <Link
        href="/dashboard"
        className="text-xs text-neutral-500 hover:text-neutral-300"
      >
        ← Projects
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{project.name}</h1>
      <p className="mb-6 mt-1 text-sm text-neutral-400">
        One video → one Premiere edit. Upload the transcript, then let your
        Derush Stack cut it.
      </p>

      {err && <p className="mb-4 text-sm text-red-400">{err}</p>}

      {/* Upload step */}
      {status === "draft" && (
        <div className={card + " space-y-3"}>
          <h2 className="text-sm font-semibold">Upload transcript</h2>
          <p className="text-xs text-neutral-500">
            An SRT or VTT subtitle file of the raw footage.
          </p>
          <input
            type="file"
            accept=".srt,.vtt,text/plain"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-neutral-300 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-800 file:px-3 file:py-1.5 file:text-sm file:text-neutral-200"
          />
          <button
            onClick={handleUpload}
            disabled={!file || busy}
            className={primaryBtn}
          >
            {busy ? "Uploading…" : "Upload & parse"}
          </button>
        </div>
      )}

      {(status === "uploaded" ||
        status === "parsing" ||
        status === "generating") && (
        <div className={card}>
          <p className="text-sm text-neutral-300">
            {status === "generating"
              ? "Your Derush Stack is cutting the edit… this can take a moment."
              : "Parsing the transcript…"}
          </p>
        </div>
      )}

      {/* Parsed: segment viewer + generate */}
      {status === "parsed" && (
        <div className="space-y-4">
          <div className={card}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                Transcript · {segments?.length ?? 0} segments
              </h2>
              <button
                onClick={handleGenerate}
                disabled={busy}
                className={primaryBtn}
              >
                {busy ? "Generating…" : "Generate edit"}
              </button>
            </div>
            <ul className="max-h-96 space-y-1 overflow-y-auto text-sm">
              {(segments ?? []).map((s) => (
                <li key={s._id} className="flex gap-3">
                  <span className="shrink-0 font-mono text-xs text-neutral-600">
                    {fmt(s.startMs)}
                  </span>
                  <span className="text-neutral-300">{s.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Ready: kept segments + download */}
      {status === "ready" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              Edit · {editPlan?.selections.length ?? 0} clips kept
            </h2>
            <div className="flex gap-2">
              <button
                onClick={handleGenerate}
                disabled={busy}
                className={secondaryBtn}
              >
                {busy ? "…" : "Regenerate"}
              </button>
              <button
                onClick={() => xmlUrl && window.open(xmlUrl, "_blank")}
                disabled={!xmlUrl}
                className={primaryBtn}
              >
                Download Premiere XML
              </button>
            </div>
          </div>
          <p className="text-xs text-neutral-600">
            Premiere XMEML — import it, then relink the media to your source clip.
          </p>
          <ul className="space-y-2">
            {(editPlan?.selections ?? [])
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((sel, i) => {
                const seg = segById.get(sel.segmentId);
                return (
                  <li key={i} className={card}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm text-neutral-200">
                        {seg?.text ?? "(segment)"}
                      </span>
                      <span className="shrink-0 font-mono text-xs text-neutral-600">
                        {seg ? fmt(seg.startMs) : ""}
                      </span>
                    </div>
                    {sel.rationale && (
                      <p className="mt-1 text-xs text-neutral-500">
                        {sel.rationale}
                      </p>
                    )}
                  </li>
                );
              })}
          </ul>
        </div>
      )}

      {status === "error" && (
        <div className={card + " space-y-3"}>
          <p className="text-sm text-red-400">
            {project.xmlError ?? "Something went wrong."}
          </p>
          <button
            onClick={project.rushId ? handleGenerate : handleUpload}
            disabled={busy}
            className={secondaryBtn}
          >
            {busy ? "…" : "Try again"}
          </button>
        </div>
      )}
    </div>
  );
}
