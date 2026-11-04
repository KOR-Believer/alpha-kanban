import { LEDGER_CONTRACT } from "./ledger-contract.mjs";
import { headerField, scanDocumentHeader, structuralLedgerLines } from "./document-header.mjs";

const allowedStatus = new Set(["TODO", "READY", "IN_PROGRESS", "BLOCKED", "DONE", "DEFERRED"]);
const allowedProgress = new Set([0, 25, 50, 75, 100]);
const required = ["Status", "Progress", "Repository", "Priority", "Type", "Depends on", "목표", "현재 문제", "구현 범위", "제외 범위", "완료 기준", "검증", "진행 메모"];
const known = new Set([...required, "Completed at", "사용자 지시"]);
const clean = (value) => value?.trim().replace(/^`|`$/g, "");

export function inspectLedgerFormat(markdown) {
  const header = scanDocumentHeader(markdown);
  const declared = headerField(header, LEDGER_CONTRACT.formatField);
  const version = declared.value;
  const result = { status: version === null ? "legacy" : "supported", version, readable: true, writable: true, code: null };
  if (header.error || declared.error || (version !== null && !/^[1-9]\d*$/.test(version))) {
    return { ...result, status: "invalid", readable: false, writable: false, code: "INVALID_FORMAT" };
  }
  const format = version ?? "unversioned";
  if (!LEDGER_CONTRACT.readFormats.includes(format)) {
    return { ...result, status: "unsupported", readable: false, writable: false, code: "UNSUPPORTED_FORMAT" };
  }
  if (!LEDGER_CONTRACT.writeFormats.includes(format)) {
    return { ...result, writable: false, code: "UNSUPPORTED_FORMAT" };
  }
  return result;
}

export function inspectTicketCompatibility(markdown) {
  // Structural operation checks only; the display parser never uses these flags.
  const format = inspectLedgerFormat(markdown);
  if (!format.readable) return format;
  const damaged = () => ({ ...format, readable: false, writable: false, code: "NEEDS_REPAIR" });
  if (/\r(?!\n)/.test(markdown) || (markdown.includes("\r\n") && /(?<!\r)\n/.test(markdown))) return damaged();
  const lines = structuralLedgerLines(markdown);
  const sections = (name) => lines.flatMap((line, index) => line.trim() === `## ${name}` ? [index] : []);
  const statusSections = sections("Status"), ticketSections = sections("Ticket List");
  if (statusSections.length !== 1 || ticketSections.length !== 1) return damaged();
  const endOf = (start) => {
    const next = lines.findIndex((line, index) => index > start && /^##\s+/.test(line));
    return next < 0 ? lines.length : next;
  };
  const progress = lines.slice(statusSections[0] + 1, endOf(statusSections[0])).filter((line) => line.startsWith("- 현재 진행률:"));
  if (progress.length !== 1 || !/^\s*`?\d+\s*\/\s*\d+\s+tickets`?\s*$/.test(progress[0].slice("- 현재 진행률:".length))) return damaged();
  const start = ticketSections[0], end = endOf(start);
  const headings = [];
  for (let at = start + 1; at < end; at++) {
    if (!/^ {0,3}###(?:[ \t]+|$)/.test(lines[at])) continue;
    const match = /^ {0,3}###\s+([A-Za-z0-9]+-\d+[A-Za-z]*)\.\s+(.+?)\s*$/.exec(lines[at]);
    headings.push({ index: at, id: match?.[1] });
  }
  const ids = headings.flatMap((heading) => heading.id ? [heading.id] : []);
  if (new Set(ids).size !== ids.length) return damaged();
  for (let i = 0; i < headings.length; i++) {
    const fields = new Map();
    const body = lines.slice(headings[i].index + 1, headings[i + 1]?.index ?? end);
    if (!headings[i].id) {
      if (body.some((line) => /^(Status|Progress):/.test(line))) return damaged();
      continue;
    }
    for (const line of body) {
      const match = /^([^:]+):(.*)$/.exec(line);
      if (!match || !known.has(match[1])) continue;
      if (fields.has(match[1])) return damaged();
      fields.set(match[1], clean(match[2]));
    }
    if (required.some((field) => !fields.has(field)) || !allowedStatus.has(fields.get("Status")) ||
      !/^\d+%?$/.test(fields.get("Progress")) || !allowedProgress.has(Number.parseInt(fields.get("Progress"), 10))) return damaged();
  }
  return format;
}

export function assertTicketCompatibility(markdown) {
  const result = inspectTicketCompatibility(markdown);
  if (!result.writable) {
    const error = new Error(`${result.code}: Structural editing is unavailable. Inspect the original Markdown and use a supporting tool or repair the format explicitly.`);
    error.code = result.code;
    throw error;
  }
  return result;
}

export { structuralLedgerLines };
