import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getSyncState = query({
  args: {
    key: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("syncState")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
  },
});

export const startSyncRun = mutation({
  args: {
    key: v.string(),
    webhookId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const existing = await ctx.db
      .query("syncState")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();

    if (!existing) {
      const stateId = await ctx.db.insert("syncState", {
        key: args.key,
        sourceCursor: null,
        isRunning: true,
        lastRunStartedAt: now,
        ...(args.webhookId ? { lastWebhookId: args.webhookId } : {}),
        updatedAt: now,
      });

      return {
        started: true,
        reason: null,
        stateId,
      };
    }

    if (existing.isRunning) {
      return {
        started: false,
        reason: "already_running",
        stateId: existing._id,
      };
    }

    await ctx.db.patch(existing._id, {
      isRunning: true,
      lastRunStartedAt: now,
      ...(args.webhookId ? { lastWebhookId: args.webhookId } : {}),
      updatedAt: now,
    });

    return {
      started: true,
      reason: null,
      stateId: existing._id,
    };
  },
});

export const finishSyncRun = mutation({
  args: {
    key: v.string(),
    sourceCursor: v.optional(v.union(v.string(), v.null())),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const existing = await ctx.db
      .query("syncState")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();

    if (!existing) {
      throw new Error(`Sync state not found for key: ${args.key}`);
    }

    if (args.error) {
      await ctx.db.replace(existing._id, {
        key: existing.key,
        sourceCursor: existing.sourceCursor,
        isRunning: false,
        ...(existing.lastRunStartedAt ? { lastRunStartedAt: existing.lastRunStartedAt } : {}),
        lastRunFinishedAt: now,
        ...(existing.lastWebhookId ? { lastWebhookId: existing.lastWebhookId } : {}),
        lastError: args.error,
        updatedAt: now,
      });

      return { ok: true, updated: "error" };
    }

    await ctx.db.replace(existing._id, {
      key: existing.key,
      sourceCursor: args.sourceCursor === undefined ? existing.sourceCursor : args.sourceCursor,
      isRunning: false,
      ...(existing.lastRunStartedAt ? { lastRunStartedAt: existing.lastRunStartedAt } : {}),
      lastRunFinishedAt: now,
      ...(existing.lastWebhookId ? { lastWebhookId: existing.lastWebhookId } : {}),
      updatedAt: now,
    });

    return { ok: true, updated: "success" };
  },
});

export const resetSyncLock = mutation({
  args: {
    key: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("syncState")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();

    if (!existing) {
      return { ok: true, reset: false };
    }

    await ctx.db.patch(existing._id, {
      isRunning: false,
      updatedAt: Date.now(),
    });

    return { ok: true, reset: true };
  },
});
