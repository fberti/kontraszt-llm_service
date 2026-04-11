import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  llmAnalysis: defineTable({
    hashedId: v.string(),
    headlineText: v.string(),
    label: v.string(),
    sentiment: v.string(),
    sentiment_score: v.optional(v.number()),
    entities: v.array(v.string()),
    confidence: v.number(),
    analyzedAt: v.number(),
  })
    .index("by_hashedId", ["hashedId"])
    .index("by_hashedId_and_headlineText", ["hashedId", "headlineText"])
    .index("by_analyzedAt_and_hashedId", ["analyzedAt", "hashedId"]),

  syncState: defineTable({
    key: v.string(),
    sourceCursor: v.union(v.string(), v.null()),
    isRunning: v.boolean(),
    lastRunStartedAt: v.optional(v.number()),
    lastRunFinishedAt: v.optional(v.number()),
    lastWebhookId: v.optional(v.string()),
    lastError: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),
});
