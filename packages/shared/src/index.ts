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

export const progressBoardRowSchema = z.object({
  ticketId: z.string().min(1),
  status: ticketStatusSchema,
  progress: ticketProgressSchema,
  repository: z.string(),
  dependsOn: z.string(),
  line: z.number().int().positive(),
});

export type ProgressBoardRow = z.infer<typeof progressBoardRowSchema>;

export const ticketItemSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  status: ticketStatusSchema,
  progress: ticketProgressSchema,
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
  progressBoard: z.array(progressBoardRowSchema),
  tickets: z.array(ticketItemSchema),
  lineCount: z.number().int().nonnegative(),
  missingSections: z.array(z.string()),
});

export type TicketDocument = z.infer<typeof ticketDocumentSchema>;

export const markdownFileTypeSchema = z.enum(["tickets", "plan", "inventory", "markdown"]);

export type MarkdownFileType = z.infer<typeof markdownFileTypeSchema>;

export const alphaKanbanConfigFileSchema = z.object({
  workspaceRoots: z.array(z.string().min(1)).optional(),
  defaultDocRoots: z.array(z.string().min(1)).optional(),
  docRoots: z.array(z.string().min(1)).optional(),
  codexCommand: z.string().min(1).optional(),
});

export type AlphaKanbanConfigFile = z.infer<typeof alphaKanbanConfigFileSchema>;

export const recentWorkspaceSchema = z.object({
  id: z.string().min(1),
  root: z.string().min(1),
  label: z.string().min(1),
  lastOpenedAt: z.string().datetime(),
});

export type RecentWorkspace = z.infer<typeof recentWorkspaceSchema>;

export const workspaceScopedDocumentKeySchema = z
  .string()
  .min(1)
  .regex(/^[^:]+::.+$/);

export type WorkspaceScopedDocumentKey = z.infer<typeof workspaceScopedDocumentKeySchema>;

export const codexDocumentStateSchema = z.object({
  codexSessionId: z.string().min(1).optional(),
  relatedDocuments: z.array(z.string()).default([]),
  parentTicketId: z.string().min(1).optional(),
  lastTicketId: z.string().min(1).optional(),
  updatedAt: z.string().datetime(),
});

export type CodexDocumentState = z.infer<typeof codexDocumentStateSchema>;

export const codexRunReadStateSchema = z.object({
  readAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type CodexRunReadState = z.infer<typeof codexRunReadStateSchema>;

export const alphaKanbanStateSchema = z.object({
  version: z.literal(2),
  recentWorkspaces: z.array(recentWorkspaceSchema).default([]),
  lastWorkspaceId: z.string().min(1).optional(),
  documents: z.record(z.string(), codexDocumentStateSchema).default({}),
  runResults: z.record(z.string(), codexRunReadStateSchema).default({}),
});

export type AlphaKanbanState = z.infer<typeof alphaKanbanStateSchema>;

export const markdownFileSummarySchema = z.object({
  id: z.string().min(1),
  type: markdownFileTypeSchema,
  filename: z.string().min(1),
  relativePath: z.string().min(1),
  absolutePath: z.string().min(1),
  mtimeMs: z.number().nonnegative(),
  hash: z.string().min(1),
  slug: z.string().min(1),
});

export type MarkdownFileSummary = z.infer<typeof markdownFileSummarySchema>;

export const filesResponseSchema = z.object({
  files: z.array(markdownFileSummarySchema),
});

export type FilesResponse = z.infer<typeof filesResponseSchema>;

export const ticketDocumentResponseSchema = z.object({
  file: markdownFileSummarySchema,
  document: ticketDocumentSchema,
});

export type TicketDocumentResponse = z.infer<typeof ticketDocumentResponseSchema>;

export const patchTicketRequestSchema = z.object({
  status: ticketStatusSchema.optional(),
  progress: ticketProgressSchema.optional(),
  expectedHash: z.string().min(1).optional(),
  expectedMtimeMs: z.number().nonnegative().optional(),
});

export type PatchTicketRequest = z.infer<typeof patchTicketRequestSchema>;

export const appendTicketLogRequestSchema = z.object({
  text: z.string().min(1),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  expectedHash: z.string().min(1).optional(),
  expectedMtimeMs: z.number().nonnegative().optional(),
});

export type AppendTicketLogRequest = z.infer<typeof appendTicketLogRequestSchema>;

export const codexRunStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);

export type CodexRunStatus = z.infer<typeof codexRunStatusSchema>;

export const codexRunEventTypeSchema = z.enum([
  "prompt",
  "system",
  "stdout",
  "stderr",
  "json",
  "exit",
  "error",
]);

export type CodexRunEventType = z.infer<typeof codexRunEventTypeSchema>;

export const codexPromptPreviewRequestSchema = z.object({
  fileId: z.string().min(1),
  ticketId: z.string().min(1),
  instructionDraft: z.string().optional(),
  instruction: z.string().optional(),
});

export type CodexPromptPreviewRequest = z.infer<typeof codexPromptPreviewRequestSchema>;

export const codexPromptPreviewResponseSchema = z.object({
  fileId: z.string().min(1),
  ticketId: z.string().min(1),
  prompt: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()),
  instructionDraft: z.string().optional(),
  instructionSummary: z.string().optional(),
  resumeSessionId: z.string().optional(),
  statePath: z.string().min(1),
});

export type CodexPromptPreviewResponse = z.infer<typeof codexPromptPreviewResponseSchema>;

export const createCodexRunRequestSchema = codexPromptPreviewRequestSchema.extend({
  dryRun: z.boolean().optional(),
  expectedHash: z.string().min(1).optional(),
  expectedMtimeMs: z.number().nonnegative().optional(),
});

export type CreateCodexRunRequest = z.infer<typeof createCodexRunRequestSchema>;

export const codexRunEventSchema = z.object({
  id: z.number().int().nonnegative(),
  type: codexRunEventTypeSchema,
  timestamp: z.string().datetime(),
  message: z.string(),
  data: z.unknown().optional(),
});

export type CodexRunEvent = z.infer<typeof codexRunEventSchema>;

export const codexRunSnapshotSchema = z.object({
  id: z.string().min(1),
  fileId: z.string().min(1),
  ticketId: z.string().min(1),
  status: codexRunStatusSchema,
  prompt: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()),
  dryRun: z.boolean(),
  instructionDraft: z.string().optional(),
  instructionSummary: z.string().optional(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().optional(),
  exitCode: z.number().int().nullable().optional(),
  logPath: z.string().min(1),
  resumeSessionId: z.string().optional(),
  capturedSessionId: z.string().optional(),
  events: z.array(codexRunEventSchema),
});

export type CodexRunSnapshot = z.infer<typeof codexRunSnapshotSchema>;

export const codexRunSignalStatusSchema = z.enum([
  "idle",
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "needs_auth",
  "unknown",
]);

export type CodexRunSignalStatus = z.infer<typeof codexRunSignalStatusSchema>;

export const codexRunSummarySchema = z.object({
  id: z.string().min(1),
  fileId: z.string().min(1),
  ticketId: z.string().min(1),
  status: codexRunSignalStatusSchema,
  rawStatus: codexRunStatusSchema,
  instructionSummary: z.string().optional(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().optional(),
  readAt: z.string().datetime().optional(),
  isUnread: z.boolean(),
  logPath: z.string().min(1),
  eventCount: z.number().int().nonnegative(),
  latestEvent: codexRunEventSchema.optional(),
});

export type CodexRunSummary = z.infer<typeof codexRunSummarySchema>;

export const codexDocumentRunSummaryResponseSchema = z.object({
  fileId: z.string().min(1),
  status: codexRunSignalStatusSchema,
  canStartRun: z.boolean(),
  activeRun: codexRunSummarySchema.optional(),
  latestRun: codexRunSummarySchema.optional(),
  runs: z.array(codexRunSummarySchema),
});

export type CodexDocumentRunSummaryResponse = z.infer<
  typeof codexDocumentRunSummaryResponseSchema
>;

export const createCodexRunResponseSchema = z.object({
  run: codexRunSnapshotSchema,
});

export type CreateCodexRunResponse = z.infer<typeof createCodexRunResponseSchema>;

export const codexRunResponseSchema = createCodexRunResponseSchema;

export type CodexRunResponse = z.infer<typeof codexRunResponseSchema>;

export const cancelCodexRunResponseSchema = z.object({
  run: codexRunSnapshotSchema,
});

export type CancelCodexRunResponse = z.infer<typeof cancelCodexRunResponseSchema>;

export const markCodexRunReadResponseSchema = z.object({
  run: codexRunSummarySchema,
});

export type MarkCodexRunReadResponse = z.infer<typeof markCodexRunReadResponseSchema>;

export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;

export const healthResponseSchema = z.object({
  app: z.literal(APP_NAME),
  service: z.string().min(1),
  status: z.literal("ok"),
  timestamp: z.string().datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export function createHealthResponse(service: string): HealthResponse {
  return {
    app: APP_NAME,
    service,
    status: "ok",
    timestamp: new Date().toISOString(),
  };
}
