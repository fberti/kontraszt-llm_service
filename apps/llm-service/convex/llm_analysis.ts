import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const headlineLookupRow = v.object({
  hashedId: v.string(),
  headlineText: v.string(),
  sourceCreationTime: v.number(),
});

const llmAnalysisRow = v.object({
  hashedId: v.string(),
  headlineText: v.string(),
  sourceCreationTime: v.optional(v.number()),
  label: v.string(),
  sentiment: v.string(),
  sentiment_score: v.optional(v.number()),
  entities: v.array(v.string()),
  confidence: v.number(),
});

export const findMissingHeadlines = query({
  args: {
    rows: v.array(headlineLookupRow),
  },
  handler: async (ctx, args) => {
    const missing: Array<{
      hashedId: string;
      headlineText: string;
      sourceCreationTime: number;
    }> = [];
    const seenInRequest = new Set<string>();

    for (const row of args.rows) {
      const dedupeKey = `${row.hashedId}::${row.headlineText}`;
      if (seenInRequest.has(dedupeKey)) {
        continue;
      }
      seenInRequest.add(dedupeKey);

      const existing = await ctx.db
        .query("llmAnalysis")
        .withIndex("by_hashedId_and_headlineText", (q) =>
          q.eq("hashedId", row.hashedId).eq("headlineText", row.headlineText),
        )
        .take(1);

      if (existing.length === 0) {
        missing.push(row);
      }
    }

    return missing;
  },
});

export const getLatestSourceWatermark = query({
  args: {},
  handler: async (ctx) => {
    const latest = await ctx.db
      .query("llmAnalysis")
      .withIndex("by_analyzedAt_and_hashedId")
      .order("desc")
      .take(1);

    const row = latest[0];
    if (!row) {
      return null;
    }

    return row.sourceCreationTime ?? row.analyzedAt;
  },
});

export const saveLlmAnalysisBatch = mutation({
  args: {
    rows: v.array(llmAnalysisRow),
  },
  handler: async (ctx, args) => {
    const analyzedAt = Date.now();
    let inserted = 0;
    let skipped = 0;
    const seenInRequest = new Set<string>();

    for (const row of args.rows) {
      const dedupeKey = `${row.hashedId}::${row.headlineText}`;
      if (seenInRequest.has(dedupeKey)) {
        skipped += 1;
        continue;
      }
      seenInRequest.add(dedupeKey);

      const existing = await ctx.db
        .query("llmAnalysis")
        .withIndex("by_hashedId_and_headlineText", (q) =>
          q.eq("hashedId", row.hashedId).eq("headlineText", row.headlineText),
        )
        .take(1);

      if (existing.length > 0) {
        skipped += 1;
        continue;
      }

      await ctx.db.insert("llmAnalysis", {
        ...row,
        analyzedAt,
      });
      inserted += 1;
    }

    return { inserted, skipped, analyzedAt };
  },
});
