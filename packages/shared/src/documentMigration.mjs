import { inspectReferences, analyzeReferences, applyReferenceEdits, resolvePath, projectPath } from "./documentReferences.mjs";
import { readDocumentMetadata, previewDocumentMetadata, normalizeDocumentId } from "../../../skills/implementation-ledger/scripts/lib/document-metadata.mjs";
import { inspectLedgerFormat, inspectTicketCompatibility, structuralLedgerLines } from "../../../skills/implementation-ledger/scripts/lib/ledger-format.mjs";

// Rules identify demonstrated source shapes, not guessed historical release versions.
export const DOCUMENT_MIGRATIONS = Object.freeze([{ id: "legacy-progress-board-v1", sourceFormats: ["unversioned", "1"], targetFormat: "preserve", section: "Progress Board" }]);
const problem = (code, path, message) => ({ severity: "blocked", code, path, message });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const columns = ["Ticket", "Status", "Progress", "Repository", "Depends on"];
const cells = (line) => /^\|.*\|$/.test(line.trim()) ? line.trim().slice(1, -1).split("|").map((value) => value.trim()) : null;

/** Recognize title and table structure only; stale values and row counts are not authoritative. */
export function inspectLegacySections(markdown, path) {
  const headings = inspectReferences(markdown).headings, removals = [], tableEdits = [], retained = [];
  const visible = structuralLedgerLines(markdown), lines = []; let offset = 0;
  markdown.split(/(?<=\n)/).forEach((source, index) => { lines.push({ start: offset, end: offset + source.length, text: visible[index] ?? "" }); offset += source.length; });
  for (const heading of headings.filter((heading) => heading.depth === 2 && heading.text === "Progress Board")) {
    const end = headings.find((next) => next.start > heading.start && next.depth <= heading.depth)?.start ?? markdown.length;
    const sectionLines = lines.filter((line) => line.start >= heading.end && line.start < end), tables = [];
    for (let i = 0; i < sectionLines.length; i++) {
      if (!same(cells(sectionLines[i].text), columns)) continue;
      const separator = cells(sectionLines[i + 1]?.text ?? "");
      if (separator?.length !== columns.length || !separator.every((value) => /^:?-{3,}:?$/.test(value))) continue;
      let next = i + 2, valid = true;
      while (next < sectionLines.length && /^\s*\|/.test(sectionLines[next].text)) {
        if (cells(sectionLines[next].text)?.length !== columns.length) valid = false;
        next++;
      }
      if (valid) tables.push({ path, start: sectionLines[i].start, end: sectionLines[next - 1].end, rule: "legacy-progress-board-v1" });
      i = next - 1;
    }
    if (!tables.length) {
      retained.push({ path, rule: "legacy-progress-board-v1", code: "LEGACY_SECTION_RETAINED", message: "No supported Progress Board table was found. This section was preserved." }); continue;
    }
    let otherContent = markdown.slice(heading.end, end);
    for (const table of [...tables].reverse()) otherContent = otherContent.slice(0, table.start - heading.end) + otherContent.slice(table.end - heading.end);
    if (!otherContent.trim()) removals.push({ path, start: heading.start, end, rule: "legacy-progress-board-v1" });
    else {
      tableEdits.push(...tables);
      retained.push({ path, rule: "legacy-progress-board-v1", code: "LEGACY_NOTES_PRESERVED", message: "The heading and content outside the table were preserved." });
    }
  }
  return { removals, tableEdits, retained };
}

/** Common browser/native preview. IDs are allocated once and reused by guarded apply. */
export function previewDocumentMigrations(input) {
  const { root, documents, targets } = input;
  const byPath = new Map(documents.map((document) => [document.path, document]));
  const issues = [], retained = [], removals = [], tableEdits = [], generatedIds = {}, changes = new Map();
  const existingIds = new Map(), selected = new Set();
  for (const document of documents) {
    const id = readDocumentMetadata(document.markdown).documentId.value;
    if (id) existingIds.set(id, [...(existingIds.get(id) ?? []), document.path]);
  }
  if (!Array.isArray(targets) || !targets.length) throw new Error("Select at least one migration target.");
  for (const target of targets) {
    const document = byPath.get(target.path);
    try {
      projectPath(target.path);
      if (selected.has(target.path)) throw new Error("A target was selected more than once.");
      selected.add(target.path);
      if (Object.keys(target).some((key) => !["path", "assignId", "cleanupLegacy", "allowPlainMarkdown"].includes(key)) ||
        [target.assignId, target.cleanupLegacy, target.allowPlainMarkdown].some((value) => value !== undefined && typeof value !== "boolean") || !(target.assignId || target.cleanupLegacy)) throw new Error("Select ID assignment and/or legacy cleanup explicitly.");
      if (!document?.writable) throw new Error("The selected Markdown is unavailable or outside write scope.");
      const canonical = /_(tickets|plan|inventory)\.md$/.test(target.path);
      if (!canonical && !target.allowPlainMarkdown) throw new Error("Select ordinary Markdown explicitly.");
      const metadata = readDocumentMetadata(document.markdown);
      const format = target.path.endsWith("_tickets.md") ? inspectTicketCompatibility(document.markdown) : inspectLedgerFormat(document.markdown);
      if (!format.writable) { issues.push(problem(format.code, target.path, "The document format cannot be transformed.")); continue; }
      if (metadata.documentId.status === "invalid" || metadata.owner.status === "invalid") throw new Error("Repair invalid metadata explicitly before transforming this document.");
      if (metadata.documentId.value && existingIds.get(metadata.documentId.value).length > 1) throw new Error("A duplicate Document-ID must be resolved explicitly.");
      if (target.cleanupLegacy) {
        const result = inspectLegacySections(document.markdown, target.path);
        removals.push(...result.removals); tableEdits.push(...result.tableEdits); retained.push(...result.retained);
      }
      if (target.assignId && !metadata.documentId.value) {
        const id = input.generatedIds?.[target.path] ?? crypto.randomUUID();
        if (!normalizeDocumentId(id) || id !== normalizeDocumentId(id) || existingIds.has(id) || Object.values(generatedIds).includes(id)) throw new Error("A unique UUID v4 is required.");
        generatedIds[target.path] = id;
      }
    } catch (error) { issues.push(problem("INVALID_MIGRATION_TARGET", target.path, error.message)); }
  }
  if (input.generatedIds && !same(Object.keys(input.generatedIds).sort(), Object.keys(generatedIds).sort())) issues.push(problem("STALE_GENERATED_IDS", "", "Generated IDs no longer match the selected missing IDs."));
  const references = removals.length ? analyzeReferences({ root, documents, available: input.available ?? documents.map((document) => resolvePath(root, document.path)), sectionRemovals: removals }) : { issues: [], changes: [], references: [] };
  // An unhandled HTML/wiki anchor cannot be waved through while deleting sections.
  issues.push(...references.issues.map((issue) => ({ ...issue, severity: "blocked" })));
  for (const change of references.changes) changes.set(change.path, change);
  for (const [path, document] of byPath) {
    const tables = tableEdits.filter((table) => table.path === path);
    if (!tables.length) continue;
    for (const table of tables) {
      const inspection = inspectReferences(document.markdown.slice(table.start, table.end));
      issues.push(...inspection.issues.map((issue) => ({ ...issue, severity: "blocked", path })));
    }
    const existing = changes.get(path);
    const edits = [...(existing?.edits ?? []), ...tables.map((table) => ({ start: table.start, end: table.end, before: document.markdown.slice(table.start, table.end), after: "" }))];
    changes.set(path, { path, afterPath: path, before: document.markdown, after: applyReferenceEdits(document.markdown, edits), edits });
  }
  for (const target of targets) if (generatedIds[target.path] && !issues.some((issue) => issue.path === target.path)) {
    try {
      const before = byPath.get(target.path).markdown;
      const preview = previewDocumentMetadata({ markdown: changes.get(target.path)?.after ?? before, path: target.path, assignId: true, allowPlainMarkdown: target.allowPlainMarkdown, generateId: () => generatedIds[target.path] });
      changes.set(target.path, { path: target.path, afterPath: target.path, before, after: preview.after });
    } catch (error) { issues.push(problem(error.code ?? "INVALID_MIGRATION_TARGET", target.path, error.message)); }
  }
  const result = [...changes.values()].filter((change) => change.before !== change.after);
  return { schema: 1, decision: issues.length ? "blocked" : result.length ? "ready" : "noop", generatedIds, rules: [...removals, ...tableEdits.map((table) => ({ ...table, tableOnly: true }))], retained, issues, changes: result, references: references.references };
}
