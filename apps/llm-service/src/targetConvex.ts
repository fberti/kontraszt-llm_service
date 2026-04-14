import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import { getEnv } from "./env.ts";

type HeadlineLookupRow = {
  hashedId: string;
  headlineText: string;
};

type LlmAnalysisRow = {
  hashedId: string;
  headlineText: string;
  label: string;
  sentiment: string;
  sentiment_score?: number;
  entities: string[];
  confidence: number;
};

const client = new ConvexHttpClient(getEnv().targetConvexUrl);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableConvexError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Error code 520") ||
    message.includes("convex.cloud") ||
    message.includes("Failed to fetch") ||
    message.includes("fetch failed") ||
    message.includes("network")
  );
}

async function withConvexRetry<T>(operationName: string, fn: () => Promise<T>): Promise<T> {
  const maxAttempts = 4;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryableConvexError(error) || attempt === maxAttempts) {
        throw error;
      }

      const delayMs = 500 * 2 ** (attempt - 1);
      console.warn(
        `${operationName} failed with retryable Convex error on attempt ${attempt}/${maxAttempts}. Retrying in ${delayMs}ms...`,
        error,
      );
      await sleep(delayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function getSyncState(key: string) {
  return await withConvexRetry("getSyncState", async () =>
    client.query(api.sync_state.getSyncState, { key }),
  );
}

export async function startSyncRun(key: string, webhookId?: string) {
  return await withConvexRetry("startSyncRun", async () =>
    client.mutation(api.sync_state.startSyncRun, {
      key,
      ...(webhookId === undefined ? {} : { webhookId }),
    }),
  );
}

export async function finishSyncRun(key: string, sourceCursor?: string | null, error?: string) {
  return await withConvexRetry("finishSyncRun", async () =>
    client.mutation(api.sync_state.finishSyncRun, {
      key,
      ...(sourceCursor === undefined ? {} : { sourceCursor }),
      ...(error === undefined ? {} : { error }),
    }),
  );
}

export async function findMissingHeadlines(rows: HeadlineLookupRow[]) {
  return await withConvexRetry("findMissingHeadlines", async () =>
    client.query(api.llm_analysis.findMissingHeadlines, {
      rows,
    }),
  );
}

export async function saveLlmAnalysisBatch(rows: LlmAnalysisRow[]) {
  return await withConvexRetry("saveLlmAnalysisBatch", async () =>
    client.mutation(api.llm_analysis.saveLlmAnalysisBatch, {
      rows,
    }),
  );
}
