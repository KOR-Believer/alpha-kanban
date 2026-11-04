import { readFile } from "node:fs/promises";
import { applyDocumentPlan } from "../../lib/document-transaction.mjs";

// Only bundled into the isolated smoke kit. The distributed CLI has no fault-injection switch.
const plan = JSON.parse(await readFile(process.argv[2], "utf8"));
await applyDocumentPlan(plan, { approve: plan.id, fault(stage, step) {
  if (stage === "after-operation" && step?.kind === "write") process.exit(77);
} });
throw new Error("The fixture did not reach the intended interruption point.");
