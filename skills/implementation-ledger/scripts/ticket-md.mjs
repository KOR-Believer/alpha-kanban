#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const VALID_STATUSES = new Set(["TODO", "READY", "IN_PROGRESS", "BLOCKED", "DONE", "DEFERRED"]);
const VALID_PROGRESS = new Set(["0", "25", "50", "75", "100"]);
const FIELD_NAMES = new Set([
  "Status",
  "Progress",
  "Completed at",
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
]);

function main() {
  const [command, ...args] = process.argv.slice(2);

  try {
    if (!command || command === "help" || command === "--help" || command === "-h") {
      printHelp();
      return;
    }

    if (command === "check") {
      const { positionals } = parseArgs(args);
      const filePath = requireArg(positionals[0], "file");
      const document = readDocument(filePath);
      const result = checkDocument(document);
      printCheck(result, filePath);
      if (result.errors.length > 0) {
        process.exitCode = 1;
      }
      return;
    }

    if (command === "show") {
      const { positionals } = parseArgs(args);
      const filePath = requireArg(positionals[0], "file");
      const ticketId = requireArg(positionals[1], "ticket id");
      const document = readDocument(filePath);
      printTicketSummary("Ticket", filePath, locateTicket(document, ticketId), document);
      return;
    }

    if (command === "status") {
      const { options, positionals } = parseArgs(args);
      const filePath = requireArg(positionals[0], "file");
      const ticketId = requireArg(positionals[1], "ticket id");
      const status = optionalString(options.status);
      const progress = optionalString(options.progress);
      const dryRun = Boolean(options["dry-run"]);

      if (!status && !progress) {
        throw new CliError("Provide --status, --progress, or both.");
      }
      if (status && !VALID_STATUSES.has(status)) {
        throw new CliError(`Invalid status ${status}.`);
      }
      if (progress && !VALID_PROGRESS.has(progress)) {
        throw new CliError(`Invalid progress ${progress}. Use one of 0, 25, 50, 75, 100.`);
      }

      const document = readDocument(filePath);
      const before = locateTicket(document, ticketId);
      const nextDocument = updateTicketStatus(document, ticketId, { progress, status });
      writeIfNeeded(filePath, nextDocument, dryRun);
      const after = locateTicket(nextDocument, ticketId);
      printMutationSummary(filePath, before, after, nextDocument, dryRun);
      return;
    }

    if (command === "append-user" || command === "append-note") {
      const { options, positionals } = parseArgs(args);
      const filePath = requireArg(positionals[0], "file");
      const ticketId = requireArg(positionals[1], "ticket id");
      const text = positionals.slice(2).join(" ").trim();
      const dryRun = Boolean(options["dry-run"]);
      const date = optionalString(options.date) ?? formatLocalDate();

      if (!text) {
        throw new CliError("Provide text to append.");
      }

      const document = readDocument(filePath);
      const before = locateTicket(document, ticketId);
      const fieldName = command === "append-user" ? "사용자 지시" : "진행 메모";
      const nextDocument = appendTicketLog(document, ticketId, fieldName, `- ${date}: ${text}`);
      writeIfNeeded(filePath, nextDocument, dryRun);
      const after = locateTicket(nextDocument, ticketId);
      printMutationSummary(filePath, before, after, nextDocument, dryRun);
      return;
    }

    throw new CliError(`Unknown command ${command}.`);
  } catch (error) {
    if (error instanceof CliError) {
      console.error(`ticket-md: ${error.message}`);
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

class CliError extends Error {}

function printHelp() {
  console.log(`Usage:
  pnpm ticket-md check <file>
  pnpm ticket-md show <file> <ticket-id>
  pnpm ticket-md status <file> <ticket-id> [--status DONE] [--progress 100] [--dry-run]
  pnpm ticket-md append-user <file> <ticket-id> <text...> [--date YYYY-MM-DD] [--dry-run]
  pnpm ticket-md append-note <file> <ticket-id> <text...> [--date YYYY-MM-DD] [--dry-run]

Notes:
  - Tickets are located by unique ### TICKET-ID. headings outside fenced code blocks.
  - Writes are limited to the located ticket body and the top-level 현재 진행률 line.
  - Every mutation prints before/after line ranges so the caller can inspect the patch target.`);
}

function parseArgs(args) {
  const options = {};
  const positionals = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg?.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[index + 1];
      if (!next || next.startsWith("--")) {
        options[key] = true;
      } else {
        options[key] = next;
        index += 1;
      }
      continue;
    }

    if (arg) {
      positionals.push(arg);
    }
  }

  return { options, positionals };
}

function requireArg(value, label) {
  if (!value) {
    throw new CliError(`Missing ${label}.`);
  }
  return value;
}

function optionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readDocument(filePath) {
  const markdown = readFileSync(filePath, "utf8");
  const normalized = markdown.replace(/\r\n/g, "\n");
  const trailingNewline = normalized.endsWith("\n");
  const lines = normalized.split("\n");
  if (trailingNewline) {
    lines.pop();
  }

  return {
    filePath,
    lines,
    trailingNewline,
  };
}

function cloneDocument(document) {
  return {
    ...document,
    lines: [...document.lines],
  };
}

function serializeDocument(document) {
  return `${document.lines.join("\n")}${document.trailingNewline ? "\n" : ""}`;
}

function writeIfNeeded(filePath, document, dryRun) {
  if (dryRun) {
    console.log("Dry run: no changes written.");
    return;
  }

  writeFileSync(filePath, serializeDocument(document));
}

function findTicketHeadings(lines) {
  const headings = [];
  let inFence = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      continue;
    }

    const match = line.match(/^###\s+([A-Za-z][A-Za-z0-9]*-\d+[A-Za-z0-9-]*)\.\s*(.*?)\s*$/);
    if (!match) {
      continue;
    }

    headings.push({
      id: match[1],
      lineIndex: index,
      title: match[2] ?? "",
    });
  }

  return headings.map((heading, index) => ({
    ...heading,
    endLineIndex: headings[index + 1]?.lineIndex ?? lines.length,
  }));
}

function locateTicket(document, ticketId) {
  const matches = findTicketHeadings(document.lines).filter((heading) => heading.id === ticketId);
  if (matches.length === 0) {
    throw new CliError(`Ticket ${ticketId} was not found.`);
  }
  if (matches.length > 1) {
    throw new CliError(`Ticket ${ticketId} matched ${matches.length} headings; refusing to edit.`);
  }

  const ticket = matches[0];
  const fields = parseFields(document.lines, ticket.lineIndex + 1, ticket.endLineIndex);
  const status = parseStatus(fields.get("Status")?.value);
  const progress = parseProgress(fields.get("Progress")?.value);

  return {
    ...ticket,
    fields,
    progress,
    status,
  };
}

function parseFields(lines, startLineIndex, endLineIndex) {
  const starts = [];
  let inFence = false;

  for (let index = startLineIndex; index < endLineIndex; index += 1) {
    const line = lines[index] ?? "";
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      continue;
    }

    const singleLine = line.match(/^([A-Za-z ]+):\s*(.*?)\s*$/);
    if (singleLine && FIELD_NAMES.has(singleLine[1] ?? "")) {
      starts.push({
        block: false,
        lineIndex: index,
        name: singleLine[1],
        value: singleLine[2] ?? "",
      });
      continue;
    }

    const block = line.match(/^(.+?):\s*$/);
    if (block && FIELD_NAMES.has(block[1] ?? "")) {
      starts.push({
        block: true,
        lineIndex: index,
        name: block[1],
        value: undefined,
      });
    }
  }

  const fields = new Map();
  for (let index = 0; index < starts.length; index += 1) {
    const field = starts[index];
    const next = starts[index + 1];
    fields.set(field.name, {
      ...field,
      contentEnd: next?.lineIndex ?? endLineIndex,
      contentStart: field.block ? field.lineIndex + 1 : field.lineIndex,
    });
  }
  return fields;
}

function parseStatus(value) {
  const status = value?.trim();
  return status && VALID_STATUSES.has(status) ? status : undefined;
}

function parseProgress(value) {
  const match = value?.trim().match(/^(\d+)%$/);
  if (!match) {
    return undefined;
  }
  return VALID_PROGRESS.has(match[1]) ? match[1] : undefined;
}

function updateTicketStatus(document, ticketId, update) {
  const nextDocument = cloneDocument(document);
  const ticket = locateTicket(nextDocument, ticketId);
  const statusField = requireField(ticket, "Status");
  const progressField = requireField(ticket, "Progress");
  const completedAtField = ticket.fields.get("Completed at");
  const nextStatus = update.status ?? ticket.status;
  const nextProgress = update.progress ?? ticket.progress;

  if (!nextStatus) {
    throw new CliError(`Ticket ${ticketId} has invalid current Status.`);
  }
  if (!nextProgress) {
    throw new CliError(`Ticket ${ticketId} has invalid current Progress.`);
  }

  nextDocument.lines[statusField.lineIndex] = `Status: ${nextStatus}`;
  nextDocument.lines[progressField.lineIndex] = `Progress: ${nextProgress}%`;
  updateCompletedAt(nextDocument.lines, progressField, completedAtField, nextStatus);
  updateTopLevelProgress(nextDocument);
  return nextDocument;
}

function updateCompletedAt(lines, progressField, completedAtField, status) {
  if (status === "DONE") {
    if (completedAtField?.value?.trim()) {
      return;
    }
    if (completedAtField) {
      lines[completedAtField.lineIndex] = `Completed at: ${formatLocalIsoDateTime()}`;
      return;
    }
    lines.splice(progressField.lineIndex + 1, 0, `Completed at: ${formatLocalIsoDateTime()}`);
    return;
  }

  if (completedAtField) {
    lines.splice(completedAtField.lineIndex, 1);
  }
}

function appendTicketLog(document, ticketId, fieldName, entry) {
  const nextDocument = cloneDocument(document);
  let ticket = locateTicket(nextDocument, ticketId);
  if (!ticket.fields.has(fieldName) && fieldName === "사용자 지시") {
    insertUserInstructionsField(nextDocument.lines, ticket);
    ticket = locateTicket(nextDocument, ticketId);
  }

  const field = requireField(ticket, fieldName);
  insertLogEntry(nextDocument.lines, field, entry);
  return nextDocument;
}

function insertUserInstructionsField(lines, ticket) {
  const progressNotesField = ticket.fields.get("진행 메모");
  if (!progressNotesField) {
    throw new CliError(`Ticket ${ticket.id} is missing 진행 메모; cannot create 사용자 지시 safely.`);
  }

  lines.splice(progressNotesField.lineIndex, 0, "사용자 지시:", "", "");
}

function insertLogEntry(lines, field, entry) {
  const content = lines.slice(field.contentStart, field.contentEnd);
  const hasExistingContent = content.some((line) => line.trim() !== "");

  if (!hasExistingContent) {
    lines.splice(field.contentStart, field.contentEnd - field.contentStart, "", entry, "");
    return;
  }

  let insertAt = field.contentEnd;
  while (insertAt > field.contentStart && (lines[insertAt - 1] ?? "").trim() === "") {
    insertAt -= 1;
  }
  lines.splice(insertAt, 0, entry);
}

function requireField(ticket, fieldName) {
  const field = ticket.fields.get(fieldName);
  if (!field) {
    throw new CliError(`Ticket ${ticket.id} is missing ${fieldName}.`);
  }
  return field;
}

function updateTopLevelProgress(document) {
  const progressLine = findTopLevelProgressLine(document.lines);
  if (progressLine === undefined) {
    throw new CliError("Top-level 현재 진행률 line was not found.");
  }

  const summary = countTicketStatuses(document);
  document.lines[progressLine] = `- 현재 진행률: \`${summary.done} / ${summary.total} tickets\``;
}

function findTopLevelProgressLine(lines) {
  let inFence = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence && line.startsWith("- 현재 진행률:")) {
      return index;
    }
  }
  return undefined;
}

function countTicketStatuses(document) {
  const tickets = findTicketHeadings(document.lines).map((heading) =>
    locateTicket(document, heading.id),
  );
  return {
    done: tickets.filter((ticket) => ticket.status === "DONE").length,
    total: tickets.length,
  };
}

function checkDocument(document) {
  const errors = [];
  const warnings = [];
  const headings = findTicketHeadings(document.lines);
  const ids = new Map();

  for (const heading of headings) {
    ids.set(heading.id, (ids.get(heading.id) ?? 0) + 1);
  }
  for (const [id, count] of ids) {
    if (count > 1) {
      errors.push(`Duplicate ticket id ${id} appears ${count} times.`);
    }
  }

  for (const heading of headings) {
    const ticket = locateTicket(document, heading.id);
    if (!ticket.fields.has("Status")) {
      errors.push(`${heading.id} is missing Status.`);
    }
    if (!ticket.fields.has("Progress")) {
      errors.push(`${heading.id} is missing Progress.`);
    }
    if (!ticket.status) {
      errors.push(`${heading.id} has invalid Status.`);
    }
    if (!ticket.progress) {
      errors.push(`${heading.id} has invalid Progress.`);
    }
    if (ticket.status !== "DONE" && ticket.fields.has("Completed at")) {
      warnings.push(`${heading.id} has stale Completed at while status is ${ticket.status}.`);
    }
  }

  const progressLine = findTopLevelProgressLine(document.lines);
  if (progressLine === undefined) {
    errors.push("Top-level 현재 진행률 line was not found.");
  } else {
    const expected = countTicketStatuses(document);
    const actualLine = document.lines[progressLine] ?? "";
    const actual = actualLine.match(/`(\d+)\s*\/\s*(\d+)\s+tickets`/);
    if (!actual) {
      errors.push("Top-level 현재 진행률 line is malformed.");
    } else if (Number(actual[1]) !== expected.done || Number(actual[2]) !== expected.total) {
      errors.push(
        `Top-level 현재 진행률 is ${actual[1]} / ${actual[2]}, expected ${expected.done} / ${expected.total}.`,
      );
    }
  }

  return {
    errors,
    headings,
    warnings,
  };
}

function printCheck(result, filePath) {
  console.log(`${filePath}`);
  console.log(`Tickets: ${result.headings.length}`);
  if (result.warnings.length > 0) {
    console.log("Warnings:");
    for (const warning of result.warnings) {
      console.log(`- ${warning}`);
    }
  }
  if (result.errors.length > 0) {
    console.log("Errors:");
    for (const error of result.errors) {
      console.log(`- ${error}`);
    }
    return;
  }
  console.log("OK");
}

function printMutationSummary(filePath, before, after, document, dryRun) {
  printTicketSummary("Before", filePath, before, document);
  printTicketSummary("After", filePath, after, document);
  const progress = countTicketStatuses(document);
  console.log(`Top-level progress: ${progress.done} / ${progress.total} tickets`);
  if (!dryRun) {
    console.log("Written.");
  }
}

function printTicketSummary(label, filePath, ticket, document) {
  const relativePath = path.relative(process.cwd(), filePath) || filePath;
  console.log(
    `${label}: ${ticket.id} ${relativePath}:${ticket.lineIndex + 1}-${ticket.endLineIndex} ` +
      `status=${ticket.status ?? "INVALID"} progress=${ticket.progress ?? "INVALID"}`,
  );

  for (const fieldName of ["Status", "Progress", "Completed at", "사용자 지시", "진행 메모"]) {
    const field = ticket.fields.get(fieldName);
    if (field) {
      console.log(`  ${fieldName}: line ${field.lineIndex + 1}`);
    }
  }

  const progressLine = findTopLevelProgressLine(document.lines);
  if (progressLine !== undefined) {
    console.log(`  현재 진행률: line ${progressLine + 1}`);
  }
}

function formatLocalDate(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatLocalIsoDateTime(date = new Date()) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffsetMinutes = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(absoluteOffsetMinutes / 60)).padStart(2, "0");
  const offsetRemainderMinutes = String(absoluteOffsetMinutes % 60).padStart(2, "0");
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${sign}${offsetHours}:${offsetRemainderMinutes}`;
}

main();
