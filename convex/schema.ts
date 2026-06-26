import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// DeRush data model. See PRD §4.2. The full domain is defined up front so the
// foundation is stable; M0 only exercises `projects`, later milestones fill in
// ingestion, learning, planning and export.
export default defineSchema({
  projects: defineTable({
    ownerId: v.string(), // Clerk user id
    name: v.string(),
    style: v.string(), // free-text style brief
    createdAt: v.number(),
  }).index("by_owner", ["ownerId"]),

  rushes: defineTable({
    projectId: v.id("projects"),
    filename: v.string(),
    storageId: v.optional(v.id("_storage")), // raw video, later
    durationMs: v.optional(v.number()),
    status: v.union(
      v.literal("uploaded"),
      v.literal("parsed"),
      v.literal("error")
    ),
  }).index("by_project", ["projectId"]),

  segments: defineTable({
    rushId: v.id("rushes"),
    index: v.number(),
    startMs: v.number(),
    endMs: v.number(),
    speaker: v.optional(v.string()),
    text: v.string(),
    words: v.optional(
      v.array(v.object({ t: v.number(), d: v.number(), w: v.string() }))
    ),
  }).index("by_rush", ["rushId"]),

  referenceEdits: defineTable({
    projectId: v.id("projects"),
    sourceTranscriptId: v.optional(v.id("rushes")),
    decisionListRaw: v.string(), // uploaded XML/EDL
    parsedCuts: v.array(
      v.object({
        sourceIn: v.number(),
        sourceOut: v.number(),
        timelineIn: v.number(),
        order: v.number(),
      })
    ),
  }).index("by_project", ["projectId"]),

  editingMemories: defineTable({
    projectId: v.id("projects"),
    version: v.number(),
    rules: v.array(
      v.object({
        kind: v.string(), // "pacing" | "filler" | "structure" | ...
        description: v.string(),
        confidence: v.number(),
        examples: v.array(v.string()),
      })
    ),
    structurePrior: v.string(), // JSON: hook/build/payoff template
    createdAt: v.number(),
  }).index("by_project_version", ["projectId", "version"]),

  editPlans: defineTable({
    projectId: v.id("projects"),
    memoryVersion: v.number(),
    intent: v.string(), // user's brief for this video
    selections: v.array(
      v.object({
        segmentId: v.id("segments"),
        order: v.number(),
        trimStartMs: v.number(),
        trimEndMs: v.number(),
        rationale: v.string(),
      })
    ),
    status: v.union(
      v.literal("draft"),
      v.literal("refining"),
      v.literal("exported")
    ),
  }).index("by_project", ["projectId"]),
});
