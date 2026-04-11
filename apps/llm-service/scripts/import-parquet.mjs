import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const parquetPathArg = process.argv[2];
const batchSizeArg = process.argv[3];
const batchSize = batchSizeArg ? Number(batchSizeArg) : 200;

if (!parquetPathArg) {
  console.error(
    "Usage: node scripts/import-parquet.mjs <path-to-parquet> [batchSize]",
  );
  process.exit(1);
}

if (!Number.isInteger(batchSize) || batchSize <= 0) {
  console.error(`Invalid batch size: ${batchSizeArg}`);
  process.exit(1);
}

function readEnvFile(filePath) {
  const env = {};
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) continue;
    const key = line.slice(0, equalsIndex).trim();
    const value = line.slice(equalsIndex + 1).trim();
    env[key] = value;
  }
  return env;
}

const envPath = path.join(projectRoot, ".env.local");
if (!fs.existsSync(envPath)) {
  console.error(`Missing ${envPath}. Run 'vp exec convex dev' first.`);
  process.exit(1);
}

const env = readEnvFile(envPath);
const convexUrl = env.CONVEX_URL ?? env.VITE_CONVEX_URL;
if (!convexUrl) {
  console.error(`Expected CONVEX_URL or VITE_CONVEX_URL in ${envPath}`);
  process.exit(1);
}

const parquetPath = path.resolve(projectRoot, parquetPathArg);
if (!fs.existsSync(parquetPath)) {
  console.error(`Parquet file not found: ${parquetPath}`);
  process.exit(1);
}

const tempDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "convex-parquet-import-"),
);
const splitScriptPath = path.join(projectRoot, "scripts", "split_parquet.py");

const split = spawnSync(
  "uv",
  ["run", "--with", "pyarrow", "python", splitScriptPath, parquetPath, tempDir],
  {
    cwd: projectRoot,
    stdio: "inherit",
  },
);

if (split.status !== 0) {
  process.exit(split.status ?? 1);
}

const convex = new ConvexHttpClient(convexUrl);

async function importJsonl({ filePath, label, upload }) {
  const stream = fs.createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let buffer = [];
  let total = 0;
  let batchNumber = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    if (typeof row._creationTime === "number") {
      row.sourceCreationTime = row._creationTime;
      delete row._creationTime;
    }
    buffer.push(row);

    if (buffer.length >= batchSize) {
      batchNumber += 1;
      const result = await upload(buffer);
      total += result.inserted;
      console.log(
        `${label}: batch ${batchNumber} imported (${total} rows total)`,
      );
      buffer = [];
    }
  }

  if (buffer.length > 0) {
    batchNumber += 1;
    const result = await upload(buffer);
    total += result.inserted;
    console.log(
      `${label}: batch ${batchNumber} imported (${total} rows total)`,
    );
  }

  return total;
}

try {
  const headlineCount = await importJsonl({
    filePath: path.join(tempDir, "headlines.jsonl"),
    label: "headlines",
    upload: (rows) =>
      convex.mutation(api.imports.importHeadlinesBatch, { rows }),
  });

  const headlineDefinitionCount = await importJsonl({
    filePath: path.join(tempDir, "headlineDefinitions.jsonl"),
    label: "headlineDefinitions",
    upload: (rows) =>
      convex.mutation(api.imports.importHeadlineDefinitionsBatch, { rows }),
  });

  console.log(
    JSON.stringify(
      {
        imported: {
          headlines: headlineCount,
          headlineDefinitions: headlineDefinitionCount,
        },
      },
      null,
      2,
    ),
  );
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
