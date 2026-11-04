import { ContextError } from "./context-error.mjs";
import { headerField, scanDocumentHeader } from "./document-header.mjs";
import { DEFAULT_DOCUMENT_ROOT, normalizeDocumentRoot, withinDocumentRoot } from "./document-root.mjs";

// Pure helpers: no filesystem, Git, user lookup or document writes.
export function normalizeOwner(value) {
  if (typeof value !== "string" || !/^@[\p{L}\p{N}][\p{L}\p{N}\p{M}._-]*$/u.test(value)
    || value.endsWith(".") || new TextEncoder().encode(value).length > 240) {
    throw new ContextError("INVALID_OWNER", "Use @ followed by a letter or number, then letters, numbers, dots, underscores or hyphens (no trailing dot; at most 240 UTF-8 bytes).");
  }
  return value.normalize("NFC");
}

export function ownerFromPath(projectRelativePath, { kind = "file", documentRoot = DEFAULT_DOCUMENT_ROOT } = {}) {
  const parts = projectRelativePath.split("/");
  try { normalizeDocumentRoot(documentRoot); }
  catch { return { status: "invalid", value: null }; }
  if (!withinDocumentRoot(projectRelativePath, documentRoot) || parts.some(part => !part || part === "." || part === ".." || /[\\\0]/.test(part))) return { status: "unassigned", value: null };
  const boundary = documentRoot.split("/").length;
  const end = kind === "directory" ? parts.length : parts.length - 1;
  let index = end - 1;
  while (index >= boundary && !parts[index].startsWith("@")) index--;
  if (index < boundary) return { status: "unassigned", value: null };
  const folder = parts[index], folderPath = parts.slice(0, index + 1).join("/");
  try {
    return { status: "owned", value: normalizeOwner(folder), folder, folderPath, descendants: parts.slice(index + 1) };
  } catch {
    return { status: "invalid", value: null, folder, folderPath };
  }
}

export function readOwnerHeader(markdown) {
  const header = scanDocumentHeader(markdown);
  if (header.error) throw new ContextError("INVALID_HEADER", "A complete front matter and document title must precede the metadata header.");
  const owner = headerField(header, "Owner");
  if (owner.error === "DUPLICATE_FIELD") throw new ContextError("DUPLICATE_OWNER", "The document header must contain only one Owner field.");
  if (owner.error) throw new ContextError("INVALID_OWNER_FIELD", "Spell the document header field exactly Owner:.", { line: owner.field?.line });
  if (owner.value === null) return { value: null, line: null };
  try { return { value: normalizeOwner(owner.value), line: owner.field.line }; }
  catch (error) { throw new ContextError(error.diagnostic.code, error.message, { line: owner.field.line }); }
}

export function checkNewOwner(markdown, expectedOwner) {
  const recorded = readOwnerHeader(markdown);
  const expected = expectedOwner === null ? null : normalizeOwner(expectedOwner);
  if (recorded.value !== expected) {
    throw new ContextError("OWNER_MISMATCH", expected === null
      ? "A new unassigned document must omit Owner."
      : `The new document must record Owner: ${expected}.`, { expected, recorded: recorded.value });
  }
  return recorded;
}
