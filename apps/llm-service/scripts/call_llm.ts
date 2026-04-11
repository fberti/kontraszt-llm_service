import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { analyzeHeadlines } from "../src/analyzeHeadlines.ts";

const inputPath = process.argv[2];
if (!inputPath) {
  throw new Error("Usage: node --experimental-strip-types scripts/call_llm.ts <input.json>");
}

const input = JSON.parse(readFileSync(resolve(inputPath), "utf8")) as Array<{
  hashedId: string;
  headlineText: string;
}>;

const result = await analyzeHeadlines(input);
console.log(JSON.stringify(result, null, 2));
