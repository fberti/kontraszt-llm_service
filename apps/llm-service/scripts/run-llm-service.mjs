import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const debug = process.argv.includes("--debug");
const payload = debug ? { debug: true } : {};
const outputDir = join(process.cwd(), "temp");
const outputPath = join(outputDir, "getNewHeadlineDefinitionsForLlm.json");

const result = spawnSync(
  "vp",
  [
    "exec",
    "convex",
    "run",
    "llm_service:getNewHeadlineDefinitionsForLlm",
    JSON.stringify(payload),
  ],
  {
    encoding: "utf8",
    stdio: "pipe",
  },
);

if (result.error) {
  throw result.error;
}

if (result.stdout) {
  process.stdout.write(result.stdout);
}

if (result.stderr) {
  process.stderr.write(result.stderr);
}

if ((result.status ?? 1) === 0) {
  mkdirSync(outputDir, { recursive: true });

  const rawOutput = result.stdout.trim();

  try {
    const parsed = JSON.parse(rawOutput);
    writeFileSync(outputPath, JSON.stringify(parsed, null, 2) + "\n");
  } catch {
    writeFileSync(outputPath, rawOutput + "\n");
  }

  console.error(`Saved JSON output to ${outputPath}`);

  const callLlmResult = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      join(process.cwd(), "scripts", "call_llm.ts"),
      outputPath,
    ],
    {
      encoding: "utf8",
      stdio: "pipe",
    },
  );

  if (callLlmResult.error) {
    throw callLlmResult.error;
  }

  if (callLlmResult.stdout) {
    process.stdout.write(callLlmResult.stdout);
  }

  if (callLlmResult.stderr) {
    process.stderr.write(callLlmResult.stderr);
  }

  if ((callLlmResult.status ?? 1) !== 0) {
    process.exit(callLlmResult.status ?? 1);
  }
}

process.exit(result.status ?? 0);
