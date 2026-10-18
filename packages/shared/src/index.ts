import { z } from "zod";

export const APP_NAME = "Alpha Kanban";

export const ticketStatusSchema = z.enum([
  "TODO",
  "READY",
  "IN_PROGRESS",
  "BLOCKED",
  "DONE",
  "DEFERRED",
]);

export type TicketStatus = z.infer<typeof ticketStatusSchema>;

export const ticketProgressSchema = z.union([
  z.literal(0),
  z.literal(25),
  z.literal(50),
  z.literal(75),
  z.literal(100),
]);

export type TicketProgress = z.infer<typeof ticketProgressSchema>;

export const TICKET_PROGRESS_BY_STATUS: Record<TicketStatus, readonly TicketProgress[]> = {
  TODO: [0],
  READY: [25],
  IN_PROGRESS: [50, 75],
  BLOCKED: [0, 25, 50, 75],
  DEFERRED: [0, 25, 50, 75],
  DONE: [100],
};

export const TICKET_STATUS_USER_MESSAGES: Record<TicketStatus, string> = {
  TODO: "사용자가 명시적으로 할 일로 변경했습니다.",
  READY: "사용자가 명시적으로 작업 대기 상태로 변경했습니다.",
  IN_PROGRESS: "사용자가 명시적으로 진행 중으로 변경했습니다.",
  BLOCKED: "사용자가 명시적으로 진행 불가 상태로 변경했습니다.",
  DEFERRED: "사용자가 명시적으로 보류 상태로 변경했습니다.",
  DONE: "사용자가 명시적으로 완료 상태로 변경했습니다.",
};

export function ticketChangeDefaultReason(from: TicketStatus, to: TicketStatus): string {
  return from === to
    ? "사용자가 명시적으로 진행률을 변경했습니다."
    : TICKET_STATUS_USER_MESSAGES[to];
}

export function ticketProgressForStatus(status: TicketStatus, progress: TicketProgress): TicketProgress {
  const allowed = TICKET_PROGRESS_BY_STATUS[status];
  if (allowed.includes(progress)) return progress;
  if ((status === "BLOCKED" || status === "DEFERRED") && progress === 100) return 75;
  return allowed[0]!;
}

export function formatUserTicketChange(
  from: TicketStatus,
  to: TicketStatus,
  fromProgress: TicketProgress,
  toProgress: TicketProgress,
  reason: string,
): string {
  const transition = from === to
    ? `${from} 진행률 ${fromProgress}% -> ${toProgress}%`
    : `${from} -> ${to}`;
  const message = reason.trim()
    ? `사용자 사유: ${reason.trim()}`
    : ticketChangeDefaultReason(from, to);
  return `${transition} ${message}`;
}

export const ticketLogEntrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  text: z.string(),
  raw: z.string(),
  index: z.number().int().nonnegative(),
  lineStart: z.number().int().positive(),
  lineEnd: z.number().int().positive(),
});

export type TicketLogEntry = z.infer<typeof ticketLogEntrySchema>;

export const ticketChecklistItemSchema = z.object({
  text: z.string(),
  checked: z.boolean().nullable(),
  raw: z.string(),
  index: z.number().int().nonnegative(),
  lineStart: z.number().int().positive(),
  lineEnd: z.number().int().positive(),
});

export type TicketChecklistItem = z.infer<typeof ticketChecklistItemSchema>;

export const ticketSourceRangeSchema = z.object({
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
});

export type TicketSourceRange = z.infer<typeof ticketSourceRangeSchema>;

export const ticketDocumentStatusSchema = z.object({
  createdAt: z.string().optional(),
  planPath: z.string().optional(),
  purpose: z.string().optional(),
  scope: z.string().optional(),
  doneTickets: z.number().int().nonnegative().optional(),
  totalTickets: z.number().int().nonnegative().optional(),
});

export type TicketDocumentStatus = z.infer<typeof ticketDocumentStatusSchema>;

export const ticketItemSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  status: ticketStatusSchema,
  progress: ticketProgressSchema,
  completedAt: z.string().optional(),
  repository: z.array(z.string()),
  priority: z.string(),
  type: z.string(),
  dependsOn: z.array(z.string()),
  goal: z.array(z.string()),
  currentProblem: z.array(z.string()),
  implementationScope: z.array(z.string()),
  outOfScope: z.array(z.string()),
  completionCriteria: z.array(z.string()),
  completionCriteriaItems: z.array(ticketChecklistItemSchema),
  validation: z.array(z.string()),
  validationItems: z.array(ticketChecklistItemSchema),
  userInstructions: z.array(ticketLogEntrySchema),
  progressNotes: z.array(ticketLogEntrySchema),
  hasUserInstructionsSection: z.boolean(),
  unknownBlocks: z.array(z.string()),
  range: ticketSourceRangeSchema,
  missingFields: z.array(z.string()),
});

export type TicketItem = z.infer<typeof ticketItemSchema>;

export const ticketDocumentSchema = z.object({
  title: z.string(),
  status: ticketDocumentStatusSchema,
  tickets: z.array(ticketItemSchema),
  lineCount: z.number().int().nonnegative(),
  missingSections: z.array(z.string()),
});

export type TicketDocument = z.infer<typeof ticketDocumentSchema>;

export const markdownFileTypeSchema = z.enum(["tickets", "plan", "inventory", "markdown"]);

export type MarkdownFileType = z.infer<typeof markdownFileTypeSchema>;

export const workspaceProjectSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  root: z.string().min(1),
  workspaceRoot: z.string().min(1),
});
export type WorkspaceProject = z.infer<typeof workspaceProjectSchema>;

export const workspaceSummarySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  root: z.string().min(1),
  isAvailable: z.boolean(),
  hasDocs: z.boolean(),
  lastOpenedAt: z.string().datetime().optional(),
  project: workspaceProjectSchema.optional(),
});

export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>;

export const workspacesResponseSchema = z.object({
  workspaces: z.array(workspaceSummarySchema),
  lastWorkspaceId: z.string().min(1).optional(),
});

export type WorkspacesResponse = z.infer<typeof workspacesResponseSchema>;

export const markdownFileSummarySchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  type: markdownFileTypeSchema,
  filename: z.string().min(1),
  directory: z.string(),
  relativePath: z.string().min(1),
  workspaceRelativePath: z.string().min(1),
  absolutePath: z.string().min(1).optional(),
  mtimeMs: z.number().nonnegative(),
  hash: z.string().min(1),
  slug: z.string().min(1),
  sequenceNumber: z.number().int().nonnegative().optional(),
});

export type MarkdownFileSummary = z.infer<typeof markdownFileSummarySchema>;

export const markdownFileChangeEventSchema = z.object({
  eventType: z.enum(["changed", "removed"]),
  workspaceId: z.string().min(1),
  fileId: z.string().min(1),
  relativePath: z.string().min(1),
  workspaceRelativePath: z.string().min(1),
  absolutePath: z.string().min(1).optional(),
  observedAt: z.string().datetime(),
  file: markdownFileSummarySchema.optional(),
});

export type MarkdownFileChangeEvent = z.infer<
  typeof markdownFileChangeEventSchema
>;

export const markdownHeadingSchema = z.object({
  level: z.number().int().min(1).max(6),
  title: z.string().min(1),
  line: z.number().int().positive(),
});

export type MarkdownHeading = z.infer<typeof markdownHeadingSchema>;

export const documentSetTicketProgressSchema = z.object({
  doneTickets: z.number().int().nonnegative().optional(),
  totalTickets: z.number().int().nonnegative().optional(),
});

export type DocumentSetTicketProgress = z.infer<
  typeof documentSetTicketProgressSchema
>;

export const documentSetSummarySchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  directory: z.string(),
  slug: z.string().min(1),
  label: z.string().min(1),
  sequenceNumber: z.number().int().nonnegative().optional(),
  documents: z.array(markdownFileSummarySchema),
  types: z.array(markdownFileTypeSchema),
  primaryFile: markdownFileSummarySchema,
  ticketProgress: documentSetTicketProgressSchema.optional(),
  allTicketsDone: z.boolean().optional(),
});

export type DocumentSetSummary = z.infer<typeof documentSetSummarySchema>;

export const documentSetsResponseSchema = z.object({
  sets: z.array(documentSetSummarySchema),
});

export type DocumentSetsResponse = z.infer<typeof documentSetsResponseSchema>;

export const markdownDocumentResponseSchema = z.object({
  file: markdownFileSummarySchema,
  markdown: z.string(),
  outline: z.array(markdownHeadingSchema),
});

export type MarkdownDocumentResponse = z.infer<typeof markdownDocumentResponseSchema>;

export const ticketDocumentResponseSchema = z.object({
  file: markdownFileSummarySchema,
  document: ticketDocumentSchema,
});

export type TicketDocumentResponse = z.infer<typeof ticketDocumentResponseSchema>;

export const ticketInstructionKindSchema = z.enum(["manual", "instruction", "bug", "decision"]);
export type TicketInstructionKind = z.infer<typeof ticketInstructionKindSchema>;
export const TICKET_INSTRUCTION_LABELS: Record<TicketInstructionKind, string> = {
  manual: "수동지시",
  instruction: "사용자 지시",
  bug: "버그 제보",
  decision: "결정",
};

export const boardOrderSchema = z.object({
  keys: z.array(z.string().min(1)).max(20_000),
});

export type BoardOrder = z.infer<typeof boardOrderSchema>;
