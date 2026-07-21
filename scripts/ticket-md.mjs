#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const helperPath = path.resolve(
  scriptDir,
  "../skills/implementation-ledger/scripts/ticket-md.mjs",
);

const result = spawnSync(process.execPath, [helperPath, ...process.argv.slice(2)], {
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exitCode = 1;
} else if (typeof result.status === "number") {
  process.exitCode = result.status;
} else {
  process.exitCode = 1;
}
