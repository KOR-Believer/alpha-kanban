import { readFileSync } from "node:fs";

// The reviewed ASM-01 examples are the contract fixtures, not claimed executions.
const inventory = readFileSync(new URL("../../../docs/31_alpha_kanban_smoke_inventory.md", import.meta.url), "utf8");
export const [smokeSource, smokeFirstRun, smokeSecondRun] = [...inventory.matchAll(/^```md\n([\s\S]*?)^```$/gm)].map(match => match[1]!) as [string, string, string];
export const smokeSourceId = "11111111-1111-4111-8111-111111111111";
export function emptySmokeRun(): string {
  return smokeSecondRun.replace("Run-State: CLOSED", "Run-State: OPEN")
    .replace(/^Closed at:.*\n\n/m, "").replace(/^Close reason:.*\n\n/m, "")
    .replace("Result: PASS", "Result: NOT_RUN")
    .replace(/##### LOG-001[\s\S]*?(?=### TC-003)/, "");
}
