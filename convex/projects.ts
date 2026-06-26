import { mutation, query, QueryCtx } from "./_generated/server";
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

// List the current user's projects, newest first.
export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }
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

// Create a project owned by the current user.
export const create = mutation({
  args: {
    name: v.string(),
    style: v.string(),
  },
  handler: async (ctx, { name, style }) => {
    const ownerId = await requireUser(ctx);
    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new Error("Project name is required");
    }
    return await ctx.db.insert("projects", {
      ownerId,
      name: trimmedName,
      style: style.trim(),
      createdAt: Date.now(),
    });
  },
});

// Update an owned project's name and/or style brief.
export const update = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.optional(v.string()),
    style: v.optional(v.string()),
  },
  handler: async (ctx, { projectId, name, style }) => {
    await requireOwnedProject(ctx, projectId);
    const patch: { name?: string; style?: string } = {};
    if (name !== undefined) {
      const trimmedName = name.trim();
      if (!trimmedName) {
        throw new Error("Project name is required");
      }
      patch.name = trimmedName;
    }
    if (style !== undefined) {
      patch.style = style.trim();
    }
    await ctx.db.patch(projectId, patch);
  },
});

// Delete an owned project.
export const remove = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await requireOwnedProject(ctx, projectId);
    await ctx.db.delete(projectId);
  },
});
