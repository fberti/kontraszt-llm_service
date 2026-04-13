import { convexToJson, jsonToConvex } from "convex/values";
import { getEnv } from "./env.ts";
import type { SourceHeadlineDefinitionsPage } from "./sourceTypes.ts";

export async function fetchHeadlineDefinitionsPage(
  cursor: string | null,
  numItems: number,
): Promise<SourceHeadlineDefinitionsPage> {
  const env = getEnv();
  const sourceBaseUrl = env.sourceConvexUrl.replace(/\/$/, "");

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
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to fetch source headline definitions from ${sourceBaseUrl}: ${message}`,
    );
  }
}
