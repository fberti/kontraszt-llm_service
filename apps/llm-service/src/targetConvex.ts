import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import { getEnv } from "./env.ts";

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

export async function getSyncState(key: string) {
  return await client.query(api.sync_state.getSyncState, { key });
}

export async function startSyncRun(key: string, webhookId?: string) {
  return await client.mutation(api.sync_state.startSyncRun, {
    key,
    ...(webhookId === undefined ? {} : { webhookId }),
  });
}

export async function finishSyncRun(key: string, sourceCursor?: string | null, error?: string) {
  return await client.mutation(api.sync_state.finishSyncRun, {
    key,
    ...(sourceCursor === undefined ? {} : { sourceCursor }),
    ...(error === undefined ? {} : { error }),
  });
}

export async function saveLlmAnalysisBatch(rows: LlmAnalysisRow[]) {
  return await client.mutation(api.llm_analysis.saveLlmAnalysisBatch, {
    rows,
  });
}
