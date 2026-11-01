import { ContextError } from "./context-error.mjs";
import { headerField, scanDocumentHeader } from "./document-header.mjs";

// Pure helpers: no filesystem, Git, user lookup or document writes.
export function normalizeOwner(value) {
  if (typeof value !== "string" || !/^@[\p{L}\p{N}][\p{L}\p{N}\p{M}._-]*$/u.test(value)
    || value.endsWith(".") || new TextEncoder().encode(value).length > 240) {
    throw new ContextError("INVALID_OWNER", "Use @ followed by a letter or number, then letters, numbers, dots, underscores or hyphens (no trailing dot; at most 240 UTF-8 bytes).");
  }
  return value.normalize("NFC");
}

export function ownerFromPath(projectRelativePath) {
  const [root, folder, ...rest] = projectRelativePath.split("/");
  if (root !== "docs" || !folder?.startsWith("@")) return { status: "unassigned", value: null };
  try {
    return { status: "owned", value: normalizeOwner(folder), folder, descendants: rest };
  } catch {
    return { status: "invalid", value: null, folder };
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
