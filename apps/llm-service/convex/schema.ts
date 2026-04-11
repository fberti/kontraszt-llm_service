import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  headlines: defineTable({
    sourceCreationTime: v.number(),
    hashedId: v.string(),
    fontSize: v.number(),
    height: v.number(),
    score: v.number(),
    scrapedAt: v.number(),
    width: v.number(),
    x: v.number(),
    y: v.number(),
  })
    .index("by_hashedId", ["hashedId"])
    .index("by_scrapedAt_and_hashedId", ["scrapedAt", "hashedId"]),

  headlineDefinitions: defineTable({
    sourceCreationTime: v.number(),
    hashedId: v.string(),
    headlineText: v.string(),
    href: v.string(),
    siteName: v.string(),
  })
    .index("by_hashedId", ["hashedId"])
    .index("by_siteName_and_hashedId", ["siteName", "hashedId"])
    .index("by_sourceCreationTime", ["sourceCreationTime"]),
});
