import {
  ticketProgressSchema,
  ticketStatusSchema,
  type ProgressBoardRow,
  type TicketDocument,
  type TicketDocumentStatus,
  type TicketItem,
  type TicketLogEntry,
  type TicketProgress,
  type TicketStatus,
} from "@alpha-kanban/shared";

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

type InternalDocument = Omit<TicketDocument, "tickets"> & {
  lines: string[];
  trailingNewline: boolean;
  statusProgressLine?: number;
  tickets: InternalTicket[];
};

type StatusProgressUpdate = {
  status?: TicketStatus;
  progress?: TicketProgress;
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

const SINGLE_LINE_FIELD_NAMES = ["Status", "Progress", "Priority", "Type"] as const;

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
  const boardRow = parsed.progressBoard.find((row) => row.ticketId === ticketId);

  if (!boardRow) {
    throw new TicketMarkdownWriteError(
      TICKET_WRITE_ERROR.NEEDS_REPAIR,
      `Progress Board row for ${ticketId} was not found.`,
    );
  }

  if (parsed.statusProgressLine === undefined) {
    throw new TicketMarkdownWriteError(
      TICKET_WRITE_ERROR.NEEDS_REPAIR,
      "Top-level 현재 진행률 line was not found.",
    );
  }

  const lines = [...parsed.lines];
  lines[statusField.lineIndex] = `Status: ${nextStatus}`;
  lines[progressField.lineIndex] = `Progress: ${nextProgress}%`;
  lines[boardRow.line - 1] = replaceProgressBoardRow(
    parsed.lines[boardRow.line - 1] ?? "",
    nextStatus,
    nextProgress,
  );

  const doneTickets = parsed.tickets.filter((item) =>
    item.id === ticketId ? nextStatus === "DONE" : item.status === "DONE",
  ).length;

  lines[parsed.statusProgressLine] = replaceTopLevelProgress(
    parsed.lines[parsed.statusProgressLine] ?? "",
    doneTickets,
    parsed.tickets.length,
  );

  return joinMarkdown({ lines, trailingNewline: parsed.trailingNewline });
}

export function appendUserInstruction(
  markdown: string,
  ticketId: string,
  instruction: string,
  options: AppendLogOptions = {},
): string {
  const parsed = parseTicketDocumentInternal(markdown);
  const ticket = findWritableTicket(parsed, ticketId);
  assertTicketHasCanonicalFields(ticket);

  const lines = [...parsed.lines];
  const entry = formatLogEntry(options.date, instruction);
  const userInstructionField = ticket.fields.get("사용자 지시");

  if (userInstructionField) {
    insertLogEntry(lines, userInstructionField, entry);
  } else {
    const progressNotesField = requiredField(ticket, "진행 메모");
    lines.splice(progressNotesField.lineIndex, 0, "사용자 지시:", "", entry, "");
  }

  return joinMarkdown({ lines, trailingNewline: parsed.trailingNewline });
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

  return joinMarkdown({ lines, trailingNewline: parsed.trailingNewline });
}

function parseTicketDocumentInternal(markdown: string): InternalDocument {
  const split = splitMarkdown(markdown);
  const { lines } = split;
  const title = parseTitle(lines);
  const statusSection = findSection(lines, "Status");
  const progressBoardSection = findSection(lines, "Progress Board");
  const ticketListSection = findSection(lines, "Ticket List");
  const missingSections = [
    ["Status", statusSection],
    ["Progress Board", progressBoardSection],
    ["Ticket List", ticketListSection],
  ]
    .filter(([, section]) => !section)
    .map(([name]) => name as string);

  const { status, progressLine } = statusSection
    ? parseDocumentStatus(lines, statusSection)
    : { status: {}, progressLine: undefined };

  const progressBoard = progressBoardSection
    ? parseProgressBoard(lines, progressBoardSection)
    : [];

  const tickets = ticketListSection ? parseTickets(lines, ticketListSection) : [];

  return {
    title,
    status,
    progressBoard,
    tickets,
    lineCount: lines.length,
    missingSections,
    lines,
    trailingNewline: split.trailingNewline,
    statusProgressLine: progressLine,
  };
}

function splitMarkdown(markdown: string): SplitMarkdown {
  const trailingNewline = markdown.endsWith("\n");
  const withoutTrailingNewline = trailingNewline ? markdown.slice(0, -1) : markdown;

  return {
    lines: withoutTrailingNewline.length > 0 ? withoutTrailingNewline.split("\n") : [],
    trailingNewline,
  };
}

function joinMarkdown(markdown: SplitMarkdown): string {
  const body = markdown.lines.join("\n");
  return markdown.trailingNewline ? `${body}\n` : body;
}

function parseTitle(lines: string[]): string {
  const heading = lines.find((line) => line.startsWith("# "));
  return heading ? heading.replace(/^#\s+/, "").trim() : "";
}

function findSection(lines: string[], title: string): SectionRange | undefined {
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

function parseProgressBoard(lines: string[], section: SectionRange): ProgressBoardRow[] {
  const rows: ProgressBoardRow[] = [];

  for (let index = section.startLine; index < section.endLine; index += 1) {
    const line = lines[index] ?? "";
    if (!line.startsWith("|") || line.includes("---") || line.includes("Ticket |")) {
      continue;
    }

    const cells = parseMarkdownTableRow(line);
    if (cells.length < 5) {
      continue;
    }

    const status = parseTicketStatus(cells[1]);
    const progress = parseTicketProgress(cells[2]);

    if (!status || progress === undefined) {
      continue;
    }

    rows.push({
      ticketId: cells[0] ?? "",
      status,
      progress,
      repository: cells[3] ?? "",
      dependsOn: cells[4] ?? "",
      line: index + 1,
    });
  }

  return rows;
}

function parseMarkdownTableRow(line: string): string[] {
  return line
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());
}

function parseTickets(lines: string[], section: SectionRange): InternalTicket[] {
  const headings: Array<{ index: number; id: string; title: string }> = [];

  for (let index = section.startLine; index < section.endLine; index += 1) {
    const match = lines[index]?.match(/^###\s+([A-Za-z0-9]+-\d+)\.\s+(.+?)\s*$/);
    if (!match) {
      continue;
    }

    headings.push({
      index,
      id: match[1] ?? "",
      title: match[2] ?? "",
    });
  }

  return headings.map((heading, headingIndex) => {
    const nextHeading = headings[headingIndex + 1]?.index ?? section.endLine;
    return parseTicket(lines, heading.index, nextHeading, heading.id, heading.title);
  });
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
  const userInstructionField = fields.get("사용자 지시");

  return {
    id,
    title,
    status,
    progress,
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
    completionCriteria: parseListField(lines, fields.get("완료 기준")),
    validation: parseListField(lines, fields.get("검증")),
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
  const fieldStarts: Array<{
    name: string;
    lineIndex: number;
    value?: string;
    block: boolean;
  }> = [];

  for (let index = startLine; index < endLine; index += 1) {
    const line = lines[index] ?? "";
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

function toPublicDocument(document: InternalDocument): TicketDocument {
  return {
    title: document.title,
    status: document.status,
    progressBoard: document.progressBoard,
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

function replaceProgressBoardRow(
  rowLine: string,
  status: TicketStatus,
  progress: TicketProgress,
): string {
  const cells = parseMarkdownTableRow(rowLine);

  if (cells.length < 5) {
    throw new TicketMarkdownWriteError(
      TICKET_WRITE_ERROR.NEEDS_REPAIR,
      "Progress Board row is malformed.",
    );
  }

  cells[1] = status;
  cells[2] = `${progress}%`;

  return `| ${cells.join(" | ")} |`;
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
  const entryDate = date ?? new Date().toISOString().slice(0, 10);
  return `- ${entryDate}: ${text.trim()}`;
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
