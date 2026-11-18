import { fromMarkdown } from "mdast-util-from-markdown";
import { scanDocumentHeader } from "../../../skills/implementation-ledger/scripts/lib/document-header.mjs";
import { readDocumentMetadata, normalizeDocumentId } from "../../../skills/implementation-ledger/scripts/lib/document-metadata.mjs";

export const SMOKE_RESULTS = Object.freeze(["NOT_RUN", "PASS", "FAIL", "BLOCKED", "SKIPPED"]);
const rootNames = ["메모", "실행 당시 공통 조건", "Test Cases"];
const caseNames = ["사전조건", "수행 절차", "기대 결과", "기록"];
const logNames = ["메모", "증거", "수정 사유"];
const caseIdPattern = /^[A-Z][A-Z0-9]*-[0-9]{3,}$/;

export function smokeFileKind(path) {
  if (path.endsWith("_smoke_run.md")) return "smoke-run";
  if (path.endsWith("_smoke.md")) return "smoke";
  return null;
}

/** Pure, lossless reading. Diagnostics constrain later writes, never Markdown display. */
export function parseSmokeDocument(source, kind, { newRun = false } = {}) {
  if (kind !== "smoke" && kind !== "smoke-run") throw new TypeError("Expected a smoke document kind.");
  try { return readSmokeDocument(source, kind, newRun); }
  catch {
    // A parser failure must not prevent the surrounding project from listing/reading files.
    return { kind, source, title: "", documentId: null, owner: null, fields: [], sections: [], memo: null, common: null, run: null, cases: [], counts: null,
      format: { status: "invalid", version: null, readable: false, writable: false, code: "PARSER_ERROR" }, valid: false,
      diagnostics: [{ code: "PARSER_ERROR", message: "Structural analysis failed. Read the original Markdown.", scope: "document", severity: "error",
        range: { start: 0, end: source.length, startLine: 1, endLine: source.split(/\r\n|\r|\n/).length } }] };
  }
}

function readSmokeDocument(source, kind, newRun) {
  const header = scanDocumentHeader(source), metadata = readDocumentMetadata(source);
  const lineStarts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\r" && source[i + 1] === "\n") i++;
    if (source[i] === "\n" || source[i] === "\r") lineStarts.push(i + 1);
  }
  const lineAt = (offset) => {
    let lo = 0, hi = lineStarts.length;
    while (lo + 1 < hi) { const mid = (lo + hi) >>> 1; if (lineStarts[mid] <= offset) lo = mid; else hi = mid; }
    return lo + 1;
  };
  const range = (start, end) => ({ start, end, startLine: lineAt(start), endLine: lineAt(Math.max(start, end - 1)) });
  const diagnostics = [];
  const issue = (code, message, scope, at = range(0, source.length), severity = "error") => diagnostics.push({ code, message, scope, range: at, severity });
  // Only root AST nodes can introduce structure. Quoted/list/code/HTML examples cannot.
  // The Markdown tokenizer consumes a leading BOM without counting its offset.
  // A same-length space preserves every source position and the valid H1.
  const nodes = fromMarkdown(source.replace(/^\uFEFF/, " ")).children.filter(node => node.position.start.line > header.frontMatterEnd);
  const paragraphs = nodes.filter(node => node.type === "paragraph");
  const protectedRanges = [];
  const pending = [...nodes].reverse();
  while (pending.length) {
    const node = pending.pop();
    if (node.type === "html" || node.type === "inlineCode") {
      protectedRanges.push({ start: node.position.start.offset, end: node.position.end.offset });
      if (node.type === "html" && node.value.startsWith("<!--") && !node.value.includes("-->")) issue("UNCLOSED_COMMENT", "An HTML comment is not closed.", "document", range(node.position.start.offset, node.position.end.offset));
    } else pending.push(...[...(node.children ?? [])].reverse());
  }
  const protectedAt = offset => protectedRanges.some(span => span.start <= offset && offset < span.end);
  const between = (items, start, end, offset = item => item.range.start) => {
    const lower = value => { let lo = 0, hi = items.length; while (lo < hi) { const mid = (lo + hi) >>> 1; if (offset(items[mid]) < value) lo = mid + 1; else hi = mid; } return lo; };
    return items.slice(lower(start), lower(end));
  };
  const headings = nodes.filter(node => node.type === "heading").flatMap(node => {
    const raw = source.slice(node.position.start.offset, node.position.end.offset).replace(/^\uFEFF/, "");
    const match = /^(#{1,6})[ \t]+(.*?)(?:[ \t]+#+[ \t]*)?$/.exec(raw);
    return match ? [{ depth: match[1].length, text: match[2].trim(), range: range(node.position.start.offset, node.position.end.offset) }] : [];
  });
  const afterHeading = heading => lineStarts[heading.range.endLine] ?? source.length;
  const rootHeadings = headings.filter(h => h.depth === 2 && rootNames.includes(h.text));
  const bodySection = (heading, end) => ({ name: heading.text, headingRange: heading.range,
    range: range(afterHeading(heading), end), content: source.slice(afterHeading(heading), end) });
  const rootSections = rootHeadings.map((heading, i) => bodySection(heading, rootHeadings[i + 1]?.range.start ?? source.length));
  const chooseSection = (sections, name, scope, required = true) => {
    const found = sections.filter(section => section.name === name);
    if (found.length !== 1) {
      if (found.length || required) issue(found.length ? "DUPLICATE_SECTION" : "MISSING_SECTION", `Expected one ${name} section.`, scope, found[0]?.headingRange);
      return null;
    }
    return found[0];
  };
  const ordered = (sections, names, scope) => {
    const actual = sections.map(s => names.indexOf(s.name)).filter(index => index >= 0);
    if (actual.some((index, i) => i && index < actual[i - 1])) issue("SECTION_ORDER", "Reserved sections are out of order.", scope, sections[0]?.headingRange);
  };
  const toField = field => ({ name: field.name, value: field.value, range: range(field.start, field.end), raw: source.slice(field.start, field.end) });
  const fields = header.fields.filter(field => !protectedAt(field.start)).map(toField);
  const bodyFields = (start, end) => {
    const result = [];
    // A prose line, child heading or non-paragraph block ends the scalar header.
    const candidates = between(paragraphs, start, end, node => node.position.start.offset);
    let paragraphIndex = 0;
    for (let i = lineAt(start) - 1; i < lineStarts.length && lineStarts[i] < end; i++) {
      const at = lineStarts[i], next = Math.min(lineStarts[i + 1] ?? source.length, end);
      const text = source.slice(at, next).replace(/[\r\n]+$/, "");
      if (!text.trim()) continue;
      while (candidates[paragraphIndex]?.position.end.offset < at) paragraphIndex++;
      const paragraph = candidates[paragraphIndex];
      if (!paragraph || at < paragraph.position.start.offset || paragraph.position.end.offset > end || protectedAt(at)) break;
      const match = /^([\p{L}][\p{L}\p{N} _-]*):[ \t]*(.*)$/u.exec(text);
      if (!match) break;
      result.push({ name: match[1], value: match[2], range: range(at, next), raw: source.slice(at, next) });
    }
    return result;
  };
  const get = (entries, name, scope, validate = value => value.trim() ? value : null, required = true) => {
    const found = entries.filter(field => field.name.trim().toLowerCase() === name.toLowerCase());
    if (found.length !== 1) {
      if (found.length || required) issue(found.length ? "DUPLICATE_FIELD" : "MISSING_FIELD", `Expected one ${name} field.`, scope, found[0]?.range);
      return null;
    }
    if (found[0].name !== name) { issue("INVALID_FIELD", `Spell the field exactly ${name}.`, scope, found[0].range); return null; }
    const value = validate(found[0].value);
    if (value === null) issue("INVALID_VALUE", `Invalid ${name} value.`, scope, found[0].range);
    return value;
  };
  const forbid = (entries, names, scope) => {
    for (const field of entries) if (names.some(name => name.toLowerCase() === field.name.trim().toLowerCase())) issue("UNEXPECTED_FIELD", `${field.name} is not allowed here.`, scope, field.range);
  };
  const duplicateFields = (entries, scope) => {
    const names = new Set();
    for (const field of entries) {
      const name = field.name.trim().toLowerCase();
      if (names.has(name)) issue("DUPLICATE_FIELD", `Duplicate ${field.name} field.`, scope, field.range);
      names.add(name);
    }
  };
  const enumValue = values => value => values.includes(value) ? value : null;
  const positive = value => /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
  const date = value => {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
    if (!match || !Number.isFinite(Date.parse(value))) return null;
    const month = Number(match[2]), day = Number(match[3]);
    return month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(Number(match[1]), month, 0)).getUTCDate() ? value : null;
  };
  const scope = "document";
  duplicateFields(fields, scope);
  if (/\r(?!\n)/.test(source) || (source.includes("\r\n") && /(?<!\r)\n/.test(source))) issue("MIXED_LINE_ENDINGS", "Structural writes require consistent LF or CRLF line endings.", scope);
  if (header.error) issue(header.error, "The document metadata header is incomplete.", scope);
  if (!headings.some(h => h.depth === 1 && h.range.startLine === (header.title ?? -2) + 1)) issue("MISSING_TITLE", "Expected a top-level H1 title.", scope);
  const documentId = get(fields, "Document-ID", scope, normalizeDocumentId);
  if (metadata.owner.status === "invalid") issue("INVALID_OWNER", "Owner metadata is invalid.", scope);
  if (!metadata.format.writable) issue("UNSUPPORTED_FORMAT", "The declared ledger format does not permit structural writes.", scope);
  const memo = chooseSection(rootSections, "메모", scope);
  const common = chooseSection(rootSections, "실행 당시 공통 조건", scope, kind === "smoke-run");
  const testCases = chooseSection(rootSections, "Test Cases", scope);
  ordered(rootSections, kind === "smoke" ? ["메모", "Test Cases"] : rootNames, scope);
  if (kind === "smoke" && common) issue("UNEXPECTED_SECTION", "A definition cannot contain a run snapshot section.", scope, common.headingRange);
  const run = kind === "smoke-run" ? {
    sourceId: get(fields, "Smoke-Document-ID", scope, normalizeDocumentId),
    sourceTitle: get(fields, "Smoke-Title", scope),
    sourcePath: get(fields, "Smoke-Path", scope, value => value && !/[\\\u0000-\u001f\u007f:]/.test(value) && !value.split("/").some(part => !part || part === "." || part === "..") ? value : null),
    number: get(fields, "Run", scope, positive), state: get(fields, "Run-State", scope, enumValue(["OPEN", "CLOSED"])),
    target: get(fields, "Target", scope), environment: get(fields, "Environment", scope), createdAt: get(fields, "Created at", scope, date),
  } : null;
  if (run) {
    run.closedAt = get(fields, "Closed at", scope, date, run.state === "CLOSED");
    run.closeReason = get(fields, "Close reason", scope, undefined, run.state === "CLOSED");
    if (run.state === "OPEN") forbid(fields, ["Closed at", "Close reason"], scope);
    if (run.createdAt && run.closedAt && Date.parse(run.closedAt) < Date.parse(run.createdAt)) issue("INVALID_CHRONOLOGY", "Closing precedes creation.", scope);
    if (newRun && run.state !== "OPEN") issue("NEW_RUN_STATE", "New runs start OPEN.", scope);
  }
  const within = (heading, section) => section && heading.range.start >= section.range.start && heading.range.start < section.range.end;
  const isCase = h => h.depth === 3 && /^(?:[A-Za-z][A-Za-z0-9]*-\d+\w*|[A-Z][A-Z0-9]*-[^\s.]+)(?:\.\s+|\s*$)/.test(h.text);
  const isLog = h => h.depth === 5 && h.text.startsWith("LOG-");
  const caseHeadings = headings.filter(h => isCase(h) && within(h, testCases));
  const consumed = new Set(rootHeadings);
  const cases = caseHeadings.map((heading, caseIndex) => {
    consumed.add(heading);
    const end = caseHeadings[caseIndex + 1]?.range.start ?? testCases.range.end;
    const caseRange = range(heading.range.start, end), caseScope = `case:${caseIndex}`;
    const match = /^(\S+)\.\s+(.+)$/.exec(heading.text);
    const id = match && caseIdPattern.test(match[1]) ? match[1] : null;
    if (!id) issue("INVALID_TC_ID", "Expected a stable TC ID and title.", caseScope, heading.range);
    const children = between(headings, afterHeading(heading), end);
    const ownHeadings = children.filter(h => h.depth === 4 && caseNames.includes(h.text));
    ownHeadings.forEach(h => consumed.add(h));
    const sections = ownHeadings.map((h, i) => bodySection(h, ownHeadings[i + 1]?.range.start ?? end));
    const ownFields = bodyFields(afterHeading(heading), children.find(h => h.depth > 3)?.range.start ?? end);
    duplicateFields(ownFields, caseScope);
    const revision = get(ownFields, "Revision", caseScope, positive), lifecycle = get(ownFields, "Lifecycle", caseScope, enumValue(["ACTIVE", "RETIRED"]));
    const summary = get(ownFields, "Summary", caseScope), changeReason = get(ownFields, "Change reason", caseScope);
    const retiredAt = get(ownFields, "Retired at", caseScope, date, lifecycle === "RETIRED");
    const retirementReason = get(ownFields, "Retirement reason", caseScope, undefined, lifecycle === "RETIRED");
    if (lifecycle === "ACTIVE") forbid(ownFields, ["Retired at", "Retirement reason"], caseScope);
    if (kind === "smoke-run" && lifecycle === "RETIRED") issue("RETIRED_SNAPSHOT", "Runs retain the ACTIVE definition selected at creation.", caseScope, heading.range);
    const prerequisites = chooseSection(sections, "사전조건", caseScope), steps = chooseSection(sections, "수행 절차", caseScope), expected = chooseSection(sections, "기대 결과", caseScope);
    for (const section of [prerequisites, steps, expected]) if (section && !section.content.trim()) issue("EMPTY_CRITERIA", "A required criterion is empty.", caseScope, section.range);
    const records = chooseSection(sections, "기록", caseScope, kind === "smoke-run");
    ordered(sections, caseNames, caseScope);
    const result = kind === "smoke-run" ? get(ownFields, "Result", caseScope, enumValue(SMOKE_RESULTS)) : null;
    if (kind === "smoke") {
      forbid(ownFields, ["Result"], caseScope);
      if (records) issue("DEFINITION_RESULTS", "Definitions do not contain execution records.", caseScope, records.headingRange);
    }
    const logHeadings = children.filter(h => isLog(h) && within(h, records));
    let previousResult = "NOT_RUN", previousNumber = 0;
    const logs = logHeadings.map((h, logIndex) => {
      consumed.add(h);
      const logEnd = logHeadings[logIndex + 1]?.range.start ?? records.range.end;
      const logScope = `${caseScope}/log:${logIndex}`, logRange = range(h.range.start, logEnd);
      const logNumber = /^LOG-\d{3,}$/.test(h.text) ? Number(h.text.slice(4)) : null;
      if (!Number.isSafeInteger(logNumber) || logNumber < 1 || logNumber <= previousNumber || (!logIndex && logNumber !== 1)) issue("INVALID_LOG_ID", "Log numbers start at 001 and increase without duplicates.", logScope, h.range);
      previousNumber = logNumber ?? previousNumber;
      const logChildren = between(children, afterHeading(h), logEnd);
      const logSectionHeadings = logChildren.filter(child => child.depth === 6 && logNames.includes(child.text));
      logSectionHeadings.forEach(child => consumed.add(child));
      const logSections = logSectionHeadings.map((child, i) => bodySection(child, logSectionHeadings[i + 1]?.range.start ?? logEnd));
      const logFields = bodyFields(afterHeading(h), logChildren.find(child => child.depth > 5)?.range.start ?? logEnd);
      duplicateFields(logFields, logScope);
      const logKind = get(logFields, "Kind", logScope, enumValue(["EXECUTION", "USER_EDIT", "NOTE"]));
      const at = get(logFields, "At", logScope, date), actor = get(logFields, "Actor", logScope, undefined, false);
      const method = get(logFields, "Method", logScope, enumValue(["HUMAN", "COMPUTER_USE", "BROWSER_USE"]), logKind === "EXECUTION");
      if (logKind && logKind !== "EXECUTION") forbid(logFields, ["Method"], logScope);
      const from = get(logFields, "From", logScope, enumValue(SMOKE_RESULTS)), to = get(logFields, "To", logScope, enumValue(SMOKE_RESULTS));
      if (from !== previousResult) issue("LOG_CHAIN", "From does not match the previous result.", logScope, h.range);
      previousResult = to;
      const note = chooseSection(logSections, "메모", logScope), evidence = chooseSection(logSections, "증거", logScope);
      const reason = chooseSection(logSections, "수정 사유", logScope, logKind === "USER_EDIT");
      ordered(logSections, logNames, logScope);
      if (logKind === "EXECUTION" && (!note?.content.trim() || !["PASS", "FAIL", "BLOCKED"].includes(to))) issue("INVALID_EXECUTION", "Execution requires an observation and PASS, FAIL or BLOCKED.", logScope, logRange);
      if (logKind === "USER_EDIT" && !reason?.content.trim()) issue("MISSING_EDIT_REASON", "User corrections require a reason.", logScope, logRange);
      if (logKind && logKind !== "USER_EDIT" && reason) issue("UNEXPECTED_SECTION", "Only user corrections contain a correction reason.", logScope, reason.headingRange);
      if (logKind === "NOTE" && from !== to) issue("NOTE_RESULT_CHANGE", "A note cannot change the result.", logScope, logRange);
      return { id: h.text, kind: logKind, at, actor, method, from, to, memo: note, evidence, reason, fields: logFields, sections: logSections, range: logRange };
    });
    if (kind === "smoke-run" && result !== previousResult) issue("RESULT_HISTORY_MISMATCH", "Result must match the final record, or NOT_RUN without records.", caseScope, caseRange);
    if (newRun && kind === "smoke-run" && (result !== "NOT_RUN" || logs.length)) issue("NEW_RUN_RESULTS", "New runs cannot inherit earlier results or records.", caseScope, caseRange);
    return { id, title: match?.[2] ?? heading.text, revision, lifecycle, summary, changeReason, retiredAt, retirementReason,
      result, fields: ownFields, sections, prerequisites, steps, expected, records, logs, range: caseRange };
  });
  if (!cases.length) issue("MISSING_CASES", "Expected at least one TC.", scope, testCases?.range);
  const caseIds = new Set();
  cases.forEach((row, i) => { if (row.id && caseIds.has(row.id)) issue("DUPLICATE_TC_ID", "TC IDs must be unique in this document.", `case:${i}`, row.range); caseIds.add(row.id); });
  for (const heading of headings) {
    const reserved = isCase(heading) || isLog(heading) || (heading.depth === 4 && caseNames.includes(heading.text)) || (heading.depth === 6 && logNames.includes(heading.text));
    if (reserved && !consumed.has(heading)) issue("MISPLACED_STRUCTURE", "Reserved structure is outside its allowed section.", scope, heading.range);
  }
  // CommonMark accepts an unclosed fence to EOF; safe structural writing cannot.
  const checkFences = node => {
    if (node.type === "code") {
      const raw = source.slice(node.position.start.offset, node.position.end.offset);
      const first = /^(`{3,}|~{3,})/.exec(raw)?.[1];
      if (first) {
        const last = raw.split(/\r\n|\r|\n/).at(-1).trim();
        if (raw.indexOf("\n") < 0 || !new RegExp(`^${first[0]}{${first.length},}$`).test(last)) issue("UNCLOSED_FENCE", "A code fence is not closed.", scope, range(node.position.start.offset, node.position.end.offset));
      }
    }
  };
  nodes.forEach(checkFences);
  const counts = kind === "smoke-run" ? Object.fromEntries([...SMOKE_RESULTS, "invalid"].map(result => [result, cases.filter(row => (row.result ?? "invalid") === result).length])) : null;
  return { kind, source, title: header.title === null ? "" : header.lines[header.title].text.replace(/^#\s+/, ""), documentId, owner: fields.some(field => field.name === "Owner") ? metadata.owner.value : null,
    format: metadata.format, fields, sections: rootSections, memo, common, run, cases, counts, diagnostics, valid: !diagnostics.some(item => item.severity === "error") };
}

/** Project-scoped identity only. Names, slugs, paths and other projects never fill gaps. */
export function buildSmokeIndex(entries) {
  const projects = new Map();
  for (const entry of entries) {
    let ids = projects.get(entry.projectId); if (!ids) projects.set(entry.projectId, ids = new Map());
    const id = normalizeDocumentId(entry.documentId ?? entry.document?.documentId);
    if (id) { const files = ids.get(id) ?? new Map(); files.set(entry.localId, entry); ids.set(id, files); }
  }
  const duplicates = [...projects].flatMap(([projectId, ids]) => [...ids].filter(([, files]) => files.size > 1).map(([documentId, files]) => ({ projectId, documentId, localIds: [...files.keys()] })));
  const runs = entries.filter(entry => entry.document?.kind === "smoke-run").map(entry => {
    const ids = projects.get(entry.projectId), sourceId = entry.document.run?.sourceId;
    const own = ids?.get(entry.document.documentId), sources = ids?.get(sourceId);
    const source = sources?.size === 1 ? [...sources.values()][0] : null;
    const status = !entry.document.documentId || !sourceId ? "invalid" : own?.size > 1 || sources?.size > 1 ? "ambiguous"
      : !source ? "orphan" : source.document?.kind !== "smoke" ? "wrong-type" : source.document.documentId !== sourceId ? "invalid" : "linked";
    return { projectId: entry.projectId, localId: entry.localId, sourceId, sourceLocalId: status === "linked" ? source.localId : null,
      status, number: entry.document.run?.number ?? null, duplicateNumber: false };
  });
  const numbers = new Map();
  for (const run of runs) {
    if (!run.sourceId || !run.number) continue;
    const key = JSON.stringify([run.projectId, run.sourceId, run.number]);
    const group = numbers.get(key) ?? []; group.push(run); numbers.set(key, group);
  }
  for (const group of numbers.values()) if (group.length > 1) group.forEach(run => run.duplicateNumber = true);
  const definitions = entries.filter(entry => entry.document?.kind === "smoke").map(entry => ({ projectId: entry.projectId, localId: entry.localId,
    documentId: entry.document.documentId, duplicate: (projects.get(entry.projectId)?.get(entry.document.documentId)?.size ?? 0) > 1,
    runLocalIds: runs.filter(run => run.projectId === entry.projectId && run.sourceLocalId === entry.localId).map(run => run.localId) }));
  return { definitions, runs, duplicates };
}
