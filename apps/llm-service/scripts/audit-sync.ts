import { getEnv } from "../src/env.ts";
import { fetchHeadlineDefinitionsPage } from "../src/sourceConvex.ts";
import { listLlmAnalysisPage } from "../src/targetConvex.ts";

type PairStats = {
  count: number;
  hashedId: string;
  headlineText: string;
};

function pairKey(hashedId: string, headlineText: string) {
  return `${hashedId}::${headlineText}`;
}

async function loadAllSourcePairs(pageSize: number) {
  const pairs = new Set<string>();
  let rawCount = 0;
  let invalidCount = 0;
  let duplicateCount = 0;
  let cursor: string | null = null;
  let pages = 0;

  for (;;) {
    const page = await fetchHeadlineDefinitionsPage(cursor, pageSize);
    pages += 1;
    rawCount += page.page.length;

    for (const row of page.page) {
      if (!row.hashedId?.trim() || !row.headlineText?.trim()) {
        invalidCount += 1;
        continue;
      }

      const key = pairKey(row.hashedId, row.headlineText);
      if (pairs.has(key)) {
        duplicateCount += 1;
        continue;
      }
      pairs.add(key);
    }

    if (page.isDone) {
      break;
    }
    cursor = page.continueCursor;
  }

  return {
    pages,
    rawCount,
    invalidCount,
    duplicateCount,
    uniqueValidCount: pairs.size,
    pairs,
  };
}

async function loadAllTargetPairs(pageSize: number) {
  const pairCounts = new Map<string, PairStats>();
  let rawCount = 0;
  let cursor: string | null = null;
  let pages = 0;

  for (;;) {
    const result = await listLlmAnalysisPage(cursor, pageSize);
    pages += 1;
    rawCount += result.page.length;

    for (const row of result.page) {
      const key = pairKey(row.hashedId, row.headlineText);
      const existing = pairCounts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        pairCounts.set(key, {
          count: 1,
          hashedId: row.hashedId,
          headlineText: row.headlineText,
        });
      }
    }

    if (result.isDone) {
      break;
    }
    cursor = result.continueCursor;
  }

  const duplicatePairs = [...pairCounts.values()]
    .filter((row) => row.count > 1)
    .sort((a, b) => b.count - a.count || a.hashedId.localeCompare(b.hashedId));

  return {
    pages,
    rawCount,
    uniqueCount: pairCounts.size,
    duplicateDocumentCount: rawCount - pairCounts.size,
    duplicatePairs,
    pairs: new Set(pairCounts.keys()),
  };
}

function sampleSorted(values: Iterable<string>, limit: number) {
  return [...values].sort().slice(0, limit);
}

const env = getEnv();
const pageSize = Math.max(env.sourcePageSize, 200);

console.log(`[audit] Starting audit with pageSize=${pageSize}`);

const source = await loadAllSourcePairs(pageSize);
console.log(
  `[audit] Source scanned: pages=${source.pages}, raw=${source.rawCount}, invalid=${source.invalidCount}, duplicateValid=${source.duplicateCount}, uniqueValid=${source.uniqueValidCount}`,
);

const target = await loadAllTargetPairs(pageSize);
console.log(
  `[audit] Target scanned: pages=${target.pages}, raw=${target.rawCount}, uniquePairs=${target.uniqueCount}, duplicateDocuments=${target.duplicateDocumentCount}`,
);

const missingInTarget = new Set<string>();
for (const key of source.pairs) {
  if (!target.pairs.has(key)) {
    missingInTarget.add(key);
  }
}

const extraInTarget = new Set<string>();
for (const key of target.pairs) {
  if (!source.pairs.has(key)) {
    extraInTarget.add(key);
  }
}

const report = {
  source: {
    pages: source.pages,
    rawCount: source.rawCount,
    invalidCount: source.invalidCount,
    duplicateValidCount: source.duplicateCount,
    uniqueValidCount: source.uniqueValidCount,
  },
  target: {
    pages: target.pages,
    rawCount: target.rawCount,
    uniquePairCount: target.uniqueCount,
    duplicateDocumentCount: target.duplicateDocumentCount,
  },
  diff: {
    missingInTargetCount: missingInTarget.size,
    extraInTargetCount: extraInTarget.size,
    targetDuplicatePairCount: target.duplicatePairs.length,
    missingInTargetSample: sampleSorted(missingInTarget, 20),
    extraInTargetSample: sampleSorted(extraInTarget, 20),
    targetDuplicatePairSample: target.duplicatePairs.slice(0, 20),
  },
};

console.log(
  `[audit] Summary: sourceUnique=${report.source.uniqueValidCount}, targetUnique=${report.target.uniquePairCount}, missingInTarget=${report.diff.missingInTargetCount}, extraInTarget=${report.diff.extraInTargetCount}, targetDuplicatePairs=${report.diff.targetDuplicatePairCount}`,
);
console.log(JSON.stringify(report, null, 2));
