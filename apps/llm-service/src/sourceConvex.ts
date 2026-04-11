import { ConvexHttpClient } from "convex/browser";
import { getEnv } from "./env.ts";
import type { SourceHeadlineDefinitionsPage } from "./sourceTypes.ts";

const client = new ConvexHttpClient(getEnv().sourceConvexUrl);

export async function fetchHeadlineDefinitionsPage(
  cursor: string | null,
  numItems: number,
): Promise<SourceHeadlineDefinitionsPage> {
  const result = await client.query("notebook:listHeadlineDefinitions" as never, {
    paginationOpts: {
      cursor,
      numItems,
    },
  });

  return result as SourceHeadlineDefinitionsPage;
}
