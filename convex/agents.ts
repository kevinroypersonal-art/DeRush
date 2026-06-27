import { mutation, internalMutation, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { intakeValidator } from "./onboarding";

const agentKind = v.union(
  v.literal("derush"),
  v.literal("storytelling"),
  v.literal("editing_style")
);

// Resolve the authenticated Clerk user id, or throw if unauthenticated.
async function requireUser(ctx: QueryCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }
  return identity.subject;
}

// Edit a single agent's system prompt (the review screen). Ownership-checked.
export const editAgentPrompt = mutation({
  args: { agentId: v.id("agents"), systemPrompt: v.string() },
  handler: async (ctx, { agentId, systemPrompt }) => {
    const ownerId = await requireUser(ctx);
    const agent = await ctx.db.get(agentId);
    if (!agent) {
      throw new Error("Agent not found");
    }
    if (agent.ownerId !== ownerId) {
      throw new Error("Not authorized");
    }
    const trimmed = systemPrompt.trim();
    if (!trimmed) {
      throw new Error("Prompt cannot be empty");
    }
    await ctx.db.patch(agentId, {
      systemPrompt: trimmed,
      version: agent.version + 1,
      source: "manual",
      updatedAt: Date.now(),
    });
  },
});

// Internal: persist the 3 LLM-generated agent prompts. Called only by the
// trusted generateAgents action. Upserts by (owner, kind) so regenerating
// replaces rather than duplicating, and marks the profile agents_generated.
export const upsertAgents = internalMutation({
  args: {
    ownerId: v.string(),
    source: v.union(v.literal("scratch"), v.literal("xml")),
    agents: v.array(
      v.object({ kind: agentKind, systemPrompt: v.string() })
    ),
  },
  handler: async (ctx, { ownerId, source, agents }) => {
    const now = Date.now();
    for (const { kind, systemPrompt } of agents) {
      const existing = await ctx.db
        .query("agents")
        .withIndex("by_owner_kind", (q) =>
          q.eq("ownerId", ownerId).eq("kind", kind)
        )
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, {
          systemPrompt,
          version: existing.version + 1,
          status: "draft",
          source,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("agents", {
          ownerId,
          kind,
          systemPrompt,
          version: 1,
          status: "draft",
          source,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    const profile = await ctx.db
      .query("editorProfiles")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .unique();
    if (profile) {
      await ctx.db.patch(profile._id, {
        status: "agents_generated",
        updatedAt: now,
      });
    }
  },
});

// Internal: write the XML-derived prefilled intake back to the profile.
export const setXmlAnalysis = internalMutation({
  args: {
    ownerId: v.string(),
    intake: intakeValidator,
    analysisRaw: v.string(),
  },
  handler: async (ctx, { ownerId, intake, analysisRaw }) => {
    const profile = await ctx.db
      .query("editorProfiles")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .unique();
    if (!profile) {
      throw new Error("No onboarding in progress");
    }
    await ctx.db.patch(profile._id, {
      intake,
      xmlAnalysisRaw: analysisRaw,
      updatedAt: Date.now(),
    });
  },
});
