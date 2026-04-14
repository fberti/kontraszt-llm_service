import { getEnv } from "../src/env.ts";
import { fetchHeadlineDefinitionsPage } from "../src/sourceConvex.ts";
import { deleteLlmAnalysisBatch, listLlmAnalysisPage } from "../src/targetConvex.ts";

function pairKey(hashedId: string, headlineText: string) {
  return `${hashedId}::${headlineText}`;
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

async function loadAllSourcePairs(pageSize: number) {
  const pairs = new Set<string>();
  let cursor: string | null = null;

  for (;;) {
    const page = await fetchHeadlineDefinitionsPage(cursor, pageSize);
    for (const row of page.page) {
      if (!row.hashedId?.trim() || !row.headlineText?.trim()) {
        continue;
      }
      pairs.add(pairKey(row.hashedId, row.headlineText));
    }

    if (page.isDone) {
      break;
    }
    cursor = page.continueCursor;
  }

  return pairs;
}

async function loadExtraTargetIds(sourcePairs: Set<string>, pageSize: number) {
  const extraIds: string[] = [];
  let cursor: string | null = null;

  for (;;) {
    const result = await listLlmAnalysisPage(cursor, pageSize);

    for (const row of result.page) {
      const key = pairKey(row.hashedId, row.headlineText);
      if (!sourcePairs.has(key)) {
        extraIds.push(row._id);
      }
    }

    if (result.isDone) {
      break;
    }
    cursor = result.continueCursor;
  }

  return extraIds;
}

const env = getEnv();
const pageSize = Math.max(env.sourcePageSize, 200);
const deleteBatchSize = Math.max(1, Math.min(env.convexSaveBatchSize, 200));
const dryRun = process.argv.includes("--dry-run");

console.log(
  `[cleanup] Starting cleanup with pageSize=${pageSize}, deleteBatchSize=${deleteBatchSize}, dryRun=${dryRun}`,
);

const sourcePairs = await loadAllSourcePairs(pageSize);
console.log(`[cleanup] Loaded source pairs=${sourcePairs.size}`);

const extraIds = await loadExtraTargetIds(sourcePairs, pageSize);
console.log(`[cleanup] Found extra target rows=${extraIds.length}`);

if (extraIds.length === 0) {
  console.log("[cleanup] Nothing to delete.");
  process.exit(0);
}

if (dryRun) {
  console.log(`[cleanup] Dry-run summary: extraTargetRows=${extraIds.length}`);
  console.log(
    JSON.stringify(
      { dryRun: true, extraCount: extraIds.length, sampleIds: extraIds.slice(0, 20) },
      null,
      2,
    ),
  );
  process.exit(0);
}

let deleted = 0;
const chunks = chunkArray(extraIds, deleteBatchSize);
for (const [index, chunk] of chunks.entries()) {
  const result = await deleteLlmAnalysisBatch(chunk);
  deleted += result.deleted;
  console.log(
    `[cleanup] Deleted batch ${index + 1}/${chunks.length}, batchDeleted=${result.deleted}, totalDeleted=${deleted}`,
  );
}

console.log(`[cleanup] Summary: deleted=${deleted}, expected=${extraIds.length}`);
console.log(JSON.stringify({ deleted, expected: extraIds.length }, null, 2));
