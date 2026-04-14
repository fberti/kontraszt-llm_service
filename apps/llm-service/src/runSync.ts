import { analyzeHeadlines } from "./analyzeHeadlines.ts";
import { getEnv } from "./env.ts";
import { saveLlmAnalysis } from "./saveLlmAnalysis.ts";
import { fetchHeadlineDefinitionsPage } from "./sourceConvex.ts";
import type { LlmInputHeadline, SourceHeadlineDefinition } from "./sourceTypes.ts";
import {
  findMissingHeadlines,
  finishSyncRun,
  getLatestSourceWatermark,
  getSyncState,
  startSyncRun,
} from "./targetConvex.ts";

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
      sourceCreationTime: row._creationTime,
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

  console.log(
    `[runSync] Starting sync. key=${key}, webhookId=${options?.webhookId ?? "n/a"}, sourcePageSize=${env.sourcePageSize}, maxSourcePagesPerRun=${env.maxSourcePagesPerRun}, convexSaveBatchSize=${env.convexSaveBatchSize}, fullBackfill=${env.fullBackfill}`,
  );

  console.log("[runSync] Acquiring sync lock...");
  const lock = await startSyncRun(key, options?.webhookId);
  if (!lock.started) {
    console.log(`[runSync] Sync ignored. reason=${lock.reason ?? "unknown"}`);
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

  console.log(`[runSync] Sync lock acquired. stateId=${String(lock.stateId)}`);

  try {
    console.log("[runSync] Loading current sync state from target Convex...");
    const state = await getSyncState(key);
    let cursor: string | null = null;
    let totalFetched = 0;
    const seenAcrossPages = new Set<string>();
    const inputRows: LlmInputHeadline[] = [];
    const sourceWatermark = await getLatestSourceWatermark();

    console.log(
      `[runSync] Loaded sync state. previousCursor=${state?.sourceCursor ?? "null"}, isRunning=${state?.isRunning ?? false}`,
    );
    console.log(
      `[runSync] Using source watermark=${sourceWatermark ?? "null"}. Only source headlines newer than this watermark will be considered for analysis unless FULL_BACKFILL is enabled.`,
    );

    if (env.fullBackfill) {
      console.log(
        "[runSync] FULL_BACKFILL is enabled. The sync will scan until source pagination isDone=true and backfill any missing llmAnalysis rows regardless of watermark.",
      );
    }

    console.log("[runSync] Fetching source pages from source Convex...");
    for (let pageIndex = 0; pageIndex < env.maxSourcePagesPerRun; pageIndex += 1) {
      console.log(
        `[runSync] Fetching source page ${pageIndex + 1}/${env.maxSourcePagesPerRun} with cursor=${cursor ?? "null"}`,
      );

      const page = await fetchHeadlineDefinitionsPage(cursor, env.sourcePageSize);
      totalFetched += page.page.length;

      const dedupedPageRows = dedupeHeadlines(page.page);
      const candidateRows =
        env.fullBackfill || sourceWatermark === null
          ? dedupedPageRows
          : dedupedPageRows.filter((row) => row.sourceCreationTime > sourceWatermark);
      const crossedWatermark =
        !env.fullBackfill &&
        sourceWatermark !== null &&
        dedupedPageRows.some((row) => row.sourceCreationTime <= sourceWatermark);
      const missingRows = await findMissingHeadlines(candidateRows);

      let addedFromPage = 0;
      for (const row of missingRows) {
        const key = `${row.hashedId}::${row.headlineText}`;
        if (seenAcrossPages.has(key)) {
          continue;
        }
        seenAcrossPages.add(key);
        inputRows.push(row);
        addedFromPage += 1;
      }

      console.log(
        `[runSync] Fetched source page ${pageIndex + 1}: rawRows=${page.page.length}, dedupedRows=${dedupedPageRows.length}, candidateRows=${candidateRows.length}, missingRows=${missingRows.length}, addedFromPage=${addedFromPage}, totalFetched=${totalFetched}, totalPendingAnalysis=${inputRows.length}, crossedWatermark=${crossedWatermark}, isDone=${page.isDone}, nextCursor=${page.continueCursor ?? "null"}`,
      );

      if (page.isDone) {
        console.log(`[runSync] Source pagination completed after ${pageIndex + 1} page(s).`);
        break;
      }

      if (crossedWatermark) {
        console.log(
          `[runSync] Stopping after page ${pageIndex + 1} because source rows are no longer newer than watermark=${sourceWatermark}.`,
        );
        break;
      }

      cursor = page.continueCursor;
    }

    if (inputRows.length === 0) {
      console.log("[runSync] No unanalyzed input rows found. Finalizing sync state only...");
      await finishSyncRun(key, null);
      console.log("[runSync] Sync finished successfully with no work. nextCursor=null");
      return {
        status: "success",
        fetchedCount: totalFetched,
        analyzedCount: 0,
        inserted: 0,
        skipped: 0,
        nextCursor: null,
      };
    }

    console.log(`[runSync] Sending ${inputRows.length} missing rows to headline analysis...`);
    const analyzedRows = await analyzeHeadlines(inputRows);
    console.log(`[runSync] Headline analysis completed. analyzedRows=${analyzedRows.length}`);

    console.log(`[runSync] Saving ${analyzedRows.length} analyzed rows to target Convex...`);
    const saved = await saveLlmAnalysis(analyzedRows);
    console.log(`[runSync] Save completed. inserted=${saved.inserted}, skipped=${saved.skipped}`);

    console.log("[runSync] Finalizing sync state with nextCursor=null...");
    await finishSyncRun(key, null);
    console.log("[runSync] Sync completed successfully.");

    return {
      status: "success",
      fetchedCount: totalFetched,
      analyzedCount: analyzedRows.length,
      inserted: saved.inserted,
      skipped: saved.skipped,
      nextCursor: null,
    };
  } catch (error) {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    console.error("[runSync] Sync failed. Attempting to persist error state...", error);
    await finishSyncRun(key, undefined, message);
    console.error("[runSync] Error state persisted to syncState.lastError.");

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
