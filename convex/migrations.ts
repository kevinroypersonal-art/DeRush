import { internalMutation } from "./_generated/server";

// One-time backfill: give every existing user with agents a Derush Stack and
// stamp `stackId` on their agents. Idempotent. Run with:
//   npx convex run migrations:backfillStacks
export const backfillStacks = internalMutation({
  args: {},
  handler: async (ctx) => {
    const agents = await ctx.db.query("agents").collect();
    const owners = [...new Set(agents.map((a) => a.ownerId))];
    let stacksCreated = 0;
    let agentsUpdated = 0;

    for (const ownerId of owners) {
      let stack = await ctx.db
        .query("derushStacks")
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
        .first();
      if (!stack) {
        const profile = await ctx.db
          .query("editorProfiles")
          .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
          .unique();
        const now = Date.now();
        const stackId = await ctx.db.insert("derushStacks", {
          ownerId,
          name: "My Derush Stack",
          source: profile?.source === "xml" ? "xml" : "scratch",
          intake: profile?.intake,
          createdAt: now,
          updatedAt: now,
        });
        stack = await ctx.db.get(stackId);
        stacksCreated++;
      }
      const stackId = stack!._id;
      for (const a of agents) {
        if (a.ownerId === ownerId && !a.stackId) {
          await ctx.db.patch(a._id, { stackId });
          agentsUpdated++;
        }
      }
    }

    return { owners: owners.length, stacksCreated, agentsUpdated };
  },
});
