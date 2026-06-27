"use node";

import Anthropic from "@anthropic-ai/sdk";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { parseSrt } from "./srt";
import { buildXmeml, XmemlClip } from "./xmeml";
import { Selection, clipFromSegment, selectionsFromIndexes } from "./editLogic";

const MODEL = "claude-opus-4-8";

// Cap how many cues we send to the model in one pass (v1; chunking is a later
// upgrade). Keeps the structured output under max_tokens.
const MAX_SEGMENTS = 400;

// How many options to propose at each guided step (the methodology's "3").
const CANDIDATE_COUNT = 3;

function client() {
  return new Anthropic();
}

function jsonFromResponse(resp: Anthropic.Message): unknown {
  const block = resp.content.find((b) => b.type === "text");
  const text = block && "text" in block ? block.text : "{}";
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Model did not return valid JSON");
  }
}

function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

async function requireUserId(ctx: {
  auth: { getUserIdentity: () => Promise<{ subject: string } | null> };
}) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  return identity.subject;
}

// ---- shared prompt assembly (genre-neutral) --------------------------------

// Universal editing craft that applies to EVERY creator, regardless of style.
// The integrity rules are guaranteed by architecture (the model only ever emits
// cue indices, never text) and stated here for clarity. Anything genre- or
// virality-specific deliberately lives NOT here but in the creator's Stack
// agents, so the same engine serves a viral editor and a documentary editor.
const UNIVERSAL_CRAFT =
  "=== EDITING INTEGRITY (never violate) ===\n" +
  "- You assemble a PAPER EDIT by SELECTING and REORDERING existing transcript " +
  "cues. You may drop cues, reorder them, and rely on connective words already " +
  "spoken in the transcript.\n" +
  "- You never reword, paraphrase, invent, translate or correct what was said. " +
  "You only ever reference cues by their numeric index, and every index you use " +
  "must appear in the transcript below.\n\n" +
  "=== UNIVERSAL CRAFT (shape, not style) ===\n" +
  "- Spine: the edit needs a strong OPENING that earns attention, a MIDDLE that " +
  "holds it, and an END that resolves. What counts as 'strong' or 'resolved' is " +
  "defined by the specialist briefs below — do not impose your own genre.\n" +
  "- Causality: prefer a chain where each kept cue motivates the next (this, " +
  "THEREFORE that / this, BUT that) over a flat 'and then… and then' list.\n" +
  "- Earns-its-place: drop any cue you would not miss. If removing it loses " +
  "nothing, cut it.\n";

function promptOfFrom(agents: Array<{ kind: string; systemPrompt: string }>) {
  return (kind: string) =>
    agents.find((a) => a.kind === kind)?.systemPrompt ?? "";
}

function stackBriefs(promptOf: (kind: string) => string): string {
  return (
    "=== DE-RUSH (what to keep vs cut) ===\n" +
    promptOf("derush") +
    "\n\n=== STORYTELLING (order, structure, what makes an opening/ending strong) ===\n" +
    promptOf("storytelling") +
    "\n\n=== EDITING STYLE (tightening) ===\n" +
    promptOf("editing_style")
  );
}

function briefBlock(brief?: string | null): string {
  const b = (brief ?? "").trim();
  return b ? `\n\n=== THIS VIDEO (optional brief) ===\n${b}\n` : "";
}

type Segment = {
  _id: Id<"segments">;
  index: number;
  startMs: number;
  endMs: number;
  text: string;
};

function renderTranscript(segments: Segment[]): {
  body: string;
  truncated: boolean;
} {
  const slice = segments.slice(0, MAX_SEGMENTS);
  return {
    body: slice
      .map((s) => `#${s.index} [${s.startMs}-${s.endMs}ms] ${s.text}`)
      .join("\n"),
    truncated: segments.length > MAX_SEGMENTS,
  };
}

function transcriptUser(segments: Segment[]): string {
  const { body, truncated } = renderTranscript(segments);
  return (
    `Transcript (${segments.length} cues${
      truncated ? `, showing first ${MAX_SEGMENTS}` : ""
    }):\n\n` + body
  );
}

function renderCues(indexes: number[], byIndex: Map<number, Segment>): string {
  return indexes
    .map((ix) => {
      const s = byIndex.get(ix);
      return s ? `#${ix} ${s.text}` : `#${ix}`;
    })
    .join("\n");
}

// ---- structured-output schemas ---------------------------------------------

// One-shot "Quick draft": indices + per-cue trims + rationale.
const EDIT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["selections"],
  properties: {
    selections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "segmentIndex",
          "order",
          "trimStartMs",
          "trimEndMs",
          "rationale",
        ],
        properties: {
          segmentIndex: { type: "integer" },
          order: { type: "integer" },
          trimStartMs: { type: "integer" },
          trimEndMs: { type: "integer" },
          rationale: { type: "string" },
        },
      },
    },
  },
};

// Guided steps: a set of candidate index-lists, each with a one-line rationale.
const CANDIDATES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["candidates"],
  properties: {
    candidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["segmentIndexes", "rationale"],
        properties: {
          segmentIndexes: { type: "array", items: { type: "integer" } },
          rationale: { type: "string" },
        },
      },
    },
  },
};

// Refine: a single new ordered index-list.
const REFINE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["segmentIndexes"],
  properties: {
    segmentIndexes: { type: "array", items: { type: "integer" } },
  },
};

// ---- index-only validation (the integrity invariant in code) ---------------

type Candidate = { segmentIndexes: number[]; rationale: string };

// Keep only indices that exist in the transcript, de-duplicated, preserving
// order; drop empty candidates; cap to CANDIDATE_COUNT.
function cleanCandidates(
  raw: Candidate[],
  byIndex: Map<number, Segment>
): Candidate[] {
  const out: Candidate[] = [];
  for (const c of raw ?? []) {
    const seen = new Set<number>();
    const idxs: number[] = [];
    for (const ix of c.segmentIndexes ?? []) {
      if (byIndex.has(ix) && !seen.has(ix)) {
        seen.add(ix);
        idxs.push(ix);
      }
    }
    if (idxs.length) out.push({ segmentIndexes: idxs, rationale: c.rationale ?? "" });
  }
  return out.slice(0, CANDIDATE_COUNT);
}

// A full version must open with the chosen opening and close with the chosen
// closing, with a de-duplicated middle drawn from the rest.
function normalizeVersion(
  c: Candidate,
  opening: number[],
  closing: number[],
  byIndex: Map<number, Segment>
): Candidate {
  const openSet = new Set(opening);
  const closeSet = new Set(closing);
  const seen = new Set<number>();
  const middle: number[] = [];
  for (const ix of c.segmentIndexes ?? []) {
    if (byIndex.has(ix) && !openSet.has(ix) && !closeSet.has(ix) && !seen.has(ix)) {
      seen.add(ix);
      middle.push(ix);
    }
  }
  const full = [
    ...opening.filter((ix) => byIndex.has(ix)),
    ...middle,
    ...closing.filter((ix) => byIndex.has(ix)),
  ];
  return { segmentIndexes: full, rationale: c.rationale ?? "" };
}

function buildXmlString(
  project: { name: string; srtFilename?: string; fps?: number },
  segments: Segment[],
  clips: XmemlClip[]
): string {
  const sourceDurationMs = segments.reduce((m, s) => Math.max(m, s.endMs), 0);
  return buildXmeml({
    name: project.name,
    srtFilename: project.srtFilename ?? "transcript",
    fps: project.fps ?? 25,
    sourceDurationMs,
    clips,
  });
}

async function llmCandidates(system: string, user: string): Promise<Candidate[]> {
  const resp = await client().messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { format: { type: "json_schema", schema: CANDIDATES_SCHEMA } },
    system,
    messages: [{ role: "user", content: user }],
  });
  const parsed = jsonFromResponse(resp) as { candidates?: Candidate[] };
  return parsed.candidates ?? [];
}

// ===========================================================================
// Parse an uploaded SRT/VTT into segments (deterministic; no LLM).
// ===========================================================================
export const parseSrtFile = action({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }): Promise<void> => {
    const ownerId = await requireUserId(ctx);
    const project = await ctx.runQuery(internal.projects._getOwnedProject, {
      projectId,
      ownerId,
    });
    if (!project.srtStorageId) throw new Error("No transcript uploaded");

    await ctx.runMutation(internal.projects._setProjectStatus, {
      projectId,
      status: "parsing",
    });
    try {
      const blob = await ctx.storage.get(project.srtStorageId);
      if (!blob) throw new Error("Uploaded transcript not found");
      const cues = parseSrt(await blob.text());
      if (cues.length === 0) {
        throw new Error("No subtitles found in the file.");
      }
      const durationMs = cues.reduce((m, c) => Math.max(m, c.endMs), 0);
      await ctx.runMutation(internal.projects._writeRushAndSegments, {
        projectId,
        filename: project.srtFilename ?? "transcript.srt",
        durationMs,
        cues,
      });
    } catch (err) {
      await ctx.runMutation(internal.projects._setProjectStatus, {
        projectId,
        status: "error",
        xmlError: errMsg(err, "Failed to parse"),
      });
      throw err;
    }
  },
});

// ===========================================================================
// QUICK DRAFT — one-shot fast path (no human-in-the-loop). The guided flow is
// the primary experience; this stays for users in a hurry and as a fallback.
// ===========================================================================
export const generateEdit = action({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }): Promise<void> => {
    const ownerId = await requireUserId(ctx);
    const { project, agents, segments } = await ctx.runQuery(
      internal.projects._loadProjectForEdit,
      { projectId, ownerId }
    );
    if (segments.length === 0) {
      throw new Error("Upload and parse a transcript first");
    }
    if (agents.length === 0) {
      throw new Error("No Derush Stack found — finish onboarding first");
    }

    await ctx.runMutation(internal.projects._setProjectStatus, {
      projectId,
      status: "generating",
    });

    try {
      const promptOf = promptOfFrom(agents);
      const system =
        UNIVERSAL_CRAFT +
        "\n" +
        stackBriefs(promptOf) +
        briefBlock(project.brief) +
        "\n\n=== TASK ===\nFrom the numbered transcript, choose which cues to " +
        "KEEP, in what ORDER (0-based), with optional head/tail trims in " +
        "milliseconds. Only use segmentIndex values that appear in the " +
        "transcript. Keep each rationale under 12 words.";

      const resp = await client().messages.create({
        model: MODEL,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        output_config: { format: { type: "json_schema", schema: EDIT_SCHEMA } },
        system,
        messages: [{ role: "user", content: transcriptUser(segments) }],
      });

      const parsed = jsonFromResponse(resp) as {
        selections: Array<{
          segmentIndex: number;
          order: number;
          trimStartMs: number;
          trimEndMs: number;
          rationale: string;
        }>;
      };

      const byIndex = new Map(segments.map((s) => [s.index, s]));
      const kept = (parsed.selections ?? [])
        .filter((s) => byIndex.has(s.segmentIndex))
        .sort((a, b) => a.order - b.order);

      const selections: Selection[] = [];
      const clips: XmemlClip[] = [];
      kept.forEach((s, i) => {
        const seg = byIndex.get(s.segmentIndex)!;
        const { clip, trimStartMs, trimEndMs } = clipFromSegment(
          seg,
          s.trimStartMs,
          s.trimEndMs
        );
        selections.push({
          segmentId: seg._id,
          order: i,
          trimStartMs,
          trimEndMs,
          rationale: s.rationale ?? "",
        });
        clips.push(clip);
      });

      if (selections.length === 0) {
        throw new Error("The agents did not keep any segments. Try regenerating.");
      }

      const xml = buildXmlString(project, segments, clips);
      const xmlStorageId = await ctx.storage.store(
        new Blob([xml], { type: "application/xml" })
      );

      await ctx.runMutation(internal.projects._writeEditPlanAndXml, {
        projectId,
        intent: (project.brief ?? "").trim() || project.name,
        selections,
        xmlStorageId,
      });
    } catch (err) {
      await ctx.runMutation(internal.projects._setProjectStatus, {
        projectId,
        status: "error",
        xmlError: errMsg(err, "Generation failed"),
      });
      throw err;
    }
  },
});

// ===========================================================================
// GUIDED FLOW — the primary path. opening → closing → versions → refine → export.
// Each propose step returns index-only candidates validated against the
// transcript; the creator's Stack defines what "good" means at each step.
// ===========================================================================

// Reset any prior plan and propose the first set of OPENINGS.
export const startGuided = action({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }): Promise<void> => {
    const ownerId = await requireUserId(ctx);
    const { project, agents, segments } = await ctx.runQuery(
      internal.projects._loadProjectForEdit,
      { projectId, ownerId }
    );
    if (segments.length === 0) {
      throw new Error("Upload and parse a transcript first");
    }
    if (agents.length === 0) {
      throw new Error("No Derush Stack found — finish onboarding first");
    }

    await ctx.runMutation(internal.projects._resetGuidedPlan, {
      projectId,
      intent: (project.brief ?? "").trim() || project.name,
    });

    // On failure we leave status="planning" (set by _resetGuidedPlan) and just
    // throw: the UI shows the error and offers a per-phase Retry, so a transient
    // LLM/network failure never strands the user or discards their picks.
    const byIndex = new Map(segments.map((s) => [s.index, s]));
    const promptOf = promptOfFrom(agents);
    const system =
      UNIVERSAL_CRAFT +
      "\n" +
      stackBriefs(promptOf) +
      briefBlock(project.brief) +
      `\n\n=== TASK: OPENINGS ===\nPropose exactly ${CANDIDATE_COUNT} distinct ways to OPEN this video. ` +
      "Each opening is a short ordered list of cue indices (usually 1–4 cues) " +
      "that, played first, earns attention the way the specialist briefs above " +
      "define 'strong'. Return for each: segmentIndexes (in play order) and a " +
      "one-line rationale. Use only indices present below.";

    const candidates = cleanCandidates(
      await llmCandidates(system, transcriptUser(segments)),
      byIndex
    );
    if (candidates.length === 0) {
      throw new Error("Could not propose openings. Try again.");
    }
    await ctx.runMutation(internal.projects._setCandidates, {
      projectId,
      phase: "opening",
      candidates,
    });
  },
});

// Propose ENDINGS that resolve the chosen opening.
export const proposeClosings = action({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }): Promise<void> => {
    const ownerId = await requireUserId(ctx);
    const { project, agents, segments, plan } = await ctx.runQuery(
      internal.projects._loadProjectForEdit,
      { projectId, ownerId }
    );
    const opening = plan?.chosen?.opening ?? [];
    if (opening.length === 0) throw new Error("Choose an opening first");

    const byIndex = new Map(segments.map((s) => [s.index, s]));
    const promptOf = promptOfFrom(agents);
    const system =
      UNIVERSAL_CRAFT +
      "\n" +
      stackBriefs(promptOf) +
      briefBlock(project.brief) +
      "\n\n=== TASK: ENDINGS ===\nThe video will OPEN with these cues:\n" +
      renderCues(opening, byIndex) +
      `\n\nPropose exactly ${CANDIDATE_COUNT} distinct ways to END it — a closing ` +
      "that resolves what the opening sets up, the way the briefs define a strong " +
      "ending. Each ending is a short ordered list of cue indices (usually 1–3 " +
      "cues). Return segmentIndexes + a one-line rationale. Use only indices " +
      "present below, and do not reuse the opening cues.";

    const openSet = new Set(opening);
    const candidates = cleanCandidates(
      await llmCandidates(system, transcriptUser(segments)),
      byIndex
    )
      .map((c) => ({
        ...c,
        segmentIndexes: c.segmentIndexes.filter((ix) => !openSet.has(ix)),
      }))
      .filter((c) => c.segmentIndexes.length > 0);

    if (candidates.length === 0) {
      throw new Error("Could not propose endings. Try again.");
    }
    await ctx.runMutation(internal.projects._setCandidates, {
      projectId,
      phase: "closing",
      candidates,
    });
  },
});

// Build full VERSIONS: opening first, closing last, with distinct middles.
export const proposeVersions = action({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }): Promise<void> => {
    const ownerId = await requireUserId(ctx);
    const { project, agents, segments, plan } = await ctx.runQuery(
      internal.projects._loadProjectForEdit,
      { projectId, ownerId }
    );
    const opening = plan?.chosen?.opening ?? [];
    const closing = plan?.chosen?.closing ?? [];
    if (opening.length === 0 || closing.length === 0) {
      throw new Error("Choose an opening and an ending first");
    }

    const byIndex = new Map(segments.map((s) => [s.index, s]));
    const promptOf = promptOfFrom(agents);
    const system =
      UNIVERSAL_CRAFT +
      "\n" +
      stackBriefs(promptOf) +
      briefBlock(project.brief) +
      `\n\n=== TASK: FULL VERSIONS ===\nBuild exactly ${CANDIDATE_COUNT} distinct ` +
      "complete edits. Every version MUST start with the OPENING cues and end " +
      "with the CLOSING cues below, and fill the MIDDLE by selecting from the " +
      "remaining cues so the result sustains attention and forms a causal chain " +
      "(this → therefore → that), dropping anything that does not earn its place.\n\n" +
      "OPENING (first):\n" +
      renderCues(opening, byIndex) +
      "\n\nCLOSING (last):\n" +
      renderCues(closing, byIndex) +
      "\n\nReturn for each version: segmentIndexes = the FULL ordered list of " +
      "kept cue indices (opening first, closing last), and a one-line rationale " +
      "describing how this version differs. Use only indices present below.";

    const candidates = cleanCandidates(
      await llmCandidates(system, transcriptUser(segments)),
      byIndex
    )
      .map((c) => normalizeVersion(c, opening, closing, byIndex))
      .filter((c) => c.segmentIndexes.length > 0);

    if (candidates.length === 0) {
      throw new Error("Could not build versions. Try again.");
    }
    await ctx.runMutation(internal.projects._setCandidates, {
      projectId,
      phase: "versions",
      candidates,
    });
  },
});

// Apply a free-text refinement to the current selections (select/reorder only).
export const refineEdit = action({
  args: { projectId: v.id("projects"), instruction: v.string() },
  handler: async (ctx, { projectId, instruction }): Promise<void> => {
    const ownerId = await requireUserId(ctx);
    const { project, agents, segments, plan } = await ctx.runQuery(
      internal.projects._loadProjectForEdit,
      { projectId, ownerId }
    );
    if (!plan || plan.selections.length === 0) {
      throw new Error("Choose a version first");
    }
    const byId = new Map(segments.map((s) => [s._id, s]));
    const byIndex = new Map(segments.map((s) => [s.index, s]));
    const current = plan.selections
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((sel) => byId.get(sel.segmentId)?.index)
      .filter((x): x is number => x !== undefined);

    const promptOf = promptOfFrom(agents);
    const system =
      UNIVERSAL_CRAFT +
      "\n" +
      stackBriefs(promptOf) +
      briefBlock(project.brief) +
      "\n\n=== TASK: REFINE ===\nHere is the CURRENT edit as an ordered list of " +
      "cue indices:\n" +
      current.join(", ") +
      "\n\nApply the user's instruction by SELECTING and REORDERING cues only " +
      "(never reword, never invent). Return segmentIndexes = the full ordered list " +
      "of kept cue indices after the change. Use only indices present below.";

    const resp = await client().messages.create({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { format: { type: "json_schema", schema: REFINE_SCHEMA } },
      system,
      messages: [
        {
          role: "user",
          content: `Instruction: ${instruction}\n\n${transcriptUser(segments)}`,
        },
      ],
    });
    const parsed = jsonFromResponse(resp) as { segmentIndexes?: number[] };
    const selections = selectionsFromIndexes(parsed.segmentIndexes ?? [], byIndex);
    if (selections.length === 0) {
      throw new Error("That refinement produced an empty edit. Try another instruction.");
    }
    await ctx.runMutation(internal.projects._commitGuidedSelections, {
      projectId,
      selections,
      phase: "refining",
    });
  },
});

// Build the Premiere XMEML from the current selections and mark the edit ready.
export const finalizeEdit = action({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }): Promise<void> => {
    const ownerId = await requireUserId(ctx);
    const { project, segments, plan } = await ctx.runQuery(
      internal.projects._loadProjectForEdit,
      { projectId, ownerId }
    );
    if (!plan || plan.phase !== "refining" || plan.selections.length === 0) {
      throw new Error("Choose a version first");
    }
    // On failure we leave status="planning"/phase="refining" and throw, so the
    // user keeps their chosen version and can simply press Export again.
    const byId = new Map(segments.map((s) => [s._id, s]));
    const clips: XmemlClip[] = [];
    plan.selections
      .slice()
      .sort((a, b) => a.order - b.order)
      .forEach((sel) => {
        const seg = byId.get(sel.segmentId);
        if (!seg) return;
        clips.push(clipFromSegment(seg, sel.trimStartMs, sel.trimEndMs).clip);
      });
    if (clips.length === 0) throw new Error("No clips to export");

    const xml = buildXmlString(project, segments, clips);
    const xmlStorageId = await ctx.storage.store(
      new Blob([xml], { type: "application/xml" })
    );
    await ctx.runMutation(internal.projects._finalizeGuided, {
      projectId,
      xmlStorageId,
    });
  },
});
