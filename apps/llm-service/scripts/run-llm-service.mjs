import { spawnSync } from "node:child_process";

const result = spawnSync(process.execPath, ["--experimental-strip-types", "scripts/run-sync.ts"], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
