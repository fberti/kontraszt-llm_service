import { getEnv } from "./env.ts";
import type { LlmAnalysisRow } from "./analyzeHeadlines.ts";
import { saveLlmAnalysisBatch } from "./targetConvex.ts";

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

export async function saveLlmAnalysis(rows: LlmAnalysisRow[]) {
  if (rows.length === 0) {
    return { inserted: 0, skipped: 0 };
  }

  const env = getEnv();
  const chunks = chunkArray(rows, env.convexSaveBatchSize);

  let inserted = 0;
  let skipped = 0;

  for (const [chunkIndex, chunk] of chunks.entries()) {
    const result = await saveLlmAnalysisBatch(chunk);
    inserted += result.inserted;
    skipped += result.skipped;

    console.log(
      `Saved batch ${chunkIndex + 1}/${chunks.length} (inserted: ${inserted}, skipped: ${skipped})`,
    );
  }

  return { inserted, skipped };
}
