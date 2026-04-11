import { analyzeHeadlines } from "./analyzeHeadlines.ts";
import { getEnv } from "./env.ts";
import { saveLlmAnalysis } from "./saveLlmAnalysis.ts";
import { fetchHeadlineDefinitionsPage } from "./sourceConvex.ts";
import type { LlmInputHeadline, SourceHeadlineDefinition } from "./sourceTypes.ts";
import { finishSyncRun, getSyncState, startSyncRun } from "./targetConvex.ts";

export type RunSyncResult = {
  status: "success" | "ignored" | "failed";
  reason?: string;
  fetchedCount: number;
  analyzedCount: number;
  inserted: number;
  skipped: number;
  nextCursor: string | null;
};

function dedupeHeadlines(rows: SourceHeadlineDefinition[]): LlmInputHeadline[] {
  const seen = new Set<string>();
  const output: LlmInputHeadline[] = [];

  for (const row of rows) {
    const key = `${row.hashedId}::${row.headlineText}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    if (!row.hashedId?.trim() || !row.headlineText?.trim()) {
      continue;
    }

    output.push({
      hashedId: row.hashedId,
      headlineText: row.headlineText,
    });
  }

  return output;
}

export async function runSync(options?: {
  webhookId?: string;
  debug?: boolean;
}): Promise<RunSyncResult> {
  const env = getEnv();
  const key = env.syncStateKey;

  const lock = await startSyncRun(key, options?.webhookId);
  if (!lock.started) {
    return {
      status: "ignored",
      reason: "already_running",
      fetchedCount: 0,
      analyzedCount: 0,
      inserted: 0,
      skipped: 0,
      nextCursor: null,
    };
  }

  try {
    const state = await getSyncState(key);
    let cursor = state?.sourceCursor ?? null;
    let latestCursor = cursor;

    const fetchedRows: SourceHeadlineDefinition[] = [];

    for (let pageIndex = 0; pageIndex < env.maxSourcePagesPerRun; pageIndex += 1) {
      const page = await fetchHeadlineDefinitionsPage(cursor, env.sourcePageSize);

      fetchedRows.push(...page.page);
      latestCursor = page.continueCursor;

      console.log(
        `Fetched source page ${pageIndex + 1}: ${page.page.length} rows, isDone=${page.isDone}`,
      );

      if (page.isDone) {
        break;
      }

      cursor = page.continueCursor;
    }

    const inputRows = dedupeHeadlines(fetchedRows);

    if (inputRows.length === 0) {
      await finishSyncRun(key, latestCursor);
      return {
        status: "success",
        fetchedCount: 0,
        analyzedCount: 0,
        inserted: 0,
        skipped: 0,
        nextCursor: latestCursor,
      };
    }

    const analyzedRows = await analyzeHeadlines(inputRows);
    const saved = await saveLlmAnalysis(analyzedRows);

    await finishSyncRun(key, latestCursor);

    return {
      status: "success",
      fetchedCount: inputRows.length,
      analyzedCount: analyzedRows.length,
      inserted: saved.inserted,
      skipped: saved.skipped,
      nextCursor: latestCursor,
    };
  } catch (error) {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    await finishSyncRun(key, undefined, message);

    return {
      status: "failed",
      reason: message,
      fetchedCount: 0,
      analyzedCount: 0,
      inserted: 0,
      skipped: 0,
      nextCursor: null,
    };
  }
}
