import { mutation } from "./_generated/server";
import { v } from "convex/values";

const headlineRow = v.object({
  sourceCreationTime: v.number(),
  hashedId: v.string(),
  fontSize: v.number(),
  height: v.number(),
  score: v.number(),
  scrapedAt: v.number(),
  width: v.number(),
  x: v.number(),
  y: v.number(),
});

const headlineDefinitionRow = v.object({
  sourceCreationTime: v.number(),
  hashedId: v.string(),
  headlineText: v.string(),
  href: v.string(),
  siteName: v.string(),
});

export const importHeadlinesBatch = mutation({
  args: {
    rows: v.array(headlineRow),
  },
  handler: async (ctx, args) => {
    for (const row of args.rows) {
      await ctx.db.insert("headlines", row);
    }

    return { inserted: args.rows.length };
  },
});

export const importHeadlineDefinitionsBatch = mutation({
  args: {
    rows: v.array(headlineDefinitionRow),
  },
  handler: async (ctx, args) => {
    for (const row of args.rows) {
      await ctx.db.insert("headlineDefinitions", row);
    }

    return { inserted: args.rows.length };
  },
});
