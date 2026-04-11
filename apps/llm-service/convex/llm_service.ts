import { query } from "./_generated/server";
import { v } from "convex/values";

const HOUR_MS = 60 * 60 * 1000;

const formatLocalTime = (timestamp: number) =>
  new Date(timestamp).toLocaleString("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

export const getNewHeadlineDefinitionsForLlm = query({
  args: {
    debug: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const latestItems = await ctx.db
      .query("headlineDefinitions")
      .withIndex("by_sourceCreationTime")
      .order("desc")
      .take(1);

    const latestItem = latestItems[0];

    if (!latestItem) {
      if (args.debug) {
        console.log("New headline definitions for LLM: []");
      }
      return [];
    }

    const latestHourStart =
      Math.floor(latestItem.sourceCreationTime / HOUR_MS) * HOUR_MS;

    const detailedResult: Array<{
      hashedId: string;
      headlineText: string;
      sourceCreationTime: string;
    }> = [];

    const itemsInDescendingOrder = ctx.db
      .query("headlineDefinitions")
      .withIndex("by_sourceCreationTime")
      .order("desc");

    for await (const item of itemsInDescendingOrder) {
      if (item.sourceCreationTime < latestHourStart) {
        break;
      }

      detailedResult.push({
        hashedId: item.hashedId,
        headlineText: item.headlineText,
        sourceCreationTime: formatLocalTime(item.sourceCreationTime),
      });
    }

    detailedResult.reverse();

    if (args.debug) {
      console.log(
        "New headline definitions for LLM:\n" +
          JSON.stringify(detailedResult, null, 2),
      );
      return detailedResult;
    }

    return detailedResult.map(({ hashedId, headlineText }) => ({
      hashedId,
      headlineText,
    }));
  },
});
