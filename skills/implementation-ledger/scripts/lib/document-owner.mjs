import { ContextError } from "./context-error.mjs";

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
  const lines = markdown.replace(/^\uFEFF/, "").split(/\r?\n/);
  let at = 0;
  if (lines[0] === "---") {
    const end = lines.findIndex((line, index) => index > 0 && /^(---|\.\.\.)$/.test(line));
    if (end < 0) throw new ContextError("INVALID_HEADER", "Unclosed front matter; the Owner header cannot be identified.");
    at = end + 1;
  }
  while (lines[at]?.trim() === "") at++;
  if (!/^#\s+\S/.test(lines[at] ?? "")) throw new ContextError("INVALID_HEADER", "A document title must precede its metadata header.");
  let owner = null;
  let ownerLine = null;
  for (at++; at < lines.length; at++) {
    const line = lines[at];
    if (!line.trim()) continue;
    const field = /^([\p{L}][\p{L}\p{N} _-]*):[ \t]*(.*)$/u.exec(line);
    if (!field) break;
    if (field[1].trim().toLowerCase() !== "owner") continue;
    if (field[1] !== "Owner") throw new ContextError("INVALID_OWNER_FIELD", "Spell the document header field exactly Owner:.", { line: at + 1 });
    if (ownerLine !== null) throw new ContextError("DUPLICATE_OWNER", "The document header must contain only one Owner field.", { line: at + 1 });
    try { owner = normalizeOwner(field[2]); }
    catch (error) { throw new ContextError(error.diagnostic.code, error.message, { line: at + 1 }); }
    ownerLine = at + 1;
  }
  return { value: owner, line: ownerLine };
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
