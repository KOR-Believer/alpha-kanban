import { fromMarkdown } from "mdast-util-from-markdown";
import { decodeString } from "micromark-util-decode-string";
import { scanDocumentHeader } from "../../../skills/implementation-ledger/scripts/lib/document-header.mjs";
import { absolutePath, pathKey, within, relativePath, parentPath, resolvePath, localUrlPath, mappedPath, movePath, encodedPath, fileUrl, projectPath } from "./documentPaths.mjs";

export * from "./documentPaths.mjs";

function destinationRange(node, source) {
  let at = node.position.start.offset, end = node.position.end.offset;
  if (node.type === "definition") {
    const match = /^ {0,3}\[(?:\\.|[^\]\\])+\]:\s*/.exec(source.slice(at, end));
    if (!match) return null;
    at += match[0].length;
  } else {
    if (source[at] === "!") at++;
    if (source[at] !== "[") return null; // Autolinks are separately reported.
    let depth = 1;
    for (at++; at < end && depth; at++) {
      if (source[at] === "\\") { at++; continue; }
      if (source[at] === "[") depth++;
      if (source[at] === "]") depth--;
    }
    if (source[at++] !== "(") return null;
    while (/\s/.test(source[at] ?? "") && at < end) at++;
  }
  if (source[at] === "<") {
    const start = ++at;
    for (; at < end; at++) {
      if (source[at] === "\\") { at++; continue; }
      if (source[at] === ">") return { start, end: at, angle: true };
    }
    return null;
  }
  const start = at;
  let depth = 0;
  for (; at < end; at++) {
    const char = source[at];
    if (char === "\\") { at++; continue; }
    if (char === "(") depth++;
    if (char === ")") { if (!depth) break; depth--; }
    if (/\s/.test(char) && !depth) break;
  }
  return { start, end: at, angle: false };
}

function maskedFrontMatter(source) {
  const header = scanDocumentHeader(source);
  if (!header.frontMatterEnd) return source.replace(/^\uFEFF/, " ");
  const end = header.lines[header.frontMatterEnd - 1]?.end ?? 0;
  return source.slice(0, end).replace(/[^\r\n]/g, " ") + source.slice(end);
}

/** Positions always refer to the original source. No Markdown serializer is used. */
export function inspectReferences(source) {
  const tree = fromMarkdown(maskedFrontMatter(source));
  const references = [], headings = [], issues = [], protectedRanges = [];
  const header = scanDocumentHeader(source);
  if (header.frontMatterEnd) protectedRanges.push({ start: 0, end: header.lines[header.frontMatterEnd - 1].end });
  const definitions = new Map();
  const walk = (node) => {
    const start = node.position?.start.offset ?? 0, end = node.position?.end.offset ?? start;
    if (["code", "inlineCode", "html"].includes(node.type)) protectedRanges.push({ start, end });
    if (["link", "image", "definition"].includes(node.type)) {
      const range = destinationRange(node, source);
      if (range && decodeString(source.slice(range.start, range.end)) === node.url) {
        const ref = { ...range, raw: source.slice(range.start, range.end), url: node.url, base: "document", kind: node.type };
        references.push(ref);
        if (node.type === "definition") {
          if (definitions.has(node.identifier)) issues.push({ severity: "blocked", code: "DUPLICATE_DEFINITION", offset: start, message: "Duplicate reference definitions are ambiguous." });
          definitions.set(node.identifier, ref);
        }
      } else if (range || /^!?\[/.test(source.slice(start, start + 2)) || /^file:/i.test(node.url ?? "")) issues.push({ severity: "review", code: "UNSUPPORTED_LINK_LOCATION", offset: start, message: "The exact destination span could not be verified. Review this link manually." });
    }
    if (node.type === "html" && /\b(?:href|src|id|name)\s*=|<\s*(?:a|img)\b/i.test(node.value)) {
      issues.push({ severity: "review", code: "HTML_REFERENCE", offset: start, message: "HTML links and explicit anchors are not rewritten." });
    }
    if (node.type === "text" && /\[\[[\s\S]+?\]\]/.test(node.value)) issues.push({ severity: "review", code: "WIKI_REFERENCE", offset: start, message: "Wiki links are not rewritten." });
    if (node.type === "heading") {
      const text = (node.children ?? []).map((child) => child.type === "text" || child.type === "inlineCode" ? child.value : "\0").join("");
      headings.push({ start, end, text, supported: /^[\p{L}\p{N}\p{M} _-]+$/u.test(text) });
    }
    for (const child of node.children ?? []) walk(child);
  };
  walk(tree);
  // This existing ledger field is project-root relative unless explicitly ./ or ../.
  const field = /^- 기준 문서:[ \t]*`([^`\r\n]+)`[ \t]*$/gm;
  let match;
  while ((match = field.exec(source))) {
    if (protectedRanges.some((range) => range.start <= match.index && range.end > match.index)) continue;
    const start = match.index + match[0].indexOf("`") + 1;
    references.push({ start, end: start + match[1].length, raw: match[1], url: match[1], base: /^\.{1,2}\//.test(match[1]) ? "document-field" : "root", kind: "ledger-field", angle: false });
  }
  return { references: references.sort((a, b) => a.start - b.start), headings, issues };
}

export function applyReferenceEdits(source, edits) {
  let result = source, boundary = source.length;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    if (!Number.isInteger(edit.start) || !Number.isInteger(edit.end) || edit.start < 0 || edit.end < edit.start || edit.end > boundary || source.slice(edit.start, edit.end) !== edit.before) {
      throw new Error("Overlapping or stale reference edits.");
    }
    result = result.slice(0, edit.start) + edit.after + result.slice(edit.end); boundary = edit.start;
  }
  return result;
}

function sourceToken(ref, source, at) {
  return ref.kind === "ledger-field" ? source[at]
    : /^(?:\\[!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~]|&(?:#[xX][\da-fA-F]+|#\d+|[A-Za-z][A-Za-z\d]+);)/.exec(source.slice(at))?.[0] ?? source[at];
}
function urlParts(ref) {
  // Decode Markdown escapes/entities while retaining the exact query/fragment source spelling.
  let decoded = "", suffixAt = ref.raw.length;
  for (let at = 0; at < ref.raw.length;) {
    const token = sourceToken(ref, ref.raw, at);
    const value = ref.kind === "ledger-field" ? token : decodeString(token);
    if (/[?#]/.test(value)) { suffixAt = at; break; }
    decoded += value; at += token.length;
  }
  const suffix = ref.raw.slice(suffixAt);
  let fragmentPrefix = null;
  for (let at = 0; at < suffix.length;) {
    const token = sourceToken(ref, suffix, at), value = ref.kind === "ledger-field" ? token : decodeString(token);
    at += token.length;
    if (value === "#") { fragmentPrefix = suffix.slice(0, at); break; }
  }
  return { path: decoded, rawPath: ref.raw.slice(0, suffixAt), suffix, fragmentPrefix, fragment: ref.url.includes("#") ? ref.url.slice(ref.url.indexOf("#") + 1) : null };
}

function prepared(input) {
  const root = absolutePath(input.root).path;
  const moves = (input.moves ?? []).map((m) => ({ from: resolvePath(root, projectPath(m.from)), to: resolvePath(root, projectPath(m.to)) }));
  const mappings = (input.mappings ?? []).map((m) => ({ oldRoot: absolutePath(m.oldRoot).path, currentRoot: absolutePath(m.currentRoot).path }));
  return { root, moves, mappings };
}

function candidates(input, context, document, ref) {
  const parts = urlParts(ref), local = localUrlPath(parts.path);
  if (local === null) return { external: true, parts };
  const currentDocument = resolvePath(context.root, document.path);
  const originalDocument = resolvePath(context.root, document.previousPath ?? document.path);
  const currentBase = ref.base === "root" ? context.root : parentPath(originalDocument);
  const current = !local ? originalDocument : resolvePath(currentBase, local);
  let old = null;
  if (input.previousRoot) {
    const oldDocument = resolvePath(input.previousRoot, document.previousPath ?? document.path);
    const oldBase = ref.base === "root" ? input.previousRoot : parentPath(oldDocument);
    old = mappedPath(!local ? oldDocument : resolvePath(oldBase, local), context.mappings);
  } else old = mappedPath(current, context.mappings);
  return { parts, local, current, old, currentDocument, originalDocument,
    afterDocument: movePath(currentDocument, context.moves), candidates: [...new Set([current, old].filter(Boolean))] };
}

/** Native callers may inspect only these exact targets before supplying the existence set. */
export function referenceTargets(input) {
  const context = prepared(input), targets = new Set();
  for (const document of input.documents) for (const ref of inspectReferences(document.markdown).references) {
    try { for (const candidate of candidates(input, context, document, ref).candidates ?? []) targets.add(candidate); } catch { /* Final analysis reports the error with its source. */ }
  }
  return [...targets].sort();
}

function anchorMapping(document, removals, inspection) {
  if (!removals.length) return null;
  const edits = removals.map((range) => ({ ...range, before: document.markdown.slice(range.start, range.end), after: "" }));
  for (const range of removals) {
    if (!inspection.headings.some((h) => h.start === range.start) || (range.end !== document.markdown.length && !inspection.headings.some((h) => h.start === range.end))) throw new Error("Section deletion must use exact heading boundaries.");
  }
  if (inspection.headings.some((h) => !h.supported) || inspection.issues.some((i) => i.code === "HTML_REFERENCE")) throw new Error("Anchor syntax is outside the supported plain-heading subset.");
  const beforeCounts = new Map(), afterCounts = new Map(), mapping = new Map();
  const slug = (heading, counts) => {
    const base = heading.text.toLowerCase().replace(/ /g, "-");
    let result = base, n = 0;
    while (counts.has(result)) result = base + "-" + ++n;
    counts.set(result, true); return result;
  };
  for (const heading of inspection.headings) {
    const before = slug(heading, beforeCounts);
    const removed = removals.some((r) => r.start <= heading.start && heading.start < r.end);
    mapping.set(before, removed ? null : slug(heading, afterCounts));
  }
  applyReferenceEdits(document.markdown, edits); // Validate ranges before any result is returned.
  return { edits, mapping };
}

/** Pure analysis: supplied file existence is evidence, never permission to write. */
export function analyzeReferences(input) {
  const context = prepared(input), issues = [], changes = [], references = [];
  const exists = new Set((input.available ?? []).map(pathKey));
  const anchors = new Map();
  const inspections = new Map();
  for (let i = 0; i < context.moves.length; i++) {
    const move = context.moves[i];
    if (move.from === move.to || within(move.from, move.to)) issues.push({ severity: "blocked", code: "INVALID_MOVE", path: move.from, message: "A move must have a distinct destination outside its source." });
    for (let j = 0; j < i; j++) if (within(move.from, context.moves[j].from) || within(context.moves[j].from, move.from) || within(move.to, context.moves[j].to) || within(context.moves[j].to, move.to)) {
      issues.push({ severity: "blocked", code: "OVERLAPPING_MOVE", path: move.from, message: "Move ranges or destinations overlap." });
    }
    if (context.moves.some((other) => within(other.from, move.to))) issues.push({ severity: "blocked", code: "MOVE_CYCLE", path: move.from, message: "Occupied move chains and cycles require separate reviewed operations." });
  }
  for (const document of input.documents) {
    const inspection = inspectReferences(document.markdown); inspections.set(document.path, inspection);
    issues.push(...inspection.issues.map((issue) => ({ ...issue, path: document.path })));
    try {
      const mapping = anchorMapping(document, (input.sectionRemovals ?? []).filter((r) => r.path === document.path), inspection);
      if (mapping) anchors.set(pathKey(resolvePath(context.root, document.previousPath ?? document.path)), mapping);
    } catch (error) { issues.push({ severity: "blocked", code: "ANCHOR_UNCERTAIN", path: document.path, message: error.message }); }
  }
  for (const document of input.documents) {
    const edits = [...(anchors.get(pathKey(resolvePath(context.root, document.previousPath ?? document.path)))?.edits ?? [])];
    for (const ref of inspections.get(document.path).references) {
      if (edits.some((edit) => edit.start <= ref.start && ref.end <= edit.end)) continue;
      try {
        const candidate = candidates(input, context, document, ref);
        if (candidate.external) continue;
        const affected = candidate.originalDocument !== candidate.afterDocument || (input.previousRoot && document.writable) || candidate.candidates.some((p) => movePath(p, context.moves) !== p || anchors.has(pathKey(p)) || mappedPath(p, context.mappings));
        if (!affected && !(input.verifyPaths ?? []).includes(document.path)) continue;
        const matches = candidate.candidates.filter((p) => exists.has(pathKey(p)));
        const unique = [...new Map(matches.map((p) => [pathKey(p), p])).values()];
        if (unique.length !== 1) {
          issues.push({ severity: "blocked", code: unique.length ? "AMBIGUOUS_TARGET" : "MISSING_TARGET", path: document.path, offset: ref.start, candidates: candidate.candidates, message: "The exact original link target could not be uniquely verified." }); continue;
        }
        const target = unique[0], afterTarget = movePath(target, context.moves);
        if (!affected) {
          references.push({ path: document.path, offset: ref.start, beforeTarget: target, afterTarget, before: ref.raw, after: ref.raw });
          continue;
        }
        const base = ref.base === "root" ? context.root : parentPath(candidate.afterDocument);
        let relative = relativePath(base, afterTarget), pathText;
        if (relative === null) {
          if (input.output !== "file-url") { issues.push({ severity: "blocked", code: "CROSS_VOLUME", path: document.path, offset: ref.start, message: "A relative link cannot cross drive or UNC roots. Explicit file-url output is required." }); continue; }
          pathText = fileUrl(afterTarget);
        } else {
          pathText = !candidate.local && pathKey(afterTarget) === pathKey(candidate.afterDocument) ? "" : encodedPath(relative, candidate.parts.rawPath, candidate.local);
          if (candidate.parts.rawPath.endsWith("/") && pathText && !pathText.endsWith("/")) pathText += "/";
          if (ref.base === "document-field" && pathText && !pathText.startsWith(".")) pathText = "./" + pathText;
        }
        let suffix = candidate.parts.suffix;
        const anchor = anchors.get(pathKey(target));
        if (anchor && candidate.parts.fragment !== null) {
          const fragment = decodeURIComponent(candidate.parts.fragment);
          if (!anchor.mapping.has(fragment) || anchor.mapping.get(fragment) === null) {
            issues.push({ severity: "blocked", code: "DELETED_OR_UNKNOWN_ANCHOR", path: document.path, offset: ref.start, message: "A referenced section is removed or its anchor cannot be established." }); continue;
          }
          if (anchor.mapping.get(fragment) !== fragment) suffix = candidate.parts.fragmentPrefix + encodeURIComponent(anchor.mapping.get(fragment));
        }
        const after = pathText + suffix;
        references.push({ path: document.path, offset: ref.start, beforeTarget: target, afterTarget, before: ref.raw, after });
        if (after !== ref.raw) edits.push({ start: ref.start, end: ref.end, before: ref.raw, after });
      } catch (error) { issues.push({ severity: "blocked", code: error.code ?? "INVALID_REFERENCE", path: document.path, offset: ref.start, message: error.message }); }
    }
    if (edits.length) {
      if (!document.writable) issues.push({ severity: "blocked", code: "OUTSIDE_WRITE_SCOPE", path: document.path, message: "This reference needs an edit outside the explicitly selected docs scope." });
      else changes.push({ path: document.path, afterPath: relativePath(context.root, movePath(resolvePath(context.root, document.path), context.moves)), before: document.markdown, after: applyReferenceEdits(document.markdown, edits), edits });
    }
  }
  return { decision: issues.some((i) => i.severity === "blocked") ? "blocked" : issues.length ? "review" : "ready", issues, changes, references };
}
