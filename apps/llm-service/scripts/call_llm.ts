import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type InputHeadline = {
  hashedId?: string;
  headlineText: string;
  sourceCreationTime?: string;
};

type TopicModelItem = {
  headline: string;
  label: string;
  sentiment: string;
  entities: string[];
  confidence: number;
};

type TopicModelResponse = {
  items: TopicModelItem[];
};

type MappedTopicModelItem = InputHeadline & {
  label: string;
  sentiment: string;
  entities: string[];
  confidence: number;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appRoot = resolve(__dirname, "..");
const repoRoot = resolve(appRoot, "../..");
const tempDir = join(appRoot, "temp");
const dataDir = join(repoRoot, "data");
const defaultInputPath = join(tempDir, "getNewHeadlineDefinitionsForLlm.json");
const defaultOutputPath = join(dataDir, "headline_topic_analysis.json");

const topicModelSchema = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["headline", "label", "sentiment", "entities", "confidence"],
        properties: {
          headline: { type: "string" },
          label: { type: "string" },
          sentiment: { type: "string" },
          entities: {
            type: "array",
            items: { type: "string" },
          },
          confidence: {
            type: "number",
            minimum: 0,
            maximum: 1,
            description:
              "Confidence for this specific headline's modelling output.",
          },
        },
      },
    },
  },
} as const;

function loadEnvFile(envPath: string) {
  if (!existsSync(envPath)) {
    return;
  }

  const envContent = readFileSync(envPath, "utf8");
  for (const rawLine of envContent.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();

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

function buildPrompt(headlines: string[]) {
  return `Készíts topic modelling analízist az alábbi táblázat mintájára:
    Headline (Cím), Elsődleges téma (Label), Érzelem (Sentiment), Kulcsfogalmak (Entities)
    """...gigasorok a benzinkutaknál...""", Energiaválság / Háborús gazdaság, Negatív / Riasztó, "Irán, üzemanyaghiány"
    """...szívettépően zokogni kezdett...""", Társadalmi hatás / Mentális egészség, Erősen negatív / Empatikus, "háziorvos, szorongás"
    """...Gazdasági Hirosimát szabadítana...""", Belpolitika / Kampányretorika, Agresszív / Kritikus, "Tisza párt, energia"

    Készíts elemzést a megadott headline-okból, és a választ kizárólag a lenti JSON Schema szerint add vissza.

    Fontos:
    - Pontosan annyi elemet adj vissza, ahány headline-ot kaptál.
    - A "headline" mezőbe az eredeti headline kerüljön változtatás nélkül.
    - Az elemek sorrendje egyezzen meg a bemeneti headline-ok sorrendjével.
    - Az "entities" mindig string lista legyen.
    - Minden egyes headline-hoz tartozzon egy "confidence" mező is, amely lebegőpontos szám 0 és 1 között.
    - Ez a "confidence" az adott headline egyedi besorolására vonatkozó bizonyosságot mutassa: mennyire vagy magabiztos az adott címhez rendelt topic, sentiment és entities minőségében.
    - Ne adj vissza magyarázatot, csak érvényes JSON-t.

    JSON Schema:
    ${JSON.stringify(topicModelSchema, null, 2)}

    Headline-ok:
    ${JSON.stringify(headlines, null, 2)}
    `;
}

function parseJsonFromModelContent(content: string): TopicModelResponse {
  const trimmed = content.trim();

  if (trimmed.startsWith("```") && trimmed.endsWith("```")) {
    const withoutFence = trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    return JSON.parse(withoutFence) as TopicModelResponse;
  }

  return JSON.parse(trimmed) as TopicModelResponse;
}

function validateResponse(parsed: TopicModelResponse, headlines: string[]) {
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.items)) {
    throw new Error("LLM response is not a valid object with an items array.");
  }

  if (parsed.items.length !== headlines.length) {
    throw new Error(
      `LLM returned ${parsed.items.length} items, expected ${headlines.length}.`,
    );
  }

  for (const [index, item] of parsed.items.entries()) {
    if (!item || typeof item !== "object") {
      throw new Error(`LLM item at index ${index} is not an object.`);
    }

    if (typeof item.headline !== "string" || !item.headline.trim()) {
      throw new Error(`LLM item at index ${index} has an invalid headline.`);
    }

    if (item.headline !== headlines[index]) {
      console.warn(
        `Warning: LLM item at index ${index} changed the headline text. Using source headline instead.`,
      );
    }

    if (typeof item.label !== "string" || !item.label.trim()) {
      throw new Error(`LLM item at index ${index} has an invalid label.`);
    }

    if (typeof item.sentiment !== "string" || !item.sentiment.trim()) {
      throw new Error(`LLM item at index ${index} has an invalid sentiment.`);
    }

    if (!Array.isArray(item.entities) || !item.entities.every((value) => typeof value === "string")) {
      throw new Error(`LLM item at index ${index} has invalid entities.`);
    }

    if (typeof item.confidence !== "number" || item.confidence < 0 || item.confidence > 1) {
      throw new Error(`LLM item at index ${index} has invalid confidence.`);
    }
  }
}

function cleanupTempDirectory() {
  if (!existsSync(tempDir)) {
    return;
  }

  for (const entry of readdirSync(tempDir)) {
    rmSync(join(tempDir, entry), { recursive: true, force: true });
  }
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

async function requestTopicModel(
  apiKey: string,
  model: string,
  headlines: string[],
): Promise<TopicModelResponse> {
  const prompt = buildPrompt(headlines);

  const response = await fetch("https://api.kilo.ai/api/gateway/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "Te egy precíz magyar nyelvű médiaszöveg-elemző vagy. Mindig kizárólag érvényes JSON-t adsz vissza, amely megfelel a felhasználó által adott JSON Schema-nak. A confidence mező minden headline esetén az adott címhez tartozó topic, sentiment és entities besorolásának bizonyosságát jelentse 0 és 1 között.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Kilo API request failed: ${response.status} ${response.statusText}\n${errorText}`);
  }

  const responseJson = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  const content = responseJson.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Kilo API response did not contain choices[0].message.content.");
  }

  const parsed = parseJsonFromModelContent(content);
  validateResponse(parsed, headlines);
  return parsed;
}

async function main() {
  loadEnvFile(join(repoRoot, ".env.local"));

  const inputPath = process.argv[2] ? resolve(process.argv[2]) : defaultInputPath;
  const outputPath = process.argv[3] ? resolve(process.argv[3]) : defaultOutputPath;

  const apiKey = process.env.KILO_API;
  if (!apiKey) {
    throw new Error("Missing KILO_API in the repo root .env.local file.");
  }

  const model = process.env.KILO_MODEL;
  if (!model) {
    throw new Error("Missing KILO_MODEL in the repo root .env.local file.");
  }

  const input = JSON.parse(readFileSync(inputPath, "utf8")) as InputHeadline[];
  const headlines = input.map((item) => item.headlineText);

  if (headlines.length === 0) {
    throw new Error(`No headlineText values found in ${inputPath}.`);
  }

  const batchSizeRaw = process.env.KILO_BATCH_SIZE ?? "30";
  const batchSize = Number.parseInt(batchSizeRaw, 10);
  if (!Number.isFinite(batchSize) || batchSize <= 0) {
    throw new Error(`Invalid KILO_BATCH_SIZE: ${batchSizeRaw}`);
  }

  const inputChunks = chunkArray(input, batchSize);
  const mappedItems: MappedTopicModelItem[] = [];

  for (const [chunkIndex, chunk] of inputChunks.entries()) {
    const chunkHeadlines = chunk.map((item) => item.headlineText);
    console.log(
      `Calling Kilo for batch ${chunkIndex + 1}/${inputChunks.length} (${chunk.length} headlines)`,
    );

    const parsed = await requestTopicModel(apiKey, model, chunkHeadlines);

    mappedItems.push(
      ...chunk.map((sourceRow, index) => ({
        ...sourceRow,
        label: parsed.items[index].label,
        sentiment: parsed.items[index].sentiment,
        entities: parsed.items[index].entities,
        confidence: parsed.items[index].confidence,
      })),
    );
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(mappedItems, null, 2) + "\n");

  cleanupTempDirectory();

  console.log(`Saved mapped LLM analysis to ${outputPath}`);
  console.log(`Cleaned up temp directory ${tempDir}`);
}

await main();
