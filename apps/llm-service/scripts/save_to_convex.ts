import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { saveLlmAnalysis } from "../src/saveLlmAnalysis.ts";

const inputPath = process.argv[2];
if (!inputPath) {
  throw new Error("Usage: node --experimental-strip-types scripts/save_to_convex.ts <input.json>");
}

const rows = JSON.parse(readFileSync(resolve(inputPath), "utf8"));
const result = await saveLlmAnalysis(rows);

console.log(JSON.stringify(result, null, 2));
