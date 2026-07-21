#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const REQUIRED_FIELDS = [
  "Status",
  "Progress",
  "Repository",
  "Priority",
  "Type",
  "Depends on",
  "목표",
  "현재 문제",
  "구현 범위",
  "제외 범위",
  "완료 기준",
  "검증",
  "사용자 지시",
  "진행 메모",
];

const FIELD_NAMES = new Set([...REQUIRED_FIELDS, "Completed at"]);
const STATUS_PROGRESS = new Map([
  ["TODO", new Set([0])],
  ["READY", new Set([25])],
  ["IN_PROGRESS", new Set([50, 75])],
  ["BLOCKED", new Set([0, 25, 50, 75])],
  ["DEFERRED", new Set([0, 25, 50, 75])],
  ["DONE", new Set([100])],
]);

const args = process.argv.slice(2);
const legacy = args.includes("--legacy");
const filePath = args.find((arg) => !arg.startsWith("--"));

if (!filePath) {
  console.error("Usage: node check-ledger.mjs <alpha-kanban-ticket-file> [--legacy]");
  process.exit(2);
}

const source = readFileSync(filePath, "utf8");
const lines = source.replace(/\r\n/g, "\n").split("\n");
const errors = [];
const warnings = [];
const statusSections = findSections(lines, "Status");
const ticketListSections = findSections(lines, "Ticket List");

if (!path.basename(filePath).endsWith("_tickets.md")) {
  errors.push("Filename must end with the exact Alpha Kanban suffix _tickets.md.");
}
if (statusSections.length !== 1) {
  errors.push(`Expected one ## Status section, found ${statusSections.length}.`);
}
if (ticketListSections.length !== 1) {
  errors.push(`Expected one ## Ticket List section, found ${ticketListSections.length}.`);
}

const ticketListSection = ticketListSections[0];
const tickets = ticketListSection
  ? findTickets(lines, ticketListSection.start, ticketListSection.end)
  : [];
const outsideTickets = findTickets(lines).filter(
  (ticket) =>
    !ticketListSection ||
    ticket.start < ticketListSection.start ||
    ticket.start >= ticketListSection.end,
);

if (outsideTickets.length > 0) {
  errors.push(
    `Ticket headings must be inside ## Ticket List: ${outsideTickets.map((ticket) => ticket.id).join(", ")}.`,
  );
}

if (tickets.length === 0) {
  errors.push("No ticket headings were found.");
}

const idCounts = new Map();
for (const ticket of tickets) {
  idCounts.set(ticket.id, (idCounts.get(ticket.id) ?? 0) + 1);
}
for (const [id, count] of idCounts) {
  if (count > 1) errors.push(`${id}: duplicate ticket heading (${count}).`);
}

for (const ticket of tickets) {
  validateTicket(ticket, lines, { errors, legacy, warnings });
}

validateSummary(lines, tickets, statusSections[0], errors);

console.log(`${filePath}: ${tickets.length} ticket(s)`);
for (const warning of warnings) console.log(`warning: ${warning}`);
for (const error of errors) console.error(`error: ${error}`);

if (errors.length > 0) {
  process.exit(1);
}

console.log("OK");

function findTickets(documentLines, start = 0, end = documentLines.length) {
  const headings = [];
  let fence;

  for (let index = start; index < end; index += 1) {
    const marker = fenceMarker(documentLines[index]);
    if (marker) {
      fence = fence ? (marker[0] === fence[0] && marker.length >= fence.length ? undefined : fence) : marker;
      continue;
    }
    if (fence) continue;

    const match = documentLines[index].match(/^###\s+([A-Za-z0-9]+-\d+)\.\s+(.+?)\s*$/);
    if (match) headings.push({ id: match[1], start: index, title: match[2] });
  }

  return headings.map((heading, index) => ({
    ...heading,
    end: headings[index + 1]?.start ?? end,
  }));
}

function findSections(documentLines, title) {
  const headings = [];
  let fence;

  for (let index = 0; index < documentLines.length; index += 1) {
    const marker = fenceMarker(documentLines[index]);
    if (marker) {
      fence = fence ? (marker[0] === fence[0] && marker.length >= fence.length ? undefined : fence) : marker;
      continue;
    }
    if (!fence && documentLines[index].trim() === `## ${title}`) headings.push(index);
  }

  return headings.map((headingLine) => {
    let end = documentLines.length;
    let sectionFence;
    for (let index = headingLine + 1; index < documentLines.length; index += 1) {
      const marker = fenceMarker(documentLines[index]);
      if (marker) {
        sectionFence = sectionFence
          ? marker[0] === sectionFence[0] && marker.length >= sectionFence.length
            ? undefined
            : sectionFence
          : marker;
        continue;
      }
      if (!sectionFence && /^##\s+/.test(documentLines[index])) {
        end = index;
        break;
      }
    }
    return { end, headingLine, start: headingLine + 1 };
  });
}

function fenceMarker(line) {
  return line.match(/^\s*(`{3,}|~{3,})/)?.[1];
}

function validateTicket(ticket, documentLines, result) {
  const fields = parseFields(documentLines, ticket.start + 1, ticket.end);

  for (const duplicate of fields.duplicates) {
    result.errors.push(`${ticket.id}: duplicate field ${duplicate}.`);
  }

  for (const name of REQUIRED_FIELDS) {
    if (!fields.byName.has(name) && !(result.legacy && name === "사용자 지시")) {
      result.errors.push(`${ticket.id}: missing ${name}.`);
    }
  }

  const ordered = fields.items.filter((field) => REQUIRED_FIELDS.includes(field.name));
  let previous = -1;
  for (const field of ordered) {
    const order = REQUIRED_FIELDS.indexOf(field.name);
    if (order < previous) {
      result.errors.push(`${ticket.id}: field ${field.name} is out of canonical order.`);
      break;
    }
    previous = order;
  }

  const status = fields.byName.get("Status")?.value;
  const progressText = fields.byName.get("Progress")?.value;
  const progressMatch = progressText?.match(/^(\d+)%$/);
  const progress = progressMatch ? Number(progressMatch[1]) : undefined;

  if (!STATUS_PROGRESS.has(status)) {
    result.errors.push(`${ticket.id}: invalid Status ${status ?? "<empty>"}.`);
  } else if (progress === undefined) {
    result.errors.push(`${ticket.id}: invalid Progress ${progressText ?? "<empty>"}.`);
  } else if (!result.legacy && !STATUS_PROGRESS.get(status).has(progress)) {
    result.errors.push(`${ticket.id}: ${status} cannot use Progress ${progress}%.`);
  } else if (result.legacy && ![0, 25, 50, 75, 100].includes(progress)) {
    result.errors.push(`${ticket.id}: unsupported legacy Progress ${progress}%.`);
  }

  const completedAt = fields.byName.get("Completed at")?.value;
  if (status === "DONE") {
    if (!completedAt) {
      const message = `${ticket.id}: DONE requires Completed at.`;
      if (result.legacy) result.warnings.push(message);
      else result.errors.push(message);
    } else if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/.test(completedAt)) {
      result.errors.push(`${ticket.id}: Completed at must be RFC 3339 with an offset.`);
    }

    for (const name of ["완료 기준", "검증"]) {
      const field = fields.byName.get(name);
      if (!field) continue;
      const checkboxes = documentLines
        .slice(field.contentStart, field.contentEnd)
        .filter((line) => /^\s*-\s+\[[ xX]\]\s+/.test(line));
      if (checkboxes.length === 0) {
        result.errors.push(`${ticket.id}: DONE requires at least one ${name} checkbox.`);
      } else if (checkboxes.some((line) => !/^\s*-\s+\[[xX]\]\s+/.test(line))) {
        result.errors.push(`${ticket.id}: DONE has unchecked ${name} items.`);
      }
    }

    const note = fields.byName.get("진행 메모");
    if (note && !documentLines.slice(note.contentStart, note.contentEnd).some((line) => /^\s*-\s+\S/.test(line))) {
      result.errors.push(`${ticket.id}: DONE requires a progress note.`);
    }
  } else if (completedAt) {
    const message = `${ticket.id}: non-DONE ticket must not have Completed at.`;
    if (result.legacy) result.warnings.push(message);
    else result.errors.push(message);
  }
}

function parseFields(documentLines, start, end) {
  const items = [];
  let fence;

  for (let index = start; index < end; index += 1) {
    const marker = fenceMarker(documentLines[index]);
    if (marker) {
      fence = fence ? (marker[0] === fence[0] && marker.length >= fence.length ? undefined : fence) : marker;
      continue;
    }
    if (fence) continue;

    const match = documentLines[index].match(/^(.+?):(?:\s+(.*?))?\s*$/);
    const name = match?.[1];
    if (!name || !FIELD_NAMES.has(name)) continue;
    items.push({ index, name, value: match[2]?.trim() ?? "" });
  }

  const byName = new Map();
  const duplicates = [];
  items.forEach((field, index) => {
    if (byName.has(field.name)) duplicates.push(field.name);
    field.contentStart = field.index + 1;
    field.contentEnd = items[index + 1]?.index ?? end;
    byName.set(field.name, field);
  });

  return { byName, duplicates, items };
}

function validateSummary(documentLines, parsedTickets, statusSection, targetErrors) {
  if (!statusSection) return;
  let fence;
  const matches = [];

  for (let index = statusSection.start; index < statusSection.end; index += 1) {
    const marker = fenceMarker(documentLines[index]);
    if (marker) {
      fence = fence ? (marker[0] === fence[0] && marker.length >= fence.length ? undefined : fence) : marker;
      continue;
    }
    if (fence) continue;
    const match = documentLines[index].match(/^- 현재 진행률:\s*`(\d+)\s*\/\s*(\d+)\s+tickets`\s*$/);
    if (match) matches.push({ done: Number(match[1]), total: Number(match[2]) });
  }

  if (matches.length !== 1) {
    targetErrors.push(`Expected one top-level 현재 진행률 line, found ${matches.length}.`);
    return;
  }

  const done = parsedTickets.filter((ticket) => {
    const fields = parseFields(documentLines, ticket.start + 1, ticket.end);
    return fields.byName.get("Status")?.value === "DONE";
  }).length;

  if (matches[0].done !== done || matches[0].total !== parsedTickets.length) {
    targetErrors.push(
      `현재 진행률 is ${matches[0].done} / ${matches[0].total}, expected ${done} / ${parsedTickets.length}.`,
    );
  }
}
