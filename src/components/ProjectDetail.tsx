"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

const primaryBtn =
  "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryBtn =
  "rounded-md border border-input px-4 py-2 text-sm text-foreground transition hover:border-ring disabled:opacity-50";
const card = "rounded-lg border border-border bg-card p-4";

function fmt(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type Candidate = { segmentIndexes: number[]; rationale: string };

export function ProjectDetail({ projectId: raw }: { projectId: string }) {
  const projectId = raw as Id<"projects">;
  const project = useQuery(api.projects.get, { projectId });
  const segments = useQuery(api.projects.getProjectSegments, { projectId });
  const editPlan = useQuery(api.projects.getEditPlan, { projectId });
  const xmlUrl = useQuery(api.projects.getXmlDownloadUrl, { projectId });

  const generateSrtUploadUrl = useMutation(api.projects.generateSrtUploadUrl);
  const recordSrtUpload = useMutation(api.projects.recordSrtUpload);
  const setBrief = useMutation(api.projects.setBrief);
  const chooseOpening = useMutation(api.projects.chooseOpening);
  const chooseClosing = useMutation(api.projects.chooseClosing);
  const chooseVersion = useMutation(api.projects.chooseVersion);

  const parseSrtFile = useAction(api.projectsNode.parseSrtFile);
  const generateEdit = useAction(api.projectsNode.generateEdit);
  const startGuided = useAction(api.projectsNode.startGuided);
  const proposeClosings = useAction(api.projectsNode.proposeClosings);
  const proposeVersions = useAction(api.projectsNode.proposeVersions);
  const refineEdit = useAction(api.projectsNode.refineEdit);
  const finalizeEdit = useAction(api.projectsNode.finalizeEdit);

  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [brief, setBriefLocal] = useState("");
  const [instruction, setInstruction] = useState("");

  // Sync the brief field from the loaded project once.
  useEffect(() => {
    if (project && typeof project.brief === "string") setBriefLocal(project.brief);
  }, [project?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (project === undefined) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  const status = project.status ?? "draft";

  async function run(fn: () => Promise<unknown>, fallback: string) {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload() {
    if (!file) return;
    await run(async () => {
      const url = await generateSrtUploadUrl();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type || "text/plain" },
        body: file,
      });
      const { storageId } = await res.json();
      await recordSrtUpload({ projectId, storageId, filename: file.name });
      await parseSrtFile({ projectId });
    }, "Upload failed");
  }

  const saveBrief = async () => {
    if (project && brief.trim() !== (project.brief ?? "").trim()) {
      await setBrief({ projectId, brief });
    }
  };

  const handleStartGuided = () =>
    run(async () => {
      await saveBrief();
      await startGuided({ projectId });
    }, "Could not start");
  const handleQuickDraft = () =>
    run(async () => {
      await saveBrief();
      await generateEdit({ projectId });
    }, "Generation failed");
  const handleChooseOpening = (idx: number) =>
    run(async () => {
      await chooseOpening({ projectId, idx });
      await proposeClosings({ projectId });
    }, "Could not continue");
  const handleChooseClosing = (idx: number) =>
    run(async () => {
      await chooseClosing({ projectId, idx });
      await proposeVersions({ projectId });
    }, "Could not continue");
  const handleChooseVersion = (idx: number) =>
    run(() => chooseVersion({ projectId, idx }), "Could not continue");
  // Re-run the proposal for the current phase (recovers from a transient
  // failure without discarding the opening/ending already chosen).
  const handleResumeClosings = () =>
    run(() => proposeClosings({ projectId }), "Could not continue");
  const handleResumeVersions = () =>
    run(() => proposeVersions({ projectId }), "Could not continue");
  const handleRefine = () =>
    run(async () => {
      await refineEdit({ projectId, instruction });
      setInstruction("");
    }, "Refine failed");
  const handleFinalize = () =>
    run(() => finalizeEdit({ projectId }), "Export failed");

  const segById = new Map((segments ?? []).map((s) => [s._id, s]));
  const segByIndex = new Map((segments ?? []).map((s) => [s.index, s]));
  const candText = (c: Candidate) =>
    c.segmentIndexes
      .map((ix) => segByIndex.get(ix)?.text)
      .filter(Boolean)
      .join(" ");
  const candDurMs = (c: Candidate) =>
    c.segmentIndexes.reduce((m, ix) => {
      const s = segByIndex.get(ix);
      return m + (s ? s.endMs - s.startMs : 0);
    }, 0);

  const phase = editPlan?.phase;
  const candidates = (editPlan?.candidates ?? []) as Candidate[];

  function CandidateList({
    label,
    onPick,
    onRetry,
    showFull,
  }: {
    label: string;
    onPick: (idx: number) => void;
    onRetry: () => void;
    showFull?: boolean;
  }) {
    // Segments load independently of the plan; wait for them so options never
    // render as empty/zero-duration.
    if (segments === undefined || (candidates.length === 0 && busy)) {
      return <p className="text-sm text-muted-foreground">Thinking… {label}</p>;
    }
    if (candidates.length === 0) {
      return (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            No options came back.
          </p>
          <button onClick={onRetry} disabled={busy} className={secondaryBtn}>
            Retry
          </button>
        </div>
      );
    }
    return (
      <ul className="space-y-2">
        {candidates.map((c, i) => (
          <li key={i}>
            <button
              onClick={() => onPick(i)}
              disabled={busy}
              className="block w-full rounded-lg border border-border bg-card p-4 text-left transition hover:border-ring disabled:opacity-50"
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">
                  Option {i + 1}
                  {showFull
                    ? ` · ${c.segmentIndexes.length} clips · ~${fmt(candDurMs(c))}`
                    : ` · ~${fmt(candDurMs(c))}`}
                </span>
              </div>
              <p className="line-clamp-3 text-sm text-foreground">
                {candText(c) || "(empty)"}
              </p>
              {c.rationale && (
                <p className="mt-1 text-xs text-muted-foreground">{c.rationale}</p>
              )}
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div>
      <Link
        href="/dashboard"
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        ← Projects
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{project.name}</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">
        One video → one Premiere edit. Upload the transcript, then your Derush
        Stack guides the cut step by step.
      </p>

      {err && <p className="mb-4 text-sm text-destructive">{err}</p>}

      {/* Upload step */}
      {status === "draft" && (
        <div className={card + " space-y-3"}>
          <h2 className="text-sm font-semibold">Upload transcript</h2>
          <p className="text-xs text-muted-foreground">
            A transcript of the raw footage — SRT, VTT, TXT, CSV or JSON. Any
            format works as long as text is linked to timecodes.
          </p>
          <input
            type="file"
            accept=".srt,.vtt,.txt,.csv,.tsv,.json,text/plain,text/csv,application/json"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:text-foreground"
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
          <p className="text-sm text-foreground">
            {status === "generating"
              ? "Your Derush Stack is cutting the edit… this can take a moment."
              : "Parsing the transcript…"}
          </p>
        </div>
      )}

      {/* Parsed: brief + segment viewer + start */}
      {status === "parsed" && (
        <div className="space-y-4">
          <div className={card + " space-y-2"}>
            <h2 className="text-sm font-semibold">Brief for this video</h2>
            <p className="text-xs text-muted-foreground">
              Optional — a note about THIS edit (e.g. &ldquo;focus on the
              workshop-fire story&rdquo;). Your editing style stays in your
              Derush Stack.
            </p>
            <textarea
              value={brief}
              onChange={(e) => setBriefLocal(e.target.value)}
              onBlur={() => saveBrief().catch(() => {})}
              rows={2}
              placeholder="Anything specific about this video?"
              className="w-full rounded-md border border-input bg-background p-2 text-sm text-foreground"
            />
          </div>

          <div className={card}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">
                Transcript · {segments?.length ?? 0} segments
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={handleQuickDraft}
                  disabled={busy}
                  className={secondaryBtn}
                >
                  {busy ? "…" : "Quick draft"}
                </button>
                <button
                  onClick={handleStartGuided}
                  disabled={busy}
                  className={primaryBtn}
                >
                  {busy ? "Starting…" : "Start guided edit"}
                </button>
              </div>
            </div>
            <ul className="max-h-96 space-y-1 overflow-y-auto text-sm">
              {(segments ?? []).map((s) => (
                <li key={s._id} className="flex gap-3">
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {fmt(s.startMs)}
                  </span>
                  <span className="text-foreground">{s.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Guided flow */}
      {status === "planning" && (
        <div className="space-y-4">
          {phase === "opening" && (
            <div className={card + " space-y-3"}>
              <h2 className="text-sm font-semibold">1 · Choose your opening</h2>
              <p className="text-xs text-muted-foreground">
                The first beats that earn attention, drawn from your transcript.
              </p>
              <CandidateList
                label="proposing openings…"
                onPick={handleChooseOpening}
                onRetry={handleStartGuided}
              />
            </div>
          )}

          {phase === "closing" && (
            <div className={card + " space-y-3"}>
              <h2 className="text-sm font-semibold">2 · Choose your ending</h2>
              <p className="text-xs text-muted-foreground">
                A close that resolves what your opening sets up.
              </p>
              <CandidateList
                label="finding endings…"
                onPick={handleChooseClosing}
                onRetry={handleResumeClosings}
              />
            </div>
          )}

          {phase === "versions" && (
            <div className={card + " space-y-3"}>
              <h2 className="text-sm font-semibold">3 · Pick a version</h2>
              <p className="text-xs text-muted-foreground">
                Full edits with your opening and ending — different middles.
              </p>
              <CandidateList
                label="building versions…"
                onPick={handleChooseVersion}
                onRetry={handleResumeVersions}
                showFull
              />
            </div>
          )}

          {phase === "refining" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">
                  4 · Refine &amp; export ·{" "}
                  {editPlan?.selections.length ?? 0} clips
                </h2>
                <button
                  onClick={handleFinalize}
                  disabled={busy}
                  className={primaryBtn}
                >
                  {busy ? "…" : "Export Premiere XML"}
                </button>
              </div>
              <div className={card + " space-y-2"}>
                <p className="text-xs text-muted-foreground">
                  Ask for a change — select / reorder only, never reworded.
                </p>
                <textarea
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  rows={2}
                  placeholder="e.g. tighten the middle, move the punchline earlier"
                  className="w-full rounded-md border border-input bg-background p-2 text-sm text-foreground"
                />
                <button
                  onClick={handleRefine}
                  disabled={busy || !instruction.trim()}
                  className={secondaryBtn}
                >
                  {busy ? "Applying…" : "Apply change"}
                </button>
              </div>
              <ul className="space-y-2">
                {(editPlan?.selections ?? [])
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((sel, i) => {
                    const seg = segById.get(sel.segmentId);
                    return (
                      <li key={i} className={card}>
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-sm text-foreground">
                            {seg?.text ?? "(segment)"}
                          </span>
                          <span className="shrink-0 font-mono text-xs text-muted-foreground">
                            {seg ? fmt(seg.startMs) : ""}
                          </span>
                        </div>
                      </li>
                    );
                  })}
              </ul>
            </div>
          )}

          <button
            onClick={handleStartGuided}
            disabled={busy}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
          >
            Start over
          </button>
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
                onClick={handleStartGuided}
                disabled={busy}
                className={secondaryBtn}
              >
                {busy ? "…" : "Edit again"}
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
          <p className="text-xs text-muted-foreground">
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
                      <span className="text-sm text-foreground">
                        {seg?.text ?? "(segment)"}
                      </span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        {seg ? fmt(seg.startMs) : ""}
                      </span>
                    </div>
                    {sel.rationale && (
                      <p className="mt-1 text-xs text-muted-foreground">
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
          <p className="text-sm text-destructive">
            {project.xmlError ?? "Something went wrong."}
          </p>
          <button
            onClick={project.rushId ? handleStartGuided : handleUpload}
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
