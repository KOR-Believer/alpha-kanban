#!/usr/bin/env node
import { parseArgs } from "node:util";
import { resolveDocumentContext } from "./lib/document-context.mjs";

const usage = `Read-only document context (JSON; no settings, folders or Markdown are written).

node <skill>/scripts/document-context.mjs new [--cwd PROJECT] [--base-dir DIRECTORY]
node <skill>/scripts/document-context.mjs new --target DIRECTORY [--cwd PROJECT]
node <skill>/scripts/document-context.mjs edit --target FILE [--cwd PROJECT]
node <skill>/scripts/document-context.mjs actor [--cwd PROJECT]
node <skill>/scripts/document-context.mjs root [--cwd PROJECT]
node <skill>/scripts/document-context.mjs check-new --target FILE [--cwd PROJECT]

Targets and base-dir are relative to the resolved project/worktree root (or absolute within it).
new without target uses documents.root (default: docs); base-dir preserves an explicit basic location.
An explicit target bypasses the default policy and user lookup. edit always preserves metadata.
actor is only for requests that need the current user. check-new requires a valid Document-ID and checks Owner.
new always allocates one UUID header for one new file. Run separately for each file; never reuse it.
--with-id is still accepted with new for older callers, but is no longer needed.
--home DIRECTORY selects an isolated home for tests/isolated environments; normally the OS home is used.
Exit codes: 0 success; 2 invalid request; 3 context/settings/read/validation failure. Consult diagnostics.code.
`;

try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    cwd: { type: "string" }, target: { type: "string" }, "base-dir": { type: "string" }, home: { type: "string" }, "with-id": { type: "boolean" }, help: { type: "boolean", short: "h" },
  } });
  if (values.help) process.stdout.write(usage);
  else {
    const operation = positionals[0] ?? "new";
    if (positionals.length > 1 || !["new", "edit", "actor", "root", "check-new"].includes(operation)
      || (values["base-dir"] !== undefined && (operation !== "new" || values.target !== undefined))
      || Object.values(values).some(value => typeof value === "string" && value.length === 0)) throw new Error("Invalid arguments. Use --help for usage.");
    const result = await resolveDocumentContext({ operation, cwd: values.cwd, target: values.target, baseDir: values["base-dir"], home: values.home, withId: values["with-id"] });
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    process.exitCode = result.ok ? 0 : result.diagnostics.some(item => item.code === "INVALID_REQUEST") ? 2 : 3;
  }
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, diagnostics: [{ code: "INVALID_REQUEST", message: error.message }] }) + "\n");
  process.exitCode = 2;
}
