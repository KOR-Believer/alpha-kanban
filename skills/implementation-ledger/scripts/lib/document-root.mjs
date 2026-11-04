import { ContextError } from "./context-error.mjs";

export const DEFAULT_DOCUMENT_ROOT = "docs";

/** Portable, project-relative directory. Never expand shell or machine paths. */
export function normalizeDocumentRoot(value) {
  if (typeof value !== "string" || !value || value !== value.trim()
    || /[\\\u0000-\u001f\u007f:*?"<>|]/.test(value)
    || value.split("/").some(part => !part || part === "." || part === ".."
      || [".git", ".alpha-kanban"].includes(part.toLowerCase()) || /[. ]$/.test(part))) {
    throw new ContextError("DOCUMENT_ROOT_INVALID", "documents.root must be a project-relative directory such as docs or notes/planning.");
  }
  return value;
}

export function withinDocumentRoot(relativePath, root = DEFAULT_DOCUMENT_ROOT) {
  return typeof root === "string" && (relativePath === root || relativePath.startsWith(root + "/"));
}
