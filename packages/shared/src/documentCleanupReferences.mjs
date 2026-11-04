import { fromMarkdown } from "mdast-util-from-markdown";
import { decodeString } from "micromark-util-decode-string";
import GithubSlugger from "github-slugger";
import { scanDocumentHeader } from "../../../skills/implementation-ledger/scripts/lib/document-header.mjs";
import { localUrlPath, parentPath, pathKey, resolvePath } from "./documentPaths.mjs";

// Cleanup only observes links. Unlike a move, it never repairs paths or reports
// unrelated syntax/target errors from the documents it reads.
function inspect(source) {
  const header = scanDocumentHeader(source);
  const end = header.frontMatterEnd ? header.lines[header.frontMatterEnd - 1].end : 0;
  const masked = source.slice(0, end).replace(/[^\r\n]/g, " ") + source.slice(end);
  const tree = fromMarkdown(masked.replace(/^\uFEFF/, " "));
  const headings = [], references = [], definitions = new Map(), uses = [], protectedRanges = [];
  const text = (node) => node.type === "html" ? "" : node.value ?? node.alt ?? (node.children ?? []).map(text).join("");
  const walk = (node) => {
    const start = node.position?.start.offset ?? 0, finish = node.position?.end.offset ?? start;
    if (["code", "inlineCode"].includes(node.type)) { protectedRanges.push({ start, end: finish }); return; }
    if (node.type === "heading") headings.push({ start, text: text(node) });
    if (["link", "image"].includes(node.type)) references.push({ url: node.url, start, end: finish });
    if (node.type === "definition" && !definitions.has(node.identifier)) definitions.set(node.identifier, node.url);
    if (["linkReference", "imageReference"].includes(node.type)) uses.push({ identifier: node.identifier, start, end: finish });
    if (node.type === "html") {
      protectedRanges.push({ start, end: finish });
      // Only literal HTML links are evidence; comments and executable content are not.
      if (!/^\s*<!--|^\s*<(?:script|style)\b/i.test(node.value)) {
        for (const match of node.value.matchAll(/<a\b[^>]*?\s+href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))[^>]*>/gi)) {
          references.push({ url: decodeString(match[1] ?? match[2] ?? match[3]), start: start + match.index, end: start + match.index + match[0].length });
        }
      }
    }
    if (node.type === "text") for (const match of source.slice(start, finish).matchAll(/(?<!\\)\[\[([^\]\r\n]+)\]\]/g)) {
      references.push({ url: match[1].split("|")[0].trim(), wiki: true, start: start + match.index, end: start + match.index + match[0].length });
    }
    for (const child of node.children ?? []) walk(child);
  };
  walk(tree);
  for (const use of uses) if (definitions.has(use.identifier)) references.push({ ...use, url: definitions.get(use.identifier) });
  // Preserve the existing root-relative meaning of the ledger's reference field.
  for (const match of masked.matchAll(/^- 기준 문서:[ \t]*`([^`\r\n]+)`[ \t]*$/gm)) {
    if (protectedRanges.some((range) => range.start <= match.index && match.index < range.end)) continue;
    references.push({ url: match[1], base: /^\.{1,2}\//.test(match[1]) ? "document" : "root", start: match.index, end: match.index + match[0].length });
  }
  return { headings, references: references.sort((a, b) => a.start - b.start) };
}

function slugs(headings, edits = []) {
  const slugger = new GithubSlugger(), result = new Map();
  for (const heading of headings) if (!edits.some((edit) => edit.start <= heading.start && heading.start < edit.end)) result.set(heading.start, slugger.slug(heading.text));
  return result;
}

function destination(root, source, ref, documents, relativeOnly) {
  try {
    const hash = ref.url.indexOf("#");
    if (hash < 0 || hash === ref.url.length - 1) return null;
    const fragment = decodeURIComponent(ref.url.slice(hash + 1));
    const local = localUrlPath(ref.url.slice(0, hash).split("?")[0]);
    if (local === null || (relativeOnly && /^(?:[/\\]|[A-Za-z]:)/.test(local))) return null;
    const sourcePath = resolvePath(root, source.path);
    const paths = [local ? resolvePath(ref.base === "root" ? root : parentPath(sourcePath), local) : sourcePath];
    // Wiki links may omit .md, but never locate a document by a guessed basename.
    if (ref.wiki && local) {
      paths.push(resolvePath(root, local));
      for (const path of [...paths]) if (!/\.md$/i.test(path)) paths.push(path + ".md");
    }
    const matches = [...new Set(paths.map(pathKey))].filter((key) => documents.has(key));
    return matches.length === 1 ? { key: matches[0], fragment, wiki: ref.wiki } : null;
  } catch { return null; }
}

/** Keep only sections whose removal would affect an observed, resolvable link. */
export function preserveReferencedSections({ root, documents, sections, relativeReferencesOnly = false }) {
  if (!sections.length) return { sections, retained: [], references: [] };
  const byPath = new Map(documents.map((document) => [pathKey(resolvePath(root, document.path)), document]));
  const inspections = new Map(documents.map((document) => [document.path, inspect(document.markdown)]));
  const originals = new Map([...inspections].map(([path, inspection]) => [path, slugs(inspection.headings)]));
  const active = new Set(sections), retained = new Map(), references = new Map();
  const editsFor = (path, except) => [...active].filter((section) => section.path === path && section !== except).flatMap((section) => section.edits);
  const retain = (section, source, ref, target) => {
    active.delete(section);
    retained.set(section, { path: section.path, rule: section.rule, section: section.section, code: "LEGACY_REFERENCED_SECTION", message: "This section was kept to preserve an existing link." });
    const absolute = resolvePath(root, target.path);
    references.set(`${source.path}:${ref.start}:${absolute}`, { path: source.path, offset: ref.start, beforeTarget: absolute, afterTarget: absolute, before: ref.url, after: ref.url });
  };
  // Retaining one section may expose its links to another candidate. Re-evaluate
  // until stable; links that disappear with their own section do not retain it.
  let changed;
  do {
    changed = false;
    for (const source of documents) for (const ref of inspections.get(source.path).references) {
      if (editsFor(source.path).some((edit) => edit.start <= ref.start && ref.end <= edit.end)) continue;
      const to = destination(root, source, ref, byPath, relativeReferencesOnly);
      if (!to) continue;
      const target = byPath.get(to.key), before = originals.get(target.path);
      const fragment = to.wiki && ![...before.values()].includes(to.fragment) ? new GithubSlugger().slug(to.fragment) : to.fragment;
      const entry = [...before].find(([, slug]) => slug === fragment);
      if (!entry) continue; // A pre-existing missing anchor is not a cleanup error.
      const [at] = entry, headings = inspections.get(target.path).headings;
      for (const section of [...active]) if (section.path === target.path && section.start <= at && at < section.end) {
        retain(section, source, ref, target); changed = true;
      }
      // A removed heading can also renumber a later, referenced duplicate. Keep
      // the contributing section instead of rewriting any referring document.
      if (slugs(headings, editsFor(target.path)).get(at) !== fragment) {
        const candidates = [...active].filter((section) => section.path === target.path && section.start < at && section.edits.some((edit) => headings.some((heading) => edit.start <= heading.start && heading.start < edit.end)));
        // Some collisions require more than one original heading (e.g. two
        // "Board" headings preceding "Board-1"). Minimize the kept set together
        // so an unrelated guide is not retained just because it comes earlier.
        const needed = new Set(candidates);
        for (const section of candidates) {
          needed.delete(section);
          const edits = [...active].filter((item) => item.path === target.path && !needed.has(item)).flatMap((item) => item.edits);
          if (slugs(headings, edits).get(at) !== fragment) needed.add(section);
        }
        for (const section of needed) { retain(section, source, ref, target); changed = true; }
      }
    }
  } while (changed);
  return { sections: sections.filter((section) => active.has(section)), retained: sections.filter((section) => retained.has(section)).map((section) => retained.get(section)), references: [...references.values()] };
}
