import {
  TICKET_INSTRUCTION_LABELS,
  formatUserTicketChange,
  ticketProgressSchema,
  ticketStatusSchema,
  type TicketChecklistItem,
  type TicketDocument,
  type TicketDocumentStatus,
  type TicketItem,
  type TicketInstructionKind,
  type TicketLogEntry,
  type TicketProgress,
  type TicketStatus,
} from "./index.js";

export const TICKET_WRITE_ERROR = {
  NEEDS_REPAIR: "NEEDS_REPAIR",
  TICKET_NOT_FOUND: "TICKET_NOT_FOUND",
} as const;

export type TicketWriteErrorCode =
  (typeof TICKET_WRITE_ERROR)[keyof typeof TICKET_WRITE_ERROR];

export class TicketMarkdownWriteError extends Error {
  readonly code: TicketWriteErrorCode;

  constructor(code: TicketWriteErrorCode, message: string) {
    super(message);
    this.name = "TicketMarkdownWriteError";
    this.code = code;
  }
}

type SplitMarkdown = {
  lines: string[];
  trailingNewline: boolean;
  lineEnding: string;
  bom: boolean;
  mixedLineEndings: boolean;
};

type SectionRange = {
  headingLine: number;
  startLine: number;
  endLine: number;
};

type FieldPosition = {
  name: string;
  lineIndex: number;
  value?: string;
  contentStart: number;
  contentEnd: number;
};

type InternalTicket = TicketItem & {
  fields: Map<string, FieldPosition>;
};

type InternalDocument = Omit<TicketDocument, "tickets"> & SplitMarkdown & {
  statusProgressLine?: number;
  tickets: InternalTicket[];
  hasUnrecognizedTickets: boolean;
};

type StatusProgressUpdate = {
  status?: TicketStatus;
  progress?: TicketProgress;
  reason?: string;
};

type AppendLogOptions = {
  date?: string;
};

const REQUIRED_TICKET_FIELDS = [
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
  "진행 메모",
] as const;

const BLOCK_FIELD_NAMES = [
  "Repository",
  "Depends on",
  "목표",
  "현재 문제",
  "구현 범위",
  "제외 범위",
  "완료 기준",
  "검증",
  "사용자 지시",
  "진행 메모",
] as const;

const SINGLE_LINE_FIELD_NAMES = [
  "Status",
  "Progress",
  "Completed at",
  "Priority",
  "Type",
] as const;

const FIELD_NAME_SET = new Set<string>([
  ...BLOCK_FIELD_NAMES,
  ...SINGLE_LINE_FIELD_NAMES,
]);

export function parseTicketDocument(markdown: string): TicketDocument {
  return toPublicDocument(parseTicketDocumentInternal(markdown));
}

export function updateTicketStatusAndProgress(
  markdown: string,
  ticketId: string,
  update: StatusProgressUpdate,
): string {
  if (update.status === undefined && update.progress === undefined) {
    return markdown;
  }

  const parsed = parseTicketDocumentInternal(markdown);
  const ticket = findWritableTicket(parsed, ticketId);
  assertTicketHasCanonicalFields(ticket);

  const nextStatus = update.status ?? ticket.status;
  const nextProgress = update.progress ?? ticket.progress;
  const statusField = requiredField(ticket, "Status");
  const progressField = requiredField(ticket, "Progress");
  const completedAtField = ticket.fields.get("Completed at");

  if (parsed.statusProgressLine === undefined) {
    throw new TicketMarkdownWriteError(
      TICKET_WRITE_ERROR.NEEDS_REPAIR,
      "Top-level 현재 진행률 line was not found.",
    );
  }

  const lines = [...parsed.lines];
  lines[statusField.lineIndex] = `Status: ${nextStatus}`;
  lines[progressField.lineIndex] = `Progress: ${nextProgress}%`;
  updateCompletedAtLine(lines, progressField, completedAtField, nextStatus);

  const doneTickets = parsed.tickets.filter((item) =>
    item.id === ticketId ? nextStatus === "DONE" : item.status === "DONE",
  ).length;

  lines[parsed.statusProgressLine] = replaceTopLevelProgress(
    parsed.lines[parsed.statusProgressLine] ?? "",
    doneTickets,
    parsed.tickets.length,
  );

  const updated = joinMarkdown({ ...parsed, lines });
  // An explicit (possibly empty) reason identifies a user action; legacy callers omit it.
  if (update.reason !== undefined && (nextStatus !== ticket.status || nextProgress !== ticket.progress)) {
    return appendUserInstruction(
      updated,
      ticketId,
      formatUserTicketChange(ticket.status, nextStatus, ticket.progress, nextProgress, update.reason),
    );
  }
  return updated;
}

export function appendUserInstruction(
  markdown: string,
  ticketId: string,
  instruction: string,
  options: AppendLogOptions & { kind?: TicketInstructionKind } = {},
): string {
  const parsed = parseTicketDocumentInternal(markdown);
  const ticket = findWritableTicket(parsed, ticketId);
  assertTicketHasCanonicalFields(ticket);

  const lines = [...parsed.lines];
  const text = options.kind === "manual"
    ? `[수동지시] ${instruction}`
    : options.kind
      ? `[${TICKET_INSTRUCTION_LABELS[options.kind]}] 티켓: ${ticketId}; 내용: ${instruction}`
      : instruction;
  const entry = formatLogEntry(options.date, text);
  const userInstructionField = ticket.fields.get("사용자 지시");

  if (userInstructionField) {
    insertLogEntry(lines, userInstructionField, entry);
  } else {
    const progressNotesField = requiredField(ticket, "진행 메모");
    lines.splice(progressNotesField.lineIndex, 0, "사용자 지시:", "", entry, "");
  }

  return joinMarkdown({ ...parsed, lines });
}

export function appendProgressNote(
  markdown: string,
  ticketId: string,
  note: string,
  options: AppendLogOptions = {},
): string {
  const parsed = parseTicketDocumentInternal(markdown);
  const ticket = findWritableTicket(parsed, ticketId);
  assertTicketHasCanonicalFields(ticket);

  const lines = [...parsed.lines];
  const progressNotesField = requiredField(ticket, "진행 메모");
  insertLogEntry(lines, progressNotesField, formatLogEntry(options.date, note));

  return joinMarkdown({ ...parsed, lines });
}

function parseTicketDocumentInternal(markdown: string): InternalDocument {
  const split = splitMarkdown(markdown);
  const { lines } = split;
  const title = parseTitle(lines);
  const statusSection = findSection(lines, "Status");
  const ticketListSection = findSection(lines, "Ticket List");
  const missingSections = [
    ["Status", statusSection],
    ["Ticket List", ticketListSection],
  ]
    .filter(([, section]) => !section)
    .map(([name]) => name as string);

  const { status, progressLine } = statusSection
    ? parseDocumentStatus(lines, statusSection)
    : { status: {}, progressLine: undefined };

  const { tickets, hasUnrecognizedTickets } = ticketListSection
    ? parseTickets(lines, ticketListSection)
    : { tickets: [], hasUnrecognizedTickets: false };

  return {
    title,
    status,
    tickets,
    hasUnrecognizedTickets,
    lineCount: lines.length,
    missingSections,
    ...split,
    statusProgressLine: progressLine,
  };
}

function splitMarkdown(markdown: string): SplitMarkdown {
  const bom = markdown.startsWith("\uFEFF");
  const source = bom ? markdown.slice(1) : markdown;
  const lineEnding = source.includes("\r\n") ? "\r\n" : "\n";
  const mixedLineEndings = source.includes("\r\n") && /(?<!\r)\n/.test(source);
  const trailingNewline = source.endsWith("\n");
  const body = trailingNewline ? source.replace(/\r?\n$/, "") : source;
  return { lines: body ? body.split(/\r?\n/) : [], trailingNewline, lineEnding, bom, mixedLineEndings };
}

function joinMarkdown(markdown: SplitMarkdown): string {
  const body = markdown.lines.join(markdown.lineEnding);
  return (markdown.bom ? "\uFEFF" : "") + body + (markdown.trailingNewline ? markdown.lineEnding : "");
}

// Preserve source line numbers while excluding fenced examples from structural parsing.
function structuralLines(lines: string[]): string[] {
  let fence = "";
  return lines.map((line) => {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length && line.trim() === marker) fence = "";
      return "";
    }
    if (marker) { fence = marker; return ""; }
    return line;
  });
}

function parseTitle(lines: string[]): string {
  const heading = structuralLines(lines).find((line) => line.startsWith("# "));
  return heading ? heading.replace(/^#\s+/, "").trim() : "";
}

function findSection(lines: string[], title: string): SectionRange | undefined {
  lines = structuralLines(lines);
  const headingLine = lines.findIndex((line) => line.trim() === `## ${title}`);

  if (headingLine < 0) {
    return undefined;
  }

  const nextSection = lines.findIndex(
    (line, index) => index > headingLine && /^##\s+/.test(line),
  );

  return {
    headingLine,
    startLine: headingLine + 1,
    endLine: nextSection >= 0 ? nextSection : lines.length,
  };
}

function parseDocumentStatus(
  lines: string[],
  section: SectionRange,
): { status: TicketDocumentStatus; progressLine?: number } {
  lines = structuralLines(lines);
  const status: TicketDocumentStatus = {};
  let progressLine: number | undefined;

  for (let index = section.startLine; index < section.endLine; index += 1) {
    const line = lines[index] ?? "";

    if (line.startsWith("- 작성일:")) {
      status.createdAt = cleanInlineValue(line.replace("- 작성일:", ""));
    } else if (line.startsWith("- 기준 문서:")) {
      status.planPath = cleanInlineValue(line.replace("- 기준 문서:", ""));
    } else if (line.startsWith("- 목적:")) {
      status.purpose = cleanInlineValue(line.replace("- 목적:", ""));
    } else if (line.startsWith("- 범위:")) {
      status.scope = cleanInlineValue(line.replace("- 범위:", ""));
    } else if (line.startsWith("- 현재 진행률:")) {
      progressLine = index;
      const progress = line.match(/`?(\d+)\s*\/\s*(\d+)\s+tickets`?/);
      if (progress) {
        status.doneTickets = Number.parseInt(progress[1] ?? "0", 10);
        status.totalTickets = Number.parseInt(progress[2] ?? "0", 10);
      }
    }
  }

  return { status, progressLine };
}

function parseTickets(lines: string[], section: SectionRange): {
  tickets: InternalTicket[];
  hasUnrecognizedTickets: boolean;
} {
  const headings: Array<{ index: number; id?: string; title?: string }> = [];
  const structure = structuralLines(lines);

  for (let index = section.startLine; index < section.endLine; index += 1) {
    const line = structure[index] ?? "";
    // Every peer heading ends the previous ticket, even when its ID is unsupported.
    if (!/^ {0,3}###(?:[ \t]+|$)/.test(line)) {
      continue;
    }
    const match = line.match(/^ {0,3}###\s+([A-Za-z0-9]+-\d+[A-Za-z]*)\.\s+(.+?)\s*$/);

    headings.push({
      index,
      id: match?.[1],
      title: match?.[2],
    });
  }

  const tickets: InternalTicket[] = [];
  let hasUnrecognizedTickets = false;
  for (const [headingIndex, heading] of headings.entries()) {
    const nextHeading = headings[headingIndex + 1]?.index ?? section.endLine;
    if (!heading.id || !heading.title) {
      // Do not let a write replace the document's count with an incomplete parse.
      if (structure.slice(heading.index + 1, nextHeading).some((line) => /^(?:Status|Progress):/.test(line))) {
        hasUnrecognizedTickets = true;
      }
      continue;
    }
    tickets.push(parseTicket(lines, heading.index, nextHeading, heading.id, heading.title));
  }
  return { tickets, hasUnrecognizedTickets };
}

function parseTicket(
  lines: string[],
  startLine: number,
  endLine: number,
  id: string,
  title: string,
): InternalTicket {
  const fields = parseTicketFields(lines, startLine + 1, endLine);
  const missingFields = REQUIRED_TICKET_FIELDS.filter((field) => !fields.has(field));
  const status = parseTicketStatus(fields.get("Status")?.value) ?? "TODO";
  const progress = parseTicketProgress(fields.get("Progress")?.value) ?? 0;
  const completedAt =
    status === "DONE" ? parseCompletedAt(fields.get("Completed at")?.value) : undefined;
  const userInstructionField = fields.get("사용자 지시");
  const completionCriteriaItems = parseChecklistField(lines, fields.get("완료 기준"));
  const validationItems = parseChecklistField(lines, fields.get("검증"));

  return {
    id,
    title,
    status,
    progress,
    completedAt,
    repository: parseListField(lines, fields.get("Repository"), { stripBackticks: true }),
    priority: fields.get("Priority")?.value?.trim() ?? "",
    type: fields.get("Type")?.value?.trim() ?? "",
    dependsOn: parseListField(lines, fields.get("Depends on"), {
      stripBackticks: true,
      removeNone: true,
    }),
    goal: parseListField(lines, fields.get("목표")),
    currentProblem: parseListField(lines, fields.get("현재 문제")),
    implementationScope: parseListField(lines, fields.get("구현 범위")),
    outOfScope: parseListField(lines, fields.get("제외 범위")),
    completionCriteria: completionCriteriaItems.map((item) => item.text),
    completionCriteriaItems,
    validation: validationItems.map((item) => item.text),
    validationItems,
    userInstructions: parseLogEntries(lines, userInstructionField),
    progressNotes: parseLogEntries(lines, fields.get("진행 메모")),
    hasUserInstructionsSection: Boolean(userInstructionField),
    unknownBlocks: [],
    range: {
      startLine: startLine + 1,
      endLine,
    },
    missingFields,
    fields,
  };
}

function parseTicketFields(
  lines: string[],
  startLine: number,
  endLine: number,
): Map<string, FieldPosition> {
  const structure = structuralLines(lines);
  const fieldStarts: Array<{
    name: string;
    lineIndex: number;
    value?: string;
    block: boolean;
  }> = [];

  for (let index = startLine; index < endLine; index += 1) {
    const line = structure[index] ?? "";
    const singleLineField = line.match(/^([A-Za-z ]+):\s*(.*?)\s*$/);
    const blockField = line.match(/^(.+?):\s*$/);

    if (singleLineField && FIELD_NAME_SET.has(singleLineField[1] ?? "")) {
      fieldStarts.push({
        name: singleLineField[1] ?? "",
        lineIndex: index,
        value: singleLineField[2] ?? "",
        block: false,
      });
    } else if (blockField && FIELD_NAME_SET.has(blockField[1] ?? "")) {
      fieldStarts.push({
        name: blockField[1] ?? "",
        lineIndex: index,
        block: true,
      });
    }
  }

  const fields = new Map<string, FieldPosition>();

  for (let index = 0; index < fieldStarts.length; index += 1) {
    const field = fieldStarts[index];
    if (!field) {
      continue;
    }
    const nextField = fieldStarts[index + 1];
    fields.set(field.name, {
      name: field.name,
      lineIndex: field.lineIndex,
      value: field.value,
      contentStart: field.block ? field.lineIndex + 1 : field.lineIndex,
      contentEnd: nextField ? nextField.lineIndex : endLine,
    });
  }

  return fields;
}

function parseListField(
  lines: string[],
  field: FieldPosition | undefined,
  options: { stripBackticks?: boolean; removeNone?: boolean } = {},
): string[] {
  if (!field) {
    return [];
  }

  const items: string[] = [];

  for (let index = field.contentStart; index < field.contentEnd; index += 1) {
    const raw = lines[index]?.trim() ?? "";
    if (!raw) {
      continue;
    }

    const bullet = raw.match(/^-\s+(?:\[[ xX]\]\s+)?(.+?)\s*$/);
    if (!bullet) {
      items.push(raw);
      continue;
    }

    let item = bullet[1]?.trim() ?? "";
    if (options.stripBackticks) {
      item = item.replace(/^`|`$/g, "");
    }
    if (options.removeNone && item === "없음") {
      continue;
    }
    items.push(item);
  }

  return items;
}

function parseChecklistField(
  lines: string[],
  field: FieldPosition | undefined,
): TicketChecklistItem[] {
  if (!field) {
    return [];
  }

  const items: TicketChecklistItem[] = [];

  for (let index = field.contentStart; index < field.contentEnd; index += 1) {
    const raw = lines[index]?.trim() ?? "";
    if (!raw) {
      continue;
    }

    const checkbox = raw.match(/^-\s+\[([ xX])\]\s+(.+?)\s*$/);
    if (checkbox) {
      items.push({
        text: checkbox[2]?.trim() ?? "",
        checked: (checkbox[1] ?? "").toLowerCase() === "x",
        raw,
        index: items.length,
        lineStart: index + 1,
        lineEnd: index + 1,
      });
      continue;
    }

    const bullet = raw.match(/^-\s+(.+?)\s*$/);
    items.push({
      text: bullet?.[1]?.trim() ?? raw,
      checked: null,
      raw,
      index: items.length,
      lineStart: index + 1,
      lineEnd: index + 1,
    });
  }

  return items;
}

function parseLogEntries(
  lines: string[],
  field: FieldPosition | undefined,
): TicketLogEntry[] {
  if (!field) {
    return [];
  }

  const entries: TicketLogEntry[] = [];

  for (let index = field.contentStart; index < field.contentEnd; index += 1) {
    const raw = lines[index]?.trim() ?? "";
    const match = raw.match(/^-\s+(\d{4}-\d{2}-\d{2}):\s*(.*)$/);
    if (!match) {
      continue;
    }

    entries.push({
      date: match[1] ?? "",
      text: match[2] ?? "",
      raw,
      index: entries.length,
      lineStart: index + 1,
      lineEnd: index + 1,
    });
  }

  return entries;
}

function parseTicketStatus(value: string | undefined): TicketStatus | undefined {
  const parsed = ticketStatusSchema.safeParse(value?.trim());
  return parsed.success ? parsed.data : undefined;
}

function parseTicketProgress(value: string | undefined): TicketProgress | undefined {
  const progress = value?.trim().match(/^(\d+)%?$/);
  if (!progress) {
    return undefined;
  }

  const parsed = ticketProgressSchema.safeParse(Number.parseInt(progress[1] ?? "", 10));
  return parsed.success ? parsed.data : undefined;
}

function cleanInlineValue(value: string): string {
  return value.trim().replace(/^`|`$/g, "");
}

function parseCompletedAt(value: string | undefined): string | undefined {
  const normalized = cleanInlineValue(value ?? "");
  return normalized.length > 0 ? normalized : undefined;
}

function toPublicDocument(document: InternalDocument): TicketDocument {
  return {
    title: document.title,
    status: document.status,
    tickets: document.tickets.map(({ fields: _fields, ...ticket }) => ticket),
    lineCount: document.lineCount,
    missingSections: document.missingSections,
  };
}

function findWritableTicket(document: InternalDocument, ticketId: string): InternalTicket {
  const ticket = document.tickets.find((item) => item.id === ticketId);

  if (!ticket) {
    throw new TicketMarkdownWriteError(
      TICKET_WRITE_ERROR.TICKET_NOT_FOUND,
      `Ticket ${ticketId} was not found.`,
    );
  }

  const lines = structuralLines(document.lines);
  const fields = new Set<string>();
  const duplicateField = lines.slice(ticket.range.startLine, ticket.range.endLine).some((line) => {
    const name = /^([^:]+):/.exec(line)?.[1];
    if (!name || !FIELD_NAME_SET.has(name)) return false;
    if (fields.has(name)) return true;
    fields.add(name);
    return false;
  });
  const ids = document.tickets.map((item) => item.id);
  const duplicateSections = ["Status", "Ticket List"].some((name) => lines.filter((line) => line.trim() === `## ${name}`).length !== 1);
  const statusSection = findSection(lines, "Status");
  const progressLines = statusSection ? lines.slice(statusSection.startLine, statusSection.endLine).filter((line) => line.startsWith("- 현재 진행률:")).length : 0;
  if (document.hasUnrecognizedTickets || document.mixedLineEndings || duplicateField || duplicateSections || new Set(ids).size !== ids.length || progressLines !== 1) {
    throw new TicketMarkdownWriteError(TICKET_WRITE_ERROR.NEEDS_REPAIR, "Ambiguous Markdown structure or mixed line endings; repair the document before editing.");
  }
  return ticket;
}

function assertTicketHasCanonicalFields(ticket: InternalTicket): void {
  if (ticket.missingFields.length === 0) {
    return;
  }

  throw new TicketMarkdownWriteError(
    TICKET_WRITE_ERROR.NEEDS_REPAIR,
    `Ticket ${ticket.id} is missing canonical fields: ${ticket.missingFields.join(", ")}.`,
  );
}

function requiredField(ticket: InternalTicket, fieldName: string): FieldPosition {
  const field = ticket.fields.get(fieldName);

  if (!field) {
    throw new TicketMarkdownWriteError(
      TICKET_WRITE_ERROR.NEEDS_REPAIR,
      `Ticket ${ticket.id} is missing field ${fieldName}.`,
    );
  }

  return field;
}

function updateCompletedAtLine(
  lines: string[],
  progressField: FieldPosition,
  completedAtField: FieldPosition | undefined,
  status: TicketStatus,
): void {
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

function formatLocalIsoDateTime(date = new Date()): string {
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

function replaceTopLevelProgress(line: string, doneTickets: number, totalTickets: number): string {
  if (line.includes("현재 진행률:")) {
    return `- 현재 진행률: \`${doneTickets} / ${totalTickets} tickets\``;
  }

  throw new TicketMarkdownWriteError(
    TICKET_WRITE_ERROR.NEEDS_REPAIR,
    "Top-level 현재 진행률 line is malformed.",
  );
}

function formatLogEntry(date: string | undefined, text: string): string {
  const entryDate = date ?? formatLocalIsoDateTime().slice(0, 10);
  return `- ${entryDate}: ${text.trim().replace(/\s+/g, " ")}`;
}

function insertLogEntry(lines: string[], field: FieldPosition, entry: string): void {
  let insertAt = field.contentEnd;

  while (insertAt > field.contentStart && (lines[insertAt - 1] ?? "").trim() === "") {
    insertAt -= 1;
  }

  const nextLine = lines[insertAt];
  if (nextLine !== undefined && nextLine.trim() !== "") {
    lines.splice(insertAt, 0, entry, "");
  } else {
    lines.splice(insertAt, 0, entry);
  }
}
