import {
  mutation,
  query,
  internalMutation,
  internalQuery,
  QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

// Resolve the authenticated Clerk user id, or throw if unauthenticated.
async function requireUser(ctx: QueryCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }
  return identity.subject;
}

// Load a project and assert the current user owns it.
async function requireOwnedProject(ctx: QueryCtx, projectId: Id<"projects">) {
  const ownerId = await requireUser(ctx);
  const project = await ctx.db.get(projectId);
  if (!project) {
    throw new Error("Project not found");
  }
  if (project.ownerId !== ownerId) {
    throw new Error("Not authorized");
  }
  return project;
}

const projectStatus = v.union(
  v.literal("draft"),
  v.literal("uploaded"),
  v.literal("parsing"),
  v.literal("parsed"),
  v.literal("generating"),
  v.literal("ready"),
  v.literal("error")
);

const selectionValidator = v.object({
  segmentId: v.id("segments"),
  order: v.number(),
  trimStartMs: v.number(),
  trimEndMs: v.number(),
  rationale: v.string(),
});

// The user's single Derush Stack (or null), used when creating projects.
export const getDefaultStack = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return await ctx.db
      .query("derushStacks")
      .withIndex("by_owner", (q) => q.eq("ownerId", identity.subject))
      .first();
  },
});

// List the current user's projects (videos), newest first.
export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    return await ctx.db
      .query("projects")
      .withIndex("by_owner", (q) => q.eq("ownerId", identity.subject))
      .order("desc")
      .collect();
  },
});

// Fetch a single owned project.
export const get = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    return await requireOwnedProject(ctx, projectId);
  },
});

// Create a project (one video). Attaches the user's default Derush Stack.
export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const ownerId = await requireUser(ctx);
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error("Project name is required");
    }
    const stack = await ctx.db
      .query("derushStacks")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .first();
    if (!stack) {
      throw new Error("Finish onboarding to set up your Derush Stack first");
    }
    const now = Date.now();
    return await ctx.db.insert("projects", {
      ownerId,
      name: trimmed,
      stackId: stack._id,
      status: "draft",
      fps: 25,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Rename an owned project.
export const update = mutation({
  args: { projectId: v.id("projects"), name: v.optional(v.string()) },
  handler: async (ctx, { projectId, name }) => {
    await requireOwnedProject(ctx, projectId);
    if (name !== undefined) {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Project name is required");
      await ctx.db.patch(projectId, { name: trimmed, updatedAt: Date.now() });
    }
  },
});

// Delete an owned project and its rushes / segments / edit plans.
export const remove = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await requireOwnedProject(ctx, projectId);
    const plans = await ctx.db
      .query("editPlans")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    for (const p of plans) await ctx.db.delete(p._id);
    const rushes = await ctx.db
      .query("rushes")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    for (const r of rushes) {
      const segs = await ctx.db
        .query("segments")
        .withIndex("by_rush", (q) => q.eq("rushId", r._id))
        .collect();
      for (const s of segs) await ctx.db.delete(s._id);
      await ctx.db.delete(r._id);
    }
    await ctx.db.delete(projectId);
  },
});

// Upload flow for the SRT transcript (mirrors onboarding's XML upload).
export const generateSrtUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const recordSrtUpload = mutation({
  args: {
    projectId: v.id("projects"),
    storageId: v.id("_storage"),
    filename: v.string(),
  },
  handler: async (ctx, { projectId, storageId, filename }) => {
    await requireOwnedProject(ctx, projectId);
    await ctx.db.patch(projectId, {
      srtStorageId: storageId,
      srtFilename: filename,
      status: "uploaded",
      updatedAt: Date.now(),
    });
  },
});

// Segments of a project's parsed transcript, ordered by index (segment viewer).
export const getProjectSegments = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await requireOwnedProject(ctx, projectId);
    if (!project.rushId) return [];
    const rushId = project.rushId;
    const segs = await ctx.db
      .query("segments")
      .withIndex("by_rush", (q) => q.eq("rushId", rushId))
      .collect();
    return segs.sort((a, b) => a.index - b.index);
  },
});

// Latest edit plan for a project (the kept-segments view).
export const getEditPlan = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await requireOwnedProject(ctx, projectId);
    const plans = await ctx.db
      .query("editPlans")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    return plans.length ? plans[plans.length - 1] : null;
  },
});

// A short-lived download URL for the generated Premiere XMEML.
export const getXmlDownloadUrl = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await requireOwnedProject(ctx, projectId);
    if (!project.xmlStorageId) return null;
    return await ctx.storage.getUrl(project.xmlStorageId);
  },
});

// ---- internal (called by the pipeline actions in projectsNode.ts) ----------

export const _getOwnedProject = internalQuery({
  args: { projectId: v.id("projects"), ownerId: v.string() },
  handler: async (ctx, { projectId, ownerId }) => {
    const project = await ctx.db.get(projectId);
    if (!project || project.ownerId !== ownerId) {
      throw new Error("Project not found");
    }
    return project;
  },
});

export const _setProjectStatus = internalMutation({
  args: {
    projectId: v.id("projects"),
    status: projectStatus,
    xmlError: v.optional(v.string()),
  },
  handler: async (ctx, { projectId, status, xmlError }) => {
    await ctx.db.patch(projectId, {
      status,
      ...(xmlError !== undefined ? { xmlError } : {}),
      updatedAt: Date.now(),
    });
  },
});

export const _writeRushAndSegments = internalMutation({
  args: {
    projectId: v.id("projects"),
    filename: v.string(),
    durationMs: v.number(),
    cues: v.array(
      v.object({
        index: v.number(),
        startMs: v.number(),
        endMs: v.number(),
        text: v.string(),
      })
    ),
  },
  handler: async (ctx, { projectId, filename, durationMs, cues }) => {
    // Clear any prior rush/segments so re-parsing is idempotent.
    const prior = await ctx.db
      .query("rushes")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    for (const r of prior) {
      const segs = await ctx.db
        .query("segments")
        .withIndex("by_rush", (q) => q.eq("rushId", r._id))
        .collect();
      for (const s of segs) await ctx.db.delete(s._id);
      await ctx.db.delete(r._id);
    }
    const rushId = await ctx.db.insert("rushes", {
      projectId,
      filename,
      durationMs,
      status: "parsed",
    });
    for (const c of cues) {
      await ctx.db.insert("segments", {
        rushId,
        index: c.index,
        startMs: c.startMs,
        endMs: c.endMs,
        text: c.text,
      });
    }
    await ctx.db.patch(projectId, {
      rushId,
      status: "parsed",
      updatedAt: Date.now(),
    });
  },
});

export const _loadProjectForEdit = internalQuery({
  args: { projectId: v.id("projects"), ownerId: v.string() },
  handler: async (ctx, { projectId, ownerId }) => {
    const project = await ctx.db.get(projectId);
    if (!project || project.ownerId !== ownerId) {
      throw new Error("Project not found");
    }
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    const segments = project.rushId
      ? (
          await ctx.db
            .query("segments")
            .withIndex("by_rush", (q) =>
              q.eq("rushId", project.rushId as Id<"rushes">)
            )
            .collect()
        ).sort((a, b) => a.index - b.index)
      : [];
    return { project, agents, segments };
  },
});

export const _writeEditPlanAndXml = internalMutation({
  args: {
    projectId: v.id("projects"),
    intent: v.string(),
    selections: v.array(selectionValidator),
    xmlStorageId: v.id("_storage"),
  },
  handler: async (ctx, { projectId, intent, selections, xmlStorageId }) => {
    await ctx.db.insert("editPlans", {
      projectId,
      memoryVersion: 0,
      intent,
      selections,
      status: "draft",
    });
    await ctx.db.patch(projectId, {
      xmlStorageId,
      status: "ready",
      updatedAt: Date.now(),
    });
  },
});
