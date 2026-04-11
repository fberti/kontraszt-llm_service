import { runSync } from "../src/runSync.ts";

const result = await runSync({
  webhookId: process.argv[2],
  debug: true,
});

console.log(JSON.stringify(result, null, 2));

if (result.status === "failed") {
  process.exit(1);
}
