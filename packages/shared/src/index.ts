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

export const codexRunDefaultsSchema = z.object({
  model: z.string().min(1).optional(),
  reasoningEffort: z.string().min(1).optional(),
  speedTier: z.string().min(1).optional(),
});

export type CodexRunDefaults = z.infer<typeof codexRunDefaultsSchema>;

export const alphaKanbanRuntimeSettingsSchema = z.object({
  workspaceRoots: z.array(z.string().min(1)).optional(),
});

export type AlphaKanbanRuntimeSettings = z.infer<
  typeof alphaKanbanRuntimeSettingsSchema
>;

export const alphaKanbanStateSchema = z.object({
  version: z.literal(2),
  recentWorkspaces: z.array(recentWorkspaceSchema).default([]),
  lastWorkspaceId: z.string().min(1).optional(),
  documents: z.record(z.string(), codexDocumentStateSchema).default({}),
  runResults: z.record(z.string(), codexRunReadStateSchema).default({}),
  codexRunDefaults: codexRunDefaultsSchema.default({}),
  runtimeSettings: alphaKanbanRuntimeSettingsSchema.default({}),
  // All-tickets board card order: "<absolute file path>#<ticket id>" keys, first = top.
  boardOrder: z.array(z.string().min(1)).default([]),
});

export type AlphaKanbanState = z.infer<typeof alphaKanbanStateSchema>;

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

export const selectWorkspaceRequestSchema = z
  .object({
    root: z.string().min(1).optional(),
    workspaceId: z.string().min(1).optional(),
  })
  .refine((value) => Boolean(value.root || value.workspaceId), {
    message: "root or workspaceId is required",
  });

export type SelectWorkspaceRequest = z.infer<typeof selectWorkspaceRequestSchema>;

export const selectWorkspaceResponseSchema = z.object({
  workspace: workspaceSummarySchema,
});

export type SelectWorkspaceResponse = z.infer<typeof selectWorkspaceResponseSchema>;

export const createWorkspaceRequestSchema = z.object({
  parentRoot: z.string().min(1),
  projectName: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, {
      message: "projectName must be a safe folder name",
    }),
  gitInit: z.boolean().optional(),
});

export type CreateWorkspaceRequest = z.infer<typeof createWorkspaceRequestSchema>;

export const createWorkspaceResponseSchema = z.object({
  workspace: workspaceSummarySchema,
  createdPath: z.string().min(1),
  gitInitialized: z.boolean(),
});

export type CreateWorkspaceResponse = z.infer<typeof createWorkspaceResponseSchema>;

export const workspaceDirectoryRootSchema = z.object({
  path: z.string().min(1),
  label: z.string().min(1),
});

export type WorkspaceDirectoryRoot = z.infer<typeof workspaceDirectoryRootSchema>;

export const workspaceDirectoryEntrySchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  isWorkspaceCandidate: z.boolean(),
  hasDocs: z.boolean(),
});

export type WorkspaceDirectoryEntry = z.infer<typeof workspaceDirectoryEntrySchema>;

export const workspaceDirectorySchema = z.object({
  path: z.string().min(1),
  label: z.string().min(1),
  parentPath: z.string().min(1).optional(),
  isWorkspaceCandidate: z.boolean(),
  hasDocs: z.boolean(),
  children: z.array(workspaceDirectoryEntrySchema),
});

export type WorkspaceDirectory = z.infer<typeof workspaceDirectorySchema>;

export const workspaceDirectoriesRequestSchema = z.object({
  root: z.string().min(1).optional(),
});

export type WorkspaceDirectoriesRequest = z.infer<
  typeof workspaceDirectoriesRequestSchema
>;

export const workspaceDirectoriesResponseSchema = z.object({
  roots: z.array(workspaceDirectoryRootSchema),
  directory: workspaceDirectorySchema.optional(),
});

export type WorkspaceDirectoriesResponse = z.infer<
  typeof workspaceDirectoriesResponseSchema
>;

export const workspaceRootsSettingsResponseSchema = z.object({
  roots: z.array(workspaceDirectoryRootSchema),
  defaultRoots: z.array(workspaceDirectoryRootSchema),
  hasOverride: z.boolean(),
});

export type WorkspaceRootsSettingsResponse = z.infer<
  typeof workspaceRootsSettingsResponseSchema
>;

export const updateWorkspaceRootsSettingsRequestSchema = z.object({
  roots: z.array(z.string().min(1)).min(1),
});

export type UpdateWorkspaceRootsSettingsRequest = z.infer<
  typeof updateWorkspaceRootsSettingsRequestSchema
>;

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

export const filesResponseSchema = z.object({
  files: z.array(markdownFileSummarySchema),
});

export type FilesResponse = z.infer<typeof filesResponseSchema>;

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

export const patchTicketRequestSchema = z.object({
  status: ticketStatusSchema.optional(),
  progress: ticketProgressSchema.optional(),
  reason: z.string().trim().max(4_000).optional(),
  expectedHash: z.string().min(1).optional(),
  expectedMtimeMs: z.number().nonnegative().optional(),
});

export type PatchTicketRequest = z.infer<typeof patchTicketRequestSchema>;

export const appendTicketLogRequestSchema = z.object({
  text: z.string().trim().min(1),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  expectedHash: z.string().min(1).optional(),
  expectedMtimeMs: z.number().nonnegative().optional(),
});

export type AppendTicketLogRequest = z.infer<typeof appendTicketLogRequestSchema>;

export const ticketInstructionKindSchema = z.enum(["manual", "instruction", "bug", "decision"]);
export type TicketInstructionKind = z.infer<typeof ticketInstructionKindSchema>;
export const TICKET_INSTRUCTION_LABELS: Record<TicketInstructionKind, string> = {
  manual: "수동지시",
  instruction: "사용자 지시",
  bug: "버그 제보",
  decision: "결정",
};

export const appendTicketInstructionRequestSchema = appendTicketLogRequestSchema.extend({
  kind: ticketInstructionKindSchema.optional(),
});

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

export const codexRunModeSchema = z.enum(["edit", "read_only"]);

export type CodexRunMode = z.infer<typeof codexRunModeSchema>;

export const codexAppliedRunDefaultsSchema = codexRunDefaultsSchema.extend({
  speedTierApplied: z.boolean().default(false),
  speedTierConfigKey: z.string().min(1).optional(),
});

export type CodexAppliedRunDefaults = z.infer<typeof codexAppliedRunDefaultsSchema>;

export const codexReasoningLevelSchema = z.object({
  effort: z.string().min(1),
  description: z.string().optional(),
});

export type CodexReasoningLevel = z.infer<typeof codexReasoningLevelSchema>;

export const codexServiceTierSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
});

export type CodexServiceTier = z.infer<typeof codexServiceTierSchema>;

export const codexModelCatalogItemSchema = z.object({
  slug: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().optional(),
  defaultReasoning: z.string().min(1).optional(),
  supportedReasoning: z.array(codexReasoningLevelSchema),
  additionalSpeedTiers: z.array(z.string().min(1)),
  supportsFast: z.boolean(),
  serviceTiers: z.array(codexServiceTierSchema),
  visibility: z.string().optional(),
  supportedInApi: z.boolean().optional(),
});

export type CodexModelCatalogItem = z.infer<typeof codexModelCatalogItemSchema>;

export const codexModelsResponseSchema = z.object({
  models: z.array(codexModelCatalogItemSchema),
  source: z.enum(["live", "bundled"]),
  generatedAt: z.string().datetime(),
});

export type CodexModelsResponse = z.infer<typeof codexModelsResponseSchema>;

export const updateCodexRunDefaultsRequestSchema = z.object({
  model: z.string().min(1).nullable().optional(),
  reasoningEffort: z.string().min(1).nullable().optional(),
  speedTier: z.string().min(1).nullable().optional(),
});

export type UpdateCodexRunDefaultsRequest = z.infer<
  typeof updateCodexRunDefaultsRequestSchema
>;

export const codexRunDefaultsResponseSchema = z.object({
  defaults: codexRunDefaultsSchema,
});

export type CodexRunDefaultsResponse = z.infer<typeof codexRunDefaultsResponseSchema>;

export const codexChatScopeSchema = z.enum(["ticket", "document", "workspace"]);

export type CodexChatScope = z.infer<typeof codexChatScopeSchema>;

export const codexChatScopeMentionKindSchema = z.enum(["ticket", "document", "workspace"]);

export type CodexChatScopeMentionKind = z.infer<
  typeof codexChatScopeMentionKindSchema
>;

export const codexChatScopeMentionSchema = z.object({
  kind: codexChatScopeMentionKindSchema,
  targetTicketId: z.string().min(1).optional(),
  token: z.string().min(1),
});

export type CodexChatScopeMention = z.infer<typeof codexChatScopeMentionSchema>;

export const codexChatScopeResolutionSchema = z.object({
  scope: codexChatScopeSchema,
  targetWorkspaceId: z.string().min(1),
  targetFileId: z.string().min(1).optional(),
  targetTicketId: z.string().min(1).optional(),
  rawMessage: z.string(),
  cleanedMessage: z.string(),
  mentions: z.array(codexChatScopeMentionSchema),
  warnings: z.array(z.string()),
});

export type CodexChatScopeResolution = z.infer<typeof codexChatScopeResolutionSchema>;

export type ResolveCodexChatScopeInput = {
  defaultScope: CodexChatScope;
  rawMessage: string;
  targetFileId?: string;
  targetTicketId?: string;
  targetWorkspaceId: string;
};

export const codexPromptPreviewRequestSchema = z.object({
  bypassSandbox: z.boolean().optional(),
  fileId: z.string().min(1),
  ticketId: z.string().min(1),
  instructionDraft: z.string().optional(),
  instruction: z.string().optional(),
  mode: codexRunModeSchema.optional(),
});

export type CodexPromptPreviewRequest = z.infer<typeof codexPromptPreviewRequestSchema>;

export const codexPromptPreviewResponseSchema = z.object({
  fileId: z.string().min(1),
  ticketId: z.string().min(1),
  mode: codexRunModeSchema,
  runDefaults: codexAppliedRunDefaultsSchema,
  prompt: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()),
  instructionDraft: z.string().optional(),
  instructionSummary: z.string().optional(),
  resumeSessionId: z.string().optional(),
  scopeResolution: codexChatScopeResolutionSchema,
  statePath: z.string().min(1),
});

export type CodexPromptPreviewResponse = z.infer<typeof codexPromptPreviewResponseSchema>;

export const codexWorkspaceChatIntentSchema = z.enum([
  "general",
  "spec_grilling",
  "plan_ticketing_handoff",
]);

export type CodexWorkspaceChatIntent = z.infer<typeof codexWorkspaceChatIntentSchema>;

export const codexWorkspacePromptPreviewRequestSchema = z.object({
  bypassSandbox: z.boolean().optional(),
  currentFileId: z.string().min(1).optional(),
  intent: codexWorkspaceChatIntentSchema.optional(),
  instructionDraft: z.string().optional(),
  instruction: z.string().optional(),
  mode: codexRunModeSchema.optional(),
});

export type CodexWorkspacePromptPreviewRequest = z.infer<
  typeof codexWorkspacePromptPreviewRequestSchema
>;

export const codexWorkspacePromptPreviewResponseSchema = z.object({
  workspaceId: z.string().min(1),
  workspaceRoot: z.string().min(1),
  intent: codexWorkspaceChatIntentSchema,
  mode: codexRunModeSchema,
  runDefaults: codexAppliedRunDefaultsSchema,
  prompt: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()),
  currentFile: markdownFileSummarySchema.optional(),
  instructionDraft: z.string().optional(),
  instructionSummary: z.string().optional(),
  scopeResolution: codexChatScopeResolutionSchema,
  documentSets: z.array(documentSetSummarySchema),
});

export type CodexWorkspacePromptPreviewResponse = z.infer<
  typeof codexWorkspacePromptPreviewResponseSchema
>;

export const createWorkspaceCodexRunRequestSchema =
  codexWorkspacePromptPreviewRequestSchema.extend({
    dryRun: z.boolean().optional(),
  });

export type CreateWorkspaceCodexRunRequest = z.infer<
  typeof createWorkspaceCodexRunRequestSchema
>;

export const createCodexRunRequestSchema = codexPromptPreviewRequestSchema.extend({
  dryRun: z.boolean().optional(),
  expectedHash: z.string().min(1).optional(),
  expectedMtimeMs: z.number().nonnegative().optional(),
  sourceMessageId: z.string().min(1).optional(),
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
  mode: codexRunModeSchema,
  runDefaults: codexAppliedRunDefaultsSchema,
  status: codexRunStatusSchema,
  prompt: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()),
  dryRun: z.boolean(),
  instructionDraft: z.string().optional(),
  instructionSummary: z.string().optional(),
  retryOfRunId: z.string().min(1).optional(),
  sourceMessageId: z.string().min(1).optional(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().optional(),
  exitCode: z.number().int().nullable().optional(),
  logPath: z.string().min(1),
  resumeSessionId: z.string().optional(),
  capturedSessionId: z.string().optional(),
  scopeResolution: codexChatScopeResolutionSchema,
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
  mode: codexRunModeSchema,
  runDefaults: codexAppliedRunDefaultsSchema,
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

export const codexChatRoleSchema = z.enum(["user", "assistant"]);

export type CodexChatRole = z.infer<typeof codexChatRoleSchema>;

export const codexChatContentFormatSchema = z.enum(["text", "markdown"]);

export type CodexChatContentFormat = z.infer<typeof codexChatContentFormatSchema>;

type MentionMatch = CodexChatScopeMention & {
  end: number;
  start: number;
};

export type CodexChatScopeMentionRange = CodexChatScopeMention & {
  end: number;
  start: number;
};

const SCOPE_MENTION_PATTERN =
  /(^|[\s([{'"`])@(workspace|w|tickets|document|doc|d|t:[A-Za-z][A-Za-z0-9]*-\d+|ticket:[A-Za-z][A-Za-z0-9]*-\d+)(?=$|[\s)\]}'"`.,;!?])/gi;

export function resolveCodexChatScope(
  input: ResolveCodexChatScopeInput,
): CodexChatScopeResolution {
  const rawMessage = input.rawMessage;
  const mentions = parseCodexScopeMentions(rawMessage);
  const lastMention = mentions.at(-1);
  const warnings: string[] = [];
  const scope = lastMention ? mentionKindToScope(lastMention.kind) : input.defaultScope;
  const targetTicketId =
    scope === "ticket" ? lastMention?.targetTicketId ?? input.targetTicketId : undefined;
  const targetFileId = scope === "workspace" ? undefined : input.targetFileId;

  if (mentions.length > 1) {
    warnings.push("Multiple scope mentions were found; the last mention controls the scope.");
  }

  if ((scope === "ticket" || scope === "document") && !targetFileId) {
    warnings.push("Document scope requires a selected ticket document.");
  }

  if (scope === "ticket" && !targetTicketId) {
    warnings.push("Ticket scope requires a selected ticket.");
  }

  return {
    scope,
    targetWorkspaceId: input.targetWorkspaceId,
    targetFileId,
    targetTicketId,
    rawMessage,
    cleanedMessage: removeMentionRanges(rawMessage, mentions).replace(/\s+/g, " ").trim(),
    mentions: mentions.map(({ end: _end, start: _start, ...mention }) => mention),
    warnings,
  };
}

export function isCodexChatScopeRunAllowed(
  resolution: CodexChatScopeResolution,
  mode: CodexRunMode,
): boolean {
  return !(mode === "edit" && resolution.scope === "workspace");
}

export function codexChatScopeRunWarnings(
  resolution: CodexChatScopeResolution,
  mode: CodexRunMode,
): string[] {
  const warnings = [...resolution.warnings];
  if (!isCodexChatScopeRunAllowed(resolution, mode)) {
    warnings.push(
      "Workspace scope is read-only from a ticket drawer; use workspace chat/spec grilling before file-edit runs.",
    );
  }
  return warnings;
}

export function findCodexChatScopeMentionRanges(
  rawMessage: string,
): CodexChatScopeMentionRange[] {
  return parseCodexScopeMentions(rawMessage).map((mention) => ({ ...mention }));
}

export const codexChatMessageSchema = z.object({
  id: z.string().min(1),
  scope: codexChatScopeSchema,
  role: codexChatRoleSchema,
  contentFormat: codexChatContentFormatSchema,
  content: z.string(),
  createdAt: z.string().datetime(),
  workspaceId: z.string().min(1),
  fileRelativePath: z.string().min(1).optional(),
  ticketId: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type CodexChatMessage = z.infer<typeof codexChatMessageSchema>;

export const codexTicketChatResponseSchema = z.object({
  messages: z.array(codexChatMessageSchema),
});

export type CodexTicketChatResponse = z.infer<typeof codexTicketChatResponseSchema>;

export const codexWorkspaceChatResponseSchema = z.object({
  messages: z.array(codexChatMessageSchema),
});

export type CodexWorkspaceChatResponse = z.infer<typeof codexWorkspaceChatResponseSchema>;

export const appendWorkspaceChatMessageRequestSchema = z.object({
  content: z.string().min(1),
  contentFormat: codexChatContentFormatSchema.optional(),
});

export type AppendWorkspaceChatMessageRequest = z.infer<
  typeof appendWorkspaceChatMessageRequestSchema
>;

function parseCodexScopeMentions(rawMessage: string): MentionMatch[] {
  const mentions: MentionMatch[] = [];

  for (const match of rawMessage.matchAll(SCOPE_MENTION_PATTERN)) {
    const fullMatch = match[0] ?? "";
    const prefix = match[1] ?? "";
    const tokenBody = match[2] ?? "";
    const start = (match.index ?? 0) + prefix.length;
    const end = (match.index ?? 0) + fullMatch.length;
    const token = `@${tokenBody}`;
    const normalizedToken = token.toLowerCase();

    if (normalizedToken === "@w" || normalizedToken === "@workspace") {
      mentions.push({ end, kind: "workspace", start, token });
      continue;
    }

    if (
      normalizedToken === "@d" ||
      normalizedToken === "@doc" ||
      normalizedToken === "@document" ||
      normalizedToken === "@tickets"
    ) {
      mentions.push({ end, kind: "document", start, token });
      continue;
    }

    if (normalizedToken.startsWith("@t:") || normalizedToken.startsWith("@ticket:")) {
      const targetTicketId = token.slice(token.indexOf(":") + 1).toUpperCase();
      mentions.push({ end, kind: "ticket", start, targetTicketId, token });
    }
  }

  return mentions;
}

function removeMentionRanges(rawMessage: string, mentions: MentionMatch[]): string {
  if (mentions.length === 0) {
    return rawMessage.trim();
  }

  let cursor = 0;
  let cleaned = "";
  for (const mention of mentions) {
    cleaned += rawMessage.slice(cursor, mention.start);
    cursor = mention.end;
  }
  cleaned += rawMessage.slice(cursor);

  return cleaned.trim();
}

function mentionKindToScope(kind: CodexChatScopeMentionKind): CodexChatScope {
  return kind === "workspace" ? "workspace" : kind === "document" ? "document" : "ticket";
}

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

export const boardOrderSchema = z.object({
  keys: z.array(z.string().min(1)).max(20_000),
});

export type BoardOrder = z.infer<typeof boardOrderSchema>;

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
