import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

type Env = {
  port: number;
  sourceConvexUrl: string;
  targetConvexUrl: string;
  webhookSecret: string;
  kiloApiKey: string;
  kiloModel: string;
  sourcePageSize: number;
  maxSourcePagesPerRun: number;
  convexSaveBatchSize: number;
  syncStateKey: string;
};

function loadEnvFile(path: string) {
  if (!existsSync(path)) {
    return;
  }

  const envContent = readFileSync(path, "utf8");
  for (const rawLine of envContent.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const eq = line.indexOf("=");
    if (eq === -1) {
      continue;
    }

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function getRequired(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid numeric environment variable ${name}: ${raw}`);
  }
  return parsed;
}

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (cachedEnv) {
    return cachedEnv;
  }

  const appRoot = resolve(process.cwd());
  const repoRoot = resolve(appRoot, "../..");

  loadEnvFile(join(repoRoot, ".env.local"));
  loadEnvFile(join(appRoot, ".env.local"));

  cachedEnv = {
    port: getNumber("PORT", 3000),
    sourceConvexUrl: getRequired("SOURCE_CONVEX_URL"),
    targetConvexUrl: getRequired("TARGET_CONVEX_URL"),
    webhookSecret: getRequired("WEBHOOK_SECRET"),
    kiloApiKey: getRequired("KILO_API_KEY"),
    kiloModel: getRequired("KILO_MODEL"),
    sourcePageSize: getNumber("SOURCE_PAGE_SIZE", 200),
    maxSourcePagesPerRun: getNumber("MAX_SOURCE_PAGES_PER_RUN", 10),
    convexSaveBatchSize: getNumber("CONVEX_SAVE_BATCH_SIZE", 200),
    syncStateKey: process.env.SYNC_STATE_KEY ?? "source-headline-definitions",
  };

  return cachedEnv;
}
