#!/usr/bin/env node
import { parseArgs } from "node:util";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parseSmokeDocument, smokeFileKind, buildSmokeIndex } from "../packages/shared/src/smokeMarkdown.mjs";
import { readDocumentMetadata } from "../skills/implementation-ledger/scripts/lib/document-metadata.mjs";

const usage = `Usage: node check-smoke.mjs [--json] [--new-run] [--project DIRECTORY] <file.md> [...files.md]
Read-only format and relationship checks for smoke definitions and runs.
Only named files in the selected project (default: current directory) are read.
Include the definition and runs together to check their relationship. Other named Markdown files participate in UUID collision detection only.
--new-run additionally requires OPEN, NOT_RUN and empty records for each supplied run.
An absent source means absent from this input, not proof of deletion from disk.
Exit codes: 0 valid structure; 1 format/identity errors; 2 invalid input or read failure.
Structure checks do not execute a TC or prove that observations are true.
`;

try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    json: { type: "boolean" }, "new-run": { type: "boolean" }, project: { type: "string" }, help: { type: "boolean", short: "h" },
  } });
  if (values.help) process.stdout.write(usage);
  else {
    if (!positionals.length || !positionals.some(smokeFileKind)) throw new Error("Name at least one _smoke.md or _smoke_run.md file. Use --help for usage.");
    const project = path.resolve(values.project ?? process.cwd());
    const files = [];
    for (const filename of [...new Set(positionals.map(filename => path.resolve(project, filename)))]) {
      const relative = path.relative(project, filename);
      if (!relative || relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative) || !filename.endsWith(".md")) throw new Error("Each file must be Markdown inside the selected project.");
      const information = await stat(filename);
      if (!information.isFile() || information.size > 10 * 1024 * 1024) throw new Error("Expected a Markdown file no larger than 10 MiB.");
      const markdown = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(await readFile(filename));
      const kind = smokeFileKind(filename);
      const document = kind ? parseSmokeDocument(markdown, kind, { newRun: values["new-run"] }) : undefined;
      files.push({ projectId: project, localId: relative, path: relative, documentId: readDocumentMetadata(markdown).documentId.value, document });
    }
    const relations = buildSmokeIndex(files);
    const ok = files.every(file => !file.document || file.document.valid) && !relations.duplicates.length && relations.runs.every(run => !["invalid", "ambiguous", "wrong-type"].includes(run.status));
    const report = { ok, scope: "named-files-only", project, files: files.map(file => ({ path: file.path,
      kind: file.document?.kind ?? "identity-only", documentId: file.documentId, valid: file.document?.valid ?? null,
      counts: file.document?.counts ?? null, diagnostics: file.document?.diagnostics ?? [] })), relations };
    if (values.json) process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    else {
      for (const file of report.files) {
        process.stdout.write(`${file.path}: ${file.valid === null ? "identity only" : file.valid ? "OK (structure)" : "INVALID"}\n`);
        for (const item of file.diagnostics) process.stdout.write(`  ${item.code} line ${item.range.startLine}: ${item.message}\n`);
      }
      for (const run of relations.runs) process.stdout.write(`${run.localId}: ${run.status}${run.duplicateNumber ? "; duplicate run number" : ""}\n`);
      for (const duplicate of relations.duplicates) process.stdout.write(`DUPLICATE_DOCUMENT_ID: ${duplicate.localIds.join(", ")}\n`);
    }
    process.exitCode = ok ? 0 : 1;
  }
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, code: "INPUT_ERROR", message: error.message }) + "\n");
  process.exitCode = 2;
}
