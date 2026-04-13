import { getEnv } from "./env.ts";

export type LlmAnalysisRow = {
  hashedId: string;
  headlineText: string;
  label: string;
  sentiment: string;
  sentiment_score: number;
  entities: string[];
  confidence: number;
};

type InputHeadline = {
  hashedId: string;
  headlineText: string;
};

type TopicModelItem = {
  headline: string;
  label: string;
  sentiment: string;
  sentiment_score: number;
  entities: string[];
  confidence: number;
};

type TopicModelResponse = {
  items: TopicModelItem[];
};

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
        required: ["headline", "label", "sentiment", "sentiment_score", "entities", "confidence"],
        properties: {
          headline: { type: "string" },
          label: { type: "string" },
          sentiment: { type: "string" },
          sentiment_score: { type: "number" },
          entities: {
            type: "array",
            items: { type: "string" },
          },
          confidence: {
            type: "number",
            minimum: 0,
            maximum: 1,
          },
        },
      },
    },
  },
} as const;

function buildPrompt(headlines: string[]) {
  return `Készíts elemzést a megadott headline-okból, és a választ kizárólag a lenti JSON Schema szerint add vissza.\n\nFontos:\n- Pontosan annyi elemet adj vissza, ahány headline-ot kaptál.\n- A \"headline\" mezőbe az eredeti headline kerüljön változtatás nélkül.\n- Az elemek sorrendje egyezzen meg a bemeneti headline-ok sorrendjével.\n- Az \"entities\" mindig string lista legyen.\n- Minden egyes headline-hoz tartozzon egy \"confidence\" mező is, amely lebegőpontos szám 0 és 1 között.\n- Értékeld a cím hangvételét 0 és 1 közötti pontszámmal (Sentiment Score), ahol a 0 teljesen negatív, az 1 pedig teljesen pozitív.\n- Ne adj vissza magyarázatot, csak érvényes JSON-t.\n\nJSON Schema:\n${JSON.stringify(topicModelSchema, null, 2)}\n\nHeadline-ok:\n${JSON.stringify(headlines, null, 2)}`;
}

function extractCandidateJson(content: string): string {
  const trimmed = content.trim();

  if (trimmed.startsWith("```") && trimmed.endsWith("```")) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1).trim();
  }

  return trimmed;
}

function parseJsonFromModelContent(content: string): TopicModelResponse {
  const candidate = extractCandidateJson(content);

  try {
    return JSON.parse(candidate) as TopicModelResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to parse model JSON: ${message}\nModel content:\n${content.slice(0, 4000)}`,
    );
  }
}

function validateResponse(parsed: TopicModelResponse, headlines: string[]) {
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.items)) {
    throw new Error("LLM response is not a valid object with an items array.");
  }

  if (parsed.items.length !== headlines.length) {
    throw new Error(`LLM returned ${parsed.items.length} items, expected ${headlines.length}.`);
  }

  for (const [index, item] of parsed.items.entries()) {
    if (item.headline !== headlines[index]) {
      console.warn(`LLM changed headline text at index ${index}; source headline will be used.`);
    }
    if (!Array.isArray(item.entities)) {
      throw new Error(`Invalid entities at index ${index}.`);
    }
    if (typeof item.confidence !== "number" || item.confidence < 0 || item.confidence > 1) {
      throw new Error(`Invalid confidence at index ${index}.`);
    }
  }
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

async function requestTopicModel(
  apiKey: string,
  model: string,
  headlines: string[],
): Promise<TopicModelResponse> {
  const prompt = buildPrompt(headlines);
  const maxAttempts = 3;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
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
                "Te egy precíz magyar nyelvű médiaszöveg-elemző vagy. Mindig kizárólag érvényes JSON-t adsz vissza.",
            },
            { role: "user", content: prompt },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "topic_model_response",
              strict: true,
              schema: topicModelSchema,
            },
          },
          temperature: 0.2,
        }),
      });

      const responseText = await response.text();

      if (!response.ok) {
        throw new Error(
          `Kilo API request failed: ${response.status} ${response.statusText}\n${responseText}`,
        );
      }

      if (!responseText.trim()) {
        throw new Error("Kilo API returned an empty response body.");
      }

      let responseJson: {
        choices?: Array<{ message?: { content?: string } }>;
      };

      try {
        responseJson = JSON.parse(responseText) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Failed to parse Kilo API HTTP response JSON: ${message}\nResponse body:\n${responseText.slice(0, 4000)}`,
        );
      }

      const content = responseJson.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error(
          `Kilo API response did not contain message content. Response body:\n${responseText.slice(0, 4000)}`,
        );
      }

      const parsed = parseJsonFromModelContent(content);
      validateResponse(parsed, headlines);
      return parsed;
    } catch (error) {
      lastError = error;
      console.warn(`Topic model attempt ${attempt}/${maxAttempts} failed:`, error);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function analyzeHeadlines(input: InputHeadline[]): Promise<LlmAnalysisRow[]> {
  if (input.length === 0) {
    return [];
  }

  const env = getEnv();
  const chunks = chunkArray(input, 20);
  const output: LlmAnalysisRow[] = [];

  for (const [chunkIndex, chunk] of chunks.entries()) {
    console.log(`Analyzing chunk ${chunkIndex + 1}/${chunks.length} (${chunk.length} headlines)`);

    const headlines = chunk.map((item) => item.headlineText);
    const parsed = await requestTopicModel(env.kiloApiKey, env.kiloModel, headlines);

    const mapped = parsed.items.map((item, index) => ({
      hashedId: chunk[index]!.hashedId,
      headlineText: chunk[index]!.headlineText,
      label: item.label,
      sentiment: item.sentiment,
      sentiment_score: item.sentiment_score,
      entities: item.entities,
      confidence: item.confidence,
    }));

    output.push(...mapped);
  }

  return output;
}
