import { fromMarkdown } from "mdast-util-from-markdown";
import { inspectReferences, applyReferenceEdits, projectPath } from "./documentReferences.mjs";
import { preserveReferencedSections } from "./documentCleanupReferences.mjs";
import { readDocumentMetadata, previewDocumentMetadata, normalizeDocumentId, analyzeDocumentMetadata } from "../../../skills/implementation-ledger/scripts/lib/document-metadata.mjs";
import { inspectLedgerFormat, structuralLedgerLines } from "../../../skills/implementation-ledger/scripts/lib/ledger-format.mjs";
import { scanDocumentHeader } from "../../../skills/implementation-ledger/scripts/lib/document-header.mjs";

// Rules identify demonstrated source shapes, not guessed historical release versions.
export const DOCUMENT_MIGRATIONS = Object.freeze([
  { id: "legacy-progress-board-v1", section: "Progress Board" },
  { id: "legacy-ticket-status-v1", section: "티켓 상태" },
  { id: "legacy-progress-guide-v1", section: "Progress 기준" },
  { id: "legacy-ticket-template-v1", section: "Ticket Template" },
].map((rule) => ({ ...rule, sourceFormats: ["unversioned", "1"], targetFormat: "preserve" })));
const problem = (code, path, message) => ({ severity: "blocked", code, path, message });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const columns = ["Ticket", "Status", "Progress", "Repository", "Depends on"];
const cells = (line) => /^\|.*\|$/.test(line.trim()) ? line.trim().slice(1, -1).split("|").map((value) => value.trim()) : null;

function legacyGuideBlocks(body, section) {
  const nodes = fromMarkdown(body).children;
  if (section !== "Ticket Template") {
    const entry = section === "티켓 상태"
      ? /^[-*+][ \t]+(?:`[A-Z][A-Z_]*`|[A-Z][A-Z_]*)[ \t]*:[ \t]*\S[^\r\n]*$/
      : /^[-*+][ \t]+(?:`\d+%`|\d+%)[ \t]*:[ \t]*\S[^\r\n]*$/;
    return nodes.filter((node) => node.type === "list" && !node.ordered && node.children.length && node.children.every((item) =>
      entry.test(body.slice(item.position.start.offset, item.position.end.offset))));
  }
  const templates = nodes.filter((node) => {
    if (node.type !== "code" || (node.lang && !["md", "markdown"].includes(node.lang))) return false;
    const raw = body.slice(node.position.start.offset, node.position.end.offset);
    const fence = /^ {0,3}(`{3,}|~{3,})(?:md|markdown)?[ \t]*\r?\n/.exec(raw)?.[1];
    if (!fence || !new RegExp(`^ {0,3}${fence[0]}{${fence.length},}[ \\t]*$`).test(raw.split(/\r?\n/).at(-1))) return false;
    return /^###\s+[A-Za-z0-9]+-\d+[A-Za-z]*\.\s+.+$/m.test(node.value) && /^Status:/m.test(node.value) && /^Progress:/m.test(node.value);
  });
  if (!templates.length) return [];
  return [...templates, ...nodes.filter((node) => node.type === "paragraph" &&
    body.slice(node.position.start.offset, node.position.end.offset).trim() === "새 티켓을 추가할 때는 아래 형식을 따른다.")];
}

/** Recognize bounded legacy sections; examples in Ticket Template are disposable too. */
export function inspectLegacySections(markdown, path) {
  const rootHeadings = new Set(fromMarkdown(markdown.replace(/^\uFEFF/, " ")).children.filter((node) => node.type === "heading").map((node) => node.position.start.offset));
  const headings = inspectReferences(markdown).headings.filter((heading) => rootHeadings.has(heading.start)), removals = [], contentEdits = [], retained = [], sections = [];
  const visible = structuralLedgerLines(markdown), lines = []; let offset = 0;
  markdown.split(/(?<=\n)/).forEach((source, index) => { lines.push({ start: offset, end: offset + source.length, text: visible[index] ?? "" }); offset += source.length; });
  for (const heading of headings.filter((heading) => heading.depth === 2 && DOCUMENT_MIGRATIONS.some((rule) => rule.section === heading.text))) {
    const rule = DOCUMENT_MIGRATIONS.find((rule) => rule.section === heading.text);
    const end = headings.find((next) => next.start > heading.start && next.depth <= heading.depth)?.start ?? markdown.length;
    const body = markdown.slice(heading.end, end);
    const sectionLines = lines.filter((line) => line.start >= heading.end && line.start < end), blocks = [];
    if (heading.text !== "Progress Board") {
      for (const node of legacyGuideBlocks(body, heading.text)) {
        const start = heading.end + node.position.start.offset;
        let finish = heading.end + node.position.end.offset;
        if (markdown.slice(finish, finish + 2) === "\r\n") finish += 2;
        else if (markdown[finish] === "\n") finish++;
        blocks.push({ path, start, end: finish, rule: rule.id, contentOnly: true });
      }
    } else for (let i = 0; i < sectionLines.length; i++) {
      if (!same(cells(sectionLines[i].text), columns)) continue;
      const separator = cells(sectionLines[i + 1]?.text ?? "");
      if (separator?.length !== columns.length || !separator.every((value) => /^:?-{3,}:?$/.test(value))) continue;
      let next = i + 2, valid = true;
      while (next < sectionLines.length && /^\s*\|/.test(sectionLines[next].text)) {
        if (cells(sectionLines[next].text)?.length !== columns.length) valid = false;
        next++;
      }
      if (valid) blocks.push({ path, start: sectionLines[i].start, end: sectionLines[next - 1].end, rule: rule.id, tableOnly: true });
      i = next - 1;
    }
    if (!blocks.length) {
      retained.push({ path, rule: rule.id, section: heading.text, code: "LEGACY_SECTION_RETAINED", message: "No recognized legacy content was found. This section was preserved." }); continue;
    }
    let otherContent = body;
    for (const block of [...blocks].sort((a, b) => b.start - a.start)) otherContent = otherContent.slice(0, block.start - heading.end) + otherContent.slice(block.end - heading.end);
    const edits = !otherContent.trim() ? [{ path, start: heading.start, end, rule: rule.id }] : blocks;
    sections.push({ path, start: heading.start, end, rule: rule.id, section: heading.text, edits });
    if (!otherContent.trim()) removals.push(...edits);
    else {
      contentEdits.push(...blocks);
      retained.push({ path, rule: rule.id, section: heading.text, code: "LEGACY_NOTES_PRESERVED", message: "The heading and content outside the recognized legacy blocks were preserved." });
    }
  }
  return { removals, contentEdits, retained, sections };
}

// Compare literal ticket bodies, independently of rendering and canonical-field validation.
function ticketBodies(markdown) {
  const visible = structuralLedgerLines(markdown), lines = markdown.split(/(?<=\n)/);
  return visible.flatMap((line, start) => {
    if (line.trim() !== "## Ticket List") return [];
    const end = visible.findIndex((next, index) => index > start && /^##\s+/.test(next));
    return [lines.slice(start, end < 0 ? undefined : end).join("")];
  });
}

/** Call with complete source lines only. An incomplete header must keep reading. */
export function hasCompleteMigrationHeader(markdown) {
  const header = scanDocumentHeader(markdown);
  if (header.error === "UNCLOSED_FRONT_MATTER") return false;
  if (header.title === null) return header.lines.slice(header.frontMatterEnd).some((line) => line.text.trim());
  if (header.fields.some((field) => field.malformed)) return true;
  const fields = new Set(header.fields.map((field) => field.start));
  return header.lines.slice(header.title + 1).some((line) => line.text.trim() && !fields.has(line.start));
}

/** Decide the evidence needed before acquiring other files. Never grants write authority. */
export function prepareDocumentMigration(input) {
  if (input.targets.length !== 1 || input.documents.length !== 1) throw new Error("Prepare one selected document.");
  const preview = previewDocumentMigrations(input);
  if (preview.decision === "blocked") return { preview, readIds: false, readReferences: false };
  const target = input.targets[0], document = input.documents[0];
  const metadata = readDocumentMetadata(document.markdown);
  return {
    preview,
    readIds: Boolean(metadata.documentId.value || Object.keys(preview.generatedIds).length),
    readReferences: Boolean(target.cleanupLegacy && inspectLegacySections(document.markdown, target.path).sections.length),
  };
}

/** Common browser/native preview. IDs are allocated once and reused by guarded apply. */
export function previewDocumentMigrations(input) {
  const { root, documents, targets } = input;
  const byPath = new Map(documents.map((document) => [document.path, document]));
  const issues = [], retained = [], sections = [], generatedIds = {}, changes = new Map(), owners = new Set();
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
      if (Object.keys(target).some((key) => !["path", "assignId", "cleanupLegacy", "reconcileOwner", "allowPlainMarkdown"].includes(key)) ||
        [target.assignId, target.cleanupLegacy, target.reconcileOwner, target.allowPlainMarkdown].some((value) => value !== undefined && typeof value !== "boolean") || !(target.assignId || target.cleanupLegacy || target.reconcileOwner)) throw new Error("Select ID assignment, legacy cleanup and/or owner correction explicitly.");
      if (!document?.writable) throw new Error("The selected Markdown is unavailable or outside write scope.");
      const canonical = /_(tickets|plan|inventory)\.md$/.test(target.path);
      if (!canonical && !target.allowPlainMarkdown) throw new Error("Select ordinary Markdown explicitly.");
      const metadata = readDocumentMetadata(document.markdown);
      const format = inspectLedgerFormat(document.markdown);
      if (!format.writable) { issues.push(problem(format.code, target.path, "The document format cannot be transformed.")); continue; }
      if (metadata.documentId.status === "invalid" || metadata.owner.status === "invalid") throw new Error("Repair invalid metadata explicitly before transforming this document.");
      if (metadata.documentId.value && existingIds.get(metadata.documentId.value).length > 1) throw new Error("A duplicate Document-ID must be resolved explicitly.");
      if (target.reconcileOwner) {
        const analysis = analyzeDocumentMetadata(document.markdown, target.path, { documentRoot: input.documentRoot });
        if (analysis.pathOwner.status === "owned") owners.add(target.path);
        else if (metadata.owner.status !== "missing" || analysis.pathOwner.status === "invalid") retained.push({ path: target.path, rule: "owner-record", section: "Owner", code: "OWNER_PATH_UNRESOLVED", message: "Owner is kept because the document has no confirmed owner folder." });
      }
      if (target.cleanupLegacy) {
        const result = inspectLegacySections(document.markdown, target.path);
        sections.push(...result.sections); retained.push(...result.retained);
      }
      if (target.assignId && !metadata.documentId.value) {
        const id = input.generatedIds?.[target.path] ?? crypto.randomUUID();
        if (!normalizeDocumentId(id) || id !== normalizeDocumentId(id) || existingIds.has(id) || Object.values(generatedIds).includes(id)) throw new Error("A unique UUID v4 is required.");
        generatedIds[target.path] = id;
      }
    } catch (error) { issues.push(problem("INVALID_MIGRATION_TARGET", target.path, error.message)); }
  }
  if (input.generatedIds && !same(Object.keys(input.generatedIds).sort(), Object.keys(generatedIds).sort())) issues.push(problem("STALE_GENERATED_IDS", "", "Generated IDs no longer match the selected missing IDs."));
  const references = preserveReferencedSections({ root, documents, sections, relativeReferencesOnly: input.relativeReferencesOnly });
  retained.push(...references.retained);
  const edits = references.sections.flatMap((section) => section.edits);
  for (const [path, document] of byPath) {
    const blocks = edits.filter((block) => block.path === path);
    if (!blocks.length) continue;
    const deletions = blocks.map((block) => ({ start: block.start, end: block.end, before: document.markdown.slice(block.start, block.end), after: "" }));
    changes.set(path, { path, afterPath: path, before: document.markdown, after: applyReferenceEdits(document.markdown, deletions), edits: deletions });
  }
  for (const target of targets) if ((generatedIds[target.path] || owners.has(target.path)) && !issues.some((issue) => issue.path === target.path)) {
    try {
      const before = byPath.get(target.path).markdown;
      const preview = previewDocumentMetadata({ markdown: changes.get(target.path)?.after ?? before, path: target.path, documentRoot: input.documentRoot, assignId: Boolean(generatedIds[target.path]), reconcileOwner: owners.has(target.path), allowPlainMarkdown: target.allowPlainMarkdown, generateId: () => generatedIds[target.path] });
      if (before !== preview.after) changes.set(target.path, { path: target.path, afterPath: target.path, before, after: preview.after });
    } catch (error) { issues.push(problem(error.code ?? "INVALID_MIGRATION_TARGET", target.path, error.message)); }
  }
  const result = [...changes.values()].filter((change) => change.before !== change.after);
  for (const change of result) if (!same(ticketBodies(change.before), ticketBodies(change.after))) {
    issues.push(problem("TICKET_BODY_CHANGED", change.path, "This cleanup would change an actual ticket body. Preserve it and resolve its references separately."));
  }
  return { schema: 1, decision: issues.length ? "blocked" : result.length ? "ready" : "noop", generatedIds, rules: edits, retained, issues, changes: result, references: references.references };
}
