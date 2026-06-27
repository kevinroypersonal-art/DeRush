"use node";

import Anthropic from "@anthropic-ai/sdk";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { parseSrt } from "./srt";
import { buildXmeml, XmemlClip } from "./xmeml";

const MODEL = "claude-opus-4-8";

// Cap how many cues we send to the model in one pass (v1; chunking is a later
// upgrade). Keeps the structured output under max_tokens.
const MAX_SEGMENTS = 400;

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

async function requireUserId(ctx: {
  auth: { getUserIdentity: () => Promise<{ subject: string } | null> };
}) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  return identity.subject;
}

// Parse an uploaded SRT/VTT into segments (deterministic; no LLM).
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
        xmlError: err instanceof Error ? err.message : "Failed to parse",
      });
      throw err;
    }
  },
});

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

// Run the project's Derush Stack over the transcript → edit plan → Premiere XMEML.
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
      const promptOf = (kind: string) =>
        agents.find((a) => a.kind === kind)?.systemPrompt ?? "";
      const system =
        "You are a video editor producing a PAPER EDIT (an edit decision list) " +
        "from a transcript. Three specialist briefs guide you:\n\n" +
        "=== DE-RUSH (what to keep vs cut) ===\n" +
        promptOf("derush") +
        "\n\n=== STORYTELLING (order & structure) ===\n" +
        promptOf("storytelling") +
        "\n\n=== EDITING STYLE (tightening) ===\n" +
        promptOf("editing_style") +
        "\n\nFrom the numbered transcript, choose which cues to KEEP, in what " +
        "ORDER (0-based), with optional head/tail trims in milliseconds. Cut " +
        "filler, silences, retakes and tangents. Only use segmentIndex values " +
        "that appear in the transcript. Keep each rationale under 12 words.";

      const transcript = segments
        .slice(0, MAX_SEGMENTS)
        .map((s) => `#${s.index} [${s.startMs}-${s.endMs}ms] ${s.text}`)
        .join("\n");
      const truncated = segments.length > MAX_SEGMENTS;

      const resp = await client().messages.create({
        model: MODEL,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        output_config: {
          format: { type: "json_schema", schema: EDIT_SCHEMA },
        },
        system,
        messages: [
          {
            role: "user",
            content:
              `Transcript (${segments.length} cues${
                truncated ? `, showing first ${MAX_SEGMENTS}` : ""
              }):\n\n` + transcript,
          },
        ],
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

      const selections: Array<{
        segmentId: (typeof segments)[number]["_id"];
        order: number;
        trimStartMs: number;
        trimEndMs: number;
        rationale: string;
      }> = [];
      const clips: XmemlClip[] = [];

      kept.forEach((s, i) => {
        const seg = byIndex.get(s.segmentIndex)!;
        const dur = seg.endMs - seg.startMs;
        let ts = Math.max(0, Math.round(s.trimStartMs || 0));
        let te = Math.max(0, Math.round(s.trimEndMs || 0));
        if (ts + te >= dur) {
          ts = 0;
          te = 0;
        }
        selections.push({
          segmentId: seg._id,
          order: i,
          trimStartMs: ts,
          trimEndMs: te,
          rationale: s.rationale ?? "",
        });
        clips.push({
          sourceStartMs: seg.startMs + ts,
          sourceEndMs: seg.endMs - te,
        });
      });

      if (selections.length === 0) {
        throw new Error("The agents did not keep any segments. Try regenerating.");
      }

      const sourceDurationMs = segments.reduce(
        (m, s) => Math.max(m, s.endMs),
        0
      );
      const xml = buildXmeml({
        name: project.name,
        srtFilename: project.srtFilename ?? "transcript",
        fps: project.fps ?? 25,
        sourceDurationMs,
        clips,
      });

      const xmlStorageId = await ctx.storage.store(
        new Blob([xml], { type: "application/xml" })
      );

      await ctx.runMutation(internal.projects._writeEditPlanAndXml, {
        projectId,
        intent: project.name,
        selections,
        xmlStorageId,
      });
    } catch (err) {
      await ctx.runMutation(internal.projects._setProjectStatus, {
        projectId,
        status: "error",
        xmlError: err instanceof Error ? err.message : "Generation failed",
      });
      throw err;
    }
  },
});
