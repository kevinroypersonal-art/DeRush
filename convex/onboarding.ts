import {
  mutation,
  query,
  internalQuery,
  QueryCtx,
  MutationCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { Doc } from "./_generated/dataModel";

// Shared validator for the questionnaire answers. Reused by saveIntake here and
// by the LLM actions in agents.ts so the wizard, analyzer and generator all
// agree on one shape.
export const intakeValidator = v.object({
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
});

// Resolve the authenticated Clerk user id, or throw if unauthenticated.
async function requireUser(ctx: QueryCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }
  return identity.subject;
}

// Find the current user's onboarding profile (or null).
async function getProfile(
  ctx: QueryCtx,
  ownerId: string
): Promise<Doc<"editorProfiles"> | null> {
  return await ctx.db
    .query("editorProfiles")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .unique();
}

// Upsert the profile, creating it if missing. Returns the profile id.
async function ensureProfile(
  ctx: MutationCtx,
  ownerId: string,
  patch: Partial<Doc<"editorProfiles">>
) {
  const existing = await getProfile(ctx, ownerId);
  const now = Date.now();
  if (existing) {
    await ctx.db.patch(existing._id, { ...patch, updatedAt: now });
    return existing._id;
  }
  return await ctx.db.insert("editorProfiles", {
    ownerId,
    source: "scratch",
    status: "in_progress",
    createdAt: now,
    updatedAt: now,
    ...patch,
  });
}

// The single source of truth for gating, wizard resume, and the review screen.
export const getState = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { profile: null, agents: [], stack: null };
    }
    const profile = await getProfile(ctx, identity.subject);
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_owner", (q) => q.eq("ownerId", identity.subject))
      .collect();
    const stack = await ctx.db
      .query("derushStacks")
      .withIndex("by_owner", (q) => q.eq("ownerId", identity.subject))
      .first();
    return { profile, agents, stack };
  },
});

// Begin onboarding down one of the three paths. Templates are locked.
export const startOnboarding = mutation({
  args: {
    source: v.union(
      v.literal("scratch"),
      v.literal("xml"),
      v.literal("template")
    ),
  },
  handler: async (ctx, { source }) => {
    const ownerId = await requireUser(ctx);
    if (source === "template") {
      throw new Error("Templates are not available yet");
    }
    return await ensureProfile(ctx, ownerId, {
      source,
      status: "in_progress",
    });
  },
});

// Save (or update) the questionnaire answers. Used by both paths.
export const saveIntake = mutation({
  args: { intake: intakeValidator },
  handler: async (ctx, { intake }) => {
    const ownerId = await requireUser(ctx);
    await ensureProfile(ctx, ownerId, { intake, status: "in_progress" });
  },
});

// Generate a short-lived upload URL for the edit XML (XML path).
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

// Record an uploaded XML file against the user's profile.
export const recordXmlUpload = mutation({
  args: { storageId: v.id("_storage"), filename: v.string() },
  handler: async (ctx, { storageId, filename }) => {
    const ownerId = await requireUser(ctx);
    await ensureProfile(ctx, ownerId, {
      source: "xml",
      xmlStorageId: storageId,
      xmlFilename: filename,
      status: "in_progress",
    });
  },
});

// Finish onboarding: flip the 3 agents from draft to active and mark complete.
export const completeOnboarding = mutation({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    const profile = await getProfile(ctx, ownerId);
    if (!profile) {
      throw new Error("No onboarding in progress");
    }
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    if (agents.length < 3) {
      throw new Error("Agents have not been generated yet");
    }
    const now = Date.now();
    for (const agent of agents) {
      if (agent.status !== "active") {
        await ctx.db.patch(agent._id, { status: "active", updatedAt: now });
      }
    }
    await ctx.db.patch(profile._id, { status: "completed", updatedAt: now });
  },
});

// Internal: load a user's profile for the LLM actions (which can't touch ctx.db).
export const _getProfileForUser = internalQuery({
  args: { ownerId: v.string() },
  handler: async (ctx, { ownerId }) => {
    return await getProfile(ctx, ownerId);
  },
});
