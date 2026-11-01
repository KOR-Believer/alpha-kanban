#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { analyzeDocumentOperation, applyDocumentPlan, continueDocumentOperation, verifyDocumentOperation, listDocumentOperations } from "./lib/document-transaction.mjs";
import { operationDirectory, lockInfo, unlockInterruptedOperation } from "./lib/document-journal.mjs";
import { fail, worktreeContext } from "./lib/document-fs.mjs";

const commandFlags = {
  analyze: ["request"], apply: ["plan", "approve"], verify: ["id"],
  resume: ["id", "approve"], recover: ["id", "approve"],
  list: [], "lock-info": [], unlock: ["token"], help: [],
};
const invalid = new Set(["INVALID_ARGUMENTS", "INVALID_JSON", "INPUT_TOO_LARGE", "INVALID_REQUEST", "INVALID_PATH", "INVALID_PLAN", "INVALID_OPERATION_ID"]);
const recovery = new Set(["OPERATION_INTERRUPTED", "RECOVERY_REQUIRED", "OPERATION_LOCKED", "UNCERTAIN_STEP", "JOURNAL_DAMAGED", "JOURNAL_BOUNDARY", "LOCK_DAMAGED", "ROLLBACK_IN_PROGRESS"]);
const MAX_JSON_BYTES = 512 * 1024 * 1024;

async function jsonInput(file) {
  let bytes;
  if (file === "-") {
    const chunks = []; let size = 0;
    for await (const chunk of process.stdin) {
      size += chunk.length;
      if (size > MAX_JSON_BYTES) fail("INPUT_TOO_LARGE", "JSON input exceeds 512 MiB.");
      chunks.push(chunk);
    }
    bytes = Buffer.concat(chunks);
  } else {
    if ((await stat(file)).size > MAX_JSON_BYTES) fail("INPUT_TOO_LARGE", "JSON input exceeds 512 MiB.");
    bytes = await readFile(file);
  }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { fail("INVALID_JSON", "Expected a UTF-8 JSON request or analysis plan."); }
}
function argumentsFor(argv) {
  const command = argv[0] === "--help" || !argv.length ? "help" : argv[0];
  if (!Object.hasOwn(commandFlags, command)) fail("INVALID_ARGUMENTS", "Unknown command. Run help for the JSON command contract.");
  const flags = {};
  for (let at = 1; at < argv.length; at += 2) {
    const name = argv[at].startsWith("--") ? argv[at].slice(2) : "";
    const value = argv[at + 1];
    if (!commandFlags[command].includes(name) || Object.hasOwn(flags, name) || !value || value.startsWith("--")) fail("INVALID_ARGUMENTS", "Unknown, repeated or missing command argument.");
    flags[name] = value;
  }
  if (commandFlags[command].some(name => !Object.hasOwn(flags, name))) fail("INVALID_ARGUMENTS", "Missing required command arguments.", { required: commandFlags[command] });
  return { command, flags };
}

export async function main(argv = process.argv.slice(2)) {
  try {
    const { command, flags } = argumentsFor(argv);
    let result, exitCode = 0;
    if (command === "help") result = { schema: 1, commands: commandFlags, guide: "docs/document_cli.md", input: "UTF-8 JSON file or - for stdin", scope: "Current worktree only; no checkout or cwd option", exits: { success: 0, invalidInput: 2, review: 3, blocked: 4, recoveryRequired: 5 } };
    else if (command === "analyze") {
      result = await analyzeDocumentOperation(await jsonInput(flags.request));
      exitCode = result.decision === "review" ? 3 : result.decision === "blocked" ? 4 : 0;
    } else if (command === "apply") result = await applyDocumentPlan(await jsonInput(flags.plan), { approve: flags.approve });
    else if (command === "resume" || command === "recover") result = await continueDocumentOperation(flags.id, { approve: flags.approve, rollback: command === "recover" });
    else if (command === "verify") {
      result = await verifyDocumentOperation(flags.id);
      if (!result.verified || !["completed", "rolled-back"].includes(result.status)) exitCode = 5;
    } else if (command === "list") result = await listDocumentOperations();
    else {
      const directory = await operationDirectory(await worktreeContext(process.cwd()));
      result = command === "lock-info" ? { lock: await lockInfo(directory) } : await unlockInterruptedOperation(directory, flags.token);
    }
    process.stdout.write(JSON.stringify(result) + "\n");
    return exitCode;
  } catch (error) {
    const code = error.code ?? "IO_ERROR";
    process.stdout.write(JSON.stringify({ ok: false, error: { code, message: error.message, details: error.details ?? {} } }) + "\n");
    return invalid.has(code) ? 2 : recovery.has(code) ? 5 : 4;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main();
