import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// DeRush data model. See PRD §4.2. The full domain is defined up front so the
// foundation is stable; M0 only exercises `projects`, later milestones fill in
// ingestion, learning, planning and export.
export default defineSchema({
  // A Project is one video job: pick a Derush Stack, upload an SRT, and the
  // stack's agents produce one editing XML. 1 Project = 1 video = 1 XML.
  projects: defineTable({
    ownerId: v.string(), // Clerk user id
    name: v.string(),
    style: v.optional(v.string()), // legacy free-text brief (the stack carries style now)
    brief: v.optional(v.string()), // optional per-video brief for THIS edit (universal, style-agnostic)
    stackId: v.optional(v.id("derushStacks")), // which Derush Stack drives this project
    status: v.optional(
      v.union(
        v.literal("draft"), // created, no SRT yet
        v.literal("uploaded"), // SRT stored, not parsed
        v.literal("parsing"),
        v.literal("parsed"), // segments ready
        v.literal("planning"), // guided flow in progress (proposing/choosing)
        v.literal("generating"), // pipeline running
        v.literal("ready"), // XMEML produced
        v.literal("error")
      )
    ),
    srtStorageId: v.optional(v.id("_storage")), // uploaded transcript
    srtFilename: v.optional(v.string()),
    rushId: v.optional(v.id("rushes")), // the rush created from the SRT
    xmlStorageId: v.optional(v.id("_storage")), // generated Premiere XMEML
    xmlError: v.optional(v.string()),
    fps: v.optional(v.number()), // timeline frame rate (default 25 when reading)
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
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
    // ---- guided-flow working state (genre-neutral). Optional so the one-shot
    // "Quick draft" path leaves them unset. The flow advances opening → closing
    // → versions → refining → done, mutating a single editPlan row. ----
    phase: v.optional(
      v.union(
        v.literal("opening"),
        v.literal("closing"),
        v.literal("versions"),
        v.literal("refining"),
        v.literal("done")
      )
    ),
    // Transient candidates for the current step. segmentIndexes are raw cue
    // indices (the integrity invariant: we only ever reference existing cues).
    candidates: v.optional(
      v.array(
        v.object({
          segmentIndexes: v.array(v.number()),
          rationale: v.string(),
        })
      )
    ),
    // The validated picks that constrain later steps.
    chosen: v.optional(
      v.object({
        opening: v.optional(v.array(v.number())),
        closing: v.optional(v.array(v.number())),
      })
    ),
  }).index("by_project", ["projectId"]),

  // Account-scoped onboarding profile: one row per Clerk user. Holds the chosen
  // onboarding path, the questionnaire answers, and (for the XML path) the
  // uploaded edit file. The agents below are generated from this.
  editorProfiles: defineTable({
    ownerId: v.string(), // Clerk user id (identity.subject)
    source: v.union(
      v.literal("scratch"),
      v.literal("xml"),
      v.literal("template")
    ),
    status: v.union(
      v.literal("in_progress"),
      v.literal("agents_generated"), // agents drafted, under review
      v.literal("completed") // finished; agents active
    ),
    // Shared questionnaire shape: filled by the wizard (scratch) or prefilled by
    // the XML analyzer and then edited by the user.
    intake: v.optional(
      v.object({
        subject: v.optional(v.string()),
        rushLength: v.optional(v.string()),
        finalLength: v.optional(v.string()),
        keepDiscardRules: v.optional(v.string()),
        editingStyle: v.optional(v.string()),
        storyMessage: v.optional(v.string()),
        narrativeStructure: v.optional(v.string()),
        tone: v.optional(v.string()),
        audience: v.optional(v.string()),
        motionDesign: v.optional(v.boolean()),
        colorGrading: v.optional(v.string()),
        cuttingStyle: v.optional(v.string()),
        bRoll: v.optional(v.string()),
        zoomPunchIns: v.optional(v.boolean()),
        music: v.optional(v.string()),
      })
    ),
    // XML path only:
    xmlStorageId: v.optional(v.id("_storage")), // raw uploaded edit XML
    xmlFilename: v.optional(v.string()),
    xmlAnalysisRaw: v.optional(v.string()), // Claude's analysis notes (audit/debug)
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_owner", ["ownerId"]),

  // Account-scoped agents: exactly 3 rows per user (one per kind). Each agent's
  // editable system prompt is the deliverable and the pillar of the tool.
  agents: defineTable({
    ownerId: v.string(), // Clerk user id
    stackId: v.optional(v.id("derushStacks")), // the Derush Stack this agent belongs to
    kind: v.union(
      v.literal("derush"),
      v.literal("storytelling"),
      v.literal("editing_style")
    ),
    systemPrompt: v.string(), // editable
    version: v.number(), // bumped on each user edit / regenerate
    status: v.union(v.literal("draft"), v.literal("active")),
    source: v.union(
      v.literal("scratch"),
      v.literal("xml"),
      v.literal("manual") // user hand-edited
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_kind", ["ownerId", "kind"])
    .index("by_stack", ["stackId"])
    .index("by_stack_kind", ["stackId", "kind"]),

  // A Derush Stack is a named group of agents (the onboarding output). One
  // default stack per user for now; a project selects a stack to deRush with.
  derushStacks: defineTable({
    ownerId: v.string(), // Clerk user id
    name: v.string(), // e.g. "My Derush Stack"
    source: v.union(
      v.literal("scratch"),
      v.literal("xml"),
      v.literal("template")
    ),
    // Snapshot of the questionnaire at creation (audit / regenerate).
    intake: v.optional(
      v.object({
        subject: v.optional(v.string()),
        rushLength: v.optional(v.string()),
        finalLength: v.optional(v.string()),
        keepDiscardRules: v.optional(v.string()),
        editingStyle: v.optional(v.string()),
        storyMessage: v.optional(v.string()),
        narrativeStructure: v.optional(v.string()),
        tone: v.optional(v.string()),
        audience: v.optional(v.string()),
        motionDesign: v.optional(v.boolean()),
        colorGrading: v.optional(v.string()),
        cuttingStyle: v.optional(v.string()),
        bRoll: v.optional(v.string()),
        zoomPunchIns: v.optional(v.boolean()),
        music: v.optional(v.string()),
      })
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_owner", ["ownerId"]),
});
