import { convexToJson, jsonToConvex } from "convex/values";
import { getEnv } from "./env.ts";
import type { SourceHeadlineDefinitionsPage } from "./sourceTypes.ts";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableSourceConvexError(message: string) {
  return (
    message.includes("Error code 520") ||
    message.includes("convex.cloud") ||
    message.includes("Failed to fetch") ||
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("HTTP 5")
  );
}

export async function fetchHeadlineDefinitionsPage(
  cursor: string | null,
  numItems: number,
): Promise<SourceHeadlineDefinitionsPage> {
  const env = getEnv();
  const sourceBaseUrl = env.sourceConvexUrl.replace(/\/$/, "");
  const maxAttempts = 4;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(`${sourceBaseUrl}/api/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          path: "notebook:listHeadlineDefinitions",
          format: "convex_encoded_json",
          args: [
            convexToJson({
              paginationOpts: {
                cursor,
                numItems,
              },
            }),
          ],
        }),
      });

      const responseText = await response.text();
      if (!response.ok) {
        throw new Error(responseText || `HTTP ${response.status}`);
      }

      const payload = JSON.parse(responseText) as {
        status?: string;
        value?: unknown;
        errorMessage?: string;
        logLines?: string[];
      };

      for (const line of payload.logLines ?? []) {
        console.log(`[source convex] ${line}`);
      }

      if (payload.status !== "success") {
        throw new Error(payload.errorMessage || `Unexpected response: ${responseText}`);
      }

      return jsonToConvex(payload.value) as SourceHeadlineDefinitionsPage;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);

      if (!isRetryableSourceConvexError(message) || attempt === maxAttempts) {
        throw new Error(
          `Failed to fetch source headline definitions from ${sourceBaseUrl}: ${message}`,
        );
      }

      const delayMs = 500 * 2 ** (attempt - 1);
      console.warn(
        `fetchHeadlineDefinitionsPage failed on attempt ${attempt}/${maxAttempts}. Retrying in ${delayMs}ms...`,
        message,
      );
      await sleep(delayMs);
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Failed to fetch source headline definitions from ${sourceBaseUrl}: ${message}`);
}
