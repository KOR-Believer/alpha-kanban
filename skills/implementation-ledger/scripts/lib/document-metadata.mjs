import { headerField, scanDocumentHeader } from "./document-header.mjs";
import { inspectLedgerFormat } from "./ledger-format.mjs";
import { normalizeOwner, ownerFromPath } from "./document-owner.mjs";

export function normalizeDocumentId(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value.toLowerCase() : null;
}

function readField(header, name, normalize) {
  const found = headerField(header, name);
  if (header.error || found.error) return { status: "invalid", value: null, raw: found.value, code: header.error ?? found.error };
  if (found.value === null) return { status: "missing", value: null, raw: null, code: null };
  let value;
  try { value = normalize(found.value); } catch { value = null; }
  return value ? { status: "valid", value, raw: found.value, code: null }
    : { status: "invalid", value: null, raw: found.value, code: "INVALID_VALUE" };
}

export function readDocumentMetadata(markdown) {
  const header = scanDocumentHeader(markdown);
  return {
    format: inspectLedgerFormat(markdown),
    documentId: readField(header, "Document-ID", normalizeDocumentId),
    owner: readField(header, "Owner", normalizeOwner),
  };
}

function pathOwner(path, options) {
  const { status, value } = ownerFromPath(path, options);
  return { status, value };
}

export function analyzeDocumentMetadata(markdown, path, options = {}) {
  const metadata = readDocumentMetadata(markdown);
  const folder = validPath(path) ? pathOwner(path, options) : { status: "invalid", value: null };
  let ownerState;
  if (!metadata.format.readable || folder.status === "invalid" || metadata.owner.status === "invalid") ownerState = "invalid";
  else if (folder.status === "unassigned") ownerState = metadata.owner.status === "missing" ? "unassigned" : "recorded-only";
  else if (metadata.owner.status === "missing") ownerState = "legacy-adoption";
  else ownerState = folder.value === metadata.owner.value ? "aligned" : "reconcile";
  return { ...metadata, pathOwner: folder, ownerState };
}

export class MetadataPreviewError extends Error {
  constructor(code, message) { super(message); this.name = "MetadataPreviewError"; this.code = code; }
}

function validPath(path) {
  return typeof path === "string" && !/^[A-Za-z]:/.test(path) && !path.includes("\\") && !path.includes("\0") &&
    path.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

/** Pure, explicit single-file selection. No directory discovery or file writes. */
export function previewDocumentMetadata(input) {
  const { markdown, path, assignId = false, clone = false, reconcileOwner = false, allowPlainMarkdown = false } = input;
  if (!validPath(path) || !/\.md$/i.test(path)) throw new MetadataPreviewError("INVALID_PATH", "Use a project-relative Markdown file path.");
  const kind = /_(plan|tickets|inventory)\.md$/.exec(path)?.[1] ?? "markdown";
  if (kind === "markdown" && !allowPlainMarkdown) throw new MetadataPreviewError("PLAIN_MARKDOWN_NOT_SELECTED", "Select ordinary Markdown explicitly before previewing metadata changes.");
  if (![assignId, clone, reconcileOwner].every((value) => typeof value === "boolean") || !(assignId || clone || reconcileOwner)) {
    throw new MetadataPreviewError("NO_OPERATION", "Select ID assignment, explicit cloning or owner reconciliation.");
  }
  const analysis = analyzeDocumentMetadata(markdown, path, { documentRoot: input.documentRoot });
  // Header edits do not require canonical ticket fields, states or progress values.
  const compatibility = analysis.format;
  if (!compatibility.writable) throw new MetadataPreviewError(compatibility.code, "The document format cannot be transformed.");
  if (/\r(?!\n)/.test(markdown) || (markdown.includes("\r\n") && /(?<!\r)\n/.test(markdown))) {
    throw new MetadataPreviewError("MIXED_LINE_ENDINGS", "Preserve the original and resolve mixed line endings explicitly.");
  }
  if (analysis.documentId.status === "invalid" || analysis.owner.status === "invalid") throw new MetadataPreviewError("INVALID_METADATA", "Invalid metadata must not be treated as missing.");
  const header = scanDocumentHeader(markdown);
  const eol = markdown.includes("\r\n") ? "\r\n" : "\n";
  const changes = [];
  let documentId = analysis.documentId.value;
  if (clone || (assignId && !documentId)) {
    const generated = (input.generateId ?? (() => crypto.randomUUID()))();
    const normalized = normalizeDocumentId(generated);
    if (!normalized || normalized === documentId) throw new MetadataPreviewError("INVALID_GENERATED_ID", "A new, valid UUID v4 is required.");
    documentId = normalized;
    changes.push({ field: "Document-ID", value: documentId });
  }
  if (reconcileOwner) {
    if (analysis.pathOwner.status !== "owned" || analysis.ownerState === "invalid") throw new MetadataPreviewError("OWNER_TARGET_REQUIRED", "Owner reconciliation requires a valid nearest @ directory within the document root.");
    if (analysis.owner.value !== analysis.pathOwner.value) changes.push({ field: "Owner", value: analysis.pathOwner.value });
  }
  const edits = [];
  const additions = [];
  for (const change of changes) {
    const field = headerField(header, change.field).field;
    const replacement = `${change.field}: ${change.value}`;
    if (!field) additions.push(replacement);
    else {
      const line = header.lines[field.line - 1];
      edits.push({ start: field.start, end: field.end - line.ending.length, before: line.text, after: replacement });
    }
  }
  if (additions.length) {
    const title = header.lines[header.title];
    const after = (title.ending ? "" : eol) + additions.join(eol) + (title.ending ? eol : "");
    edits.push({ start: title.end, end: title.end, before: "", after });
  }
  // An insertion at the start of an existing header line must precede its
  // replacement in source order, so reverse application replaces it first.
  edits.sort((a, b) => a.start - b.start || a.end - b.end);
  const after = applyEdits(markdown, edits);
  return { schema: 1, path, before: markdown, after, documentId,
    operations: { assignId, clone, reconcileOwner }, edits };
}

function applyEdits(source, edits) {
  let result = source, end = source.length;
  for (const edit of [...edits].reverse()) {
    if (!Number.isInteger(edit.start) || !Number.isInteger(edit.end) || edit.start < 0 || edit.end < edit.start || edit.end > end ||
      source.slice(edit.start, edit.end) !== edit.before || typeof edit.after !== "string") {
      throw new MetadataPreviewError("INVALID_PREVIEW", "The preview no longer matches its source ranges.");
    }
    result = result.slice(0, edit.start) + edit.after + result.slice(edit.end);
    end = edit.start;
  }
  return result;
}

/** Returns a string for the future guarded applier; this does not perform I/O. */
export function resumeMetadataPreview(preview, current, currentPath) {
  if (preview.schema !== 1 || !Array.isArray(preview.edits) || applyEdits(preview.before, preview.edits) !== preview.after) {
    throw new MetadataPreviewError("INVALID_PREVIEW", "The preview is incomplete or was changed.");
  }
  if (preview.path !== currentPath || (current !== preview.before && current !== preview.after)) {
    throw new MetadataPreviewError("STALE_PREVIEW", "The selected path or document changed. Analyze it again.");
  }
  return preview.after;
}

/** Project/checkout namespaces never merge. Duplicate UUIDs remain separate local files. */
export function indexDocumentIds(entries) {
  const projects = new Map();
  for (const entry of entries) {
    const id = normalizeDocumentId(entry.documentId);
    if (!id) continue;
    let project = projects.get(entry.projectId);
    if (!project) projects.set(entry.projectId, project = new Map());
    let files = project.get(id);
    if (!files) project.set(id, files = new Map());
    files.set(entry.localId, { localId: entry.localId, path: entry.path });
  }
  return [...projects].flatMap(([projectId, ids]) => [...ids].map(([documentId, files]) => ({
    projectId, documentId, status: files.size > 1 ? "duplicate" : "unique", documents: [...files.values()],
  })));
}
