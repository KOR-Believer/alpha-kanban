import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";

import type {
  CodexChatScopeResolution,
  CodexDocumentRunSummaryResponse,
  CodexPromptPreviewRequest,
  CodexPromptPreviewResponse,
  CodexRunEvent,
  CodexRunSignalStatus,
  CodexRunSnapshot,
  CodexRunSummary,
  CodexRunStatus,
  CodexRunMode,
  CodexTicketChatResponse,
  CodexWorkspaceChatResponse,
  CodexWorkspaceChatIntent,
  CodexWorkspacePromptPreviewRequest,
  CodexWorkspacePromptPreviewResponse,
  CodexAppliedRunDefaults,
  CodexModelsResponse,
  CodexRunDefaults,
  CodexRunDefaultsResponse,
  CreateCodexRunRequest,
  CreateWorkspaceCodexRunRequest,
  DocumentSetSummary,
  MarkdownFileSummary,
} from "@alpha-kanban/shared";
import {
  codexChatScopeRunWarnings,
  isCodexChatScopeRunAllowed,
  resolveCodexChatScope,
} from "@alpha-kanban/shared";

import { CodexChatStore } from "./codexChat";
import { formatCodexCommandError, resolveCodexCommand } from "./codexCommand";
import { listCodexModels } from "./codexModels";
import type { ServerConfig } from "./config";
import { CodexStateStore } from "./codexState";
import type { MarkdownFileStore } from "./files";

export const CODEX_RUN_ERROR = {
  CHAT_MESSAGE_NOT_FOUND: "CODEX_CHAT_MESSAGE_NOT_FOUND",
  DOCUMENT_RUN_ACTIVE: "CODEX_DOCUMENT_RUN_ACTIVE",
  SCOPE_NOT_ALLOWED: "CODEX_SCOPE_NOT_ALLOWED",
  RUN_NOT_FOUND: "CODEX_RUN_NOT_FOUND",
  NOT_RUNNING: "CODEX_RUN_NOT_RUNNING",
} as const;

export type CodexRunErrorCode = (typeof CODEX_RUN_ERROR)[keyof typeof CODEX_RUN_ERROR];

export class CodexRunError extends Error {
  readonly code: CodexRunErrorCode;

  constructor(code: CodexRunErrorCode, message: string) {
    super(message);
    this.name = "CodexRunError";
    this.code = code;
  }
}

type RunSubscriber = (event: CodexRunEvent) => void;

type RunFinishContext = {
  chatScope: "ticket" | "workspace";
  fileRelativePath?: string;
  planPath?: string;
  workspaceIntent?: CodexWorkspaceChatIntent;
};

type PendingInstructionAppend = {
  expectedHash?: string;
  expectedMtimeMs?: number;
  instructionSummary: string;
};

type MutableRun = Omit<CodexRunSnapshot, "events"> & {
  child?: ChildProcess;
  events: CodexRunEvent[];
  isFinishing: boolean;
  pendingInstructionAppend?: PendingInstructionAppend;
  readOnlyGitStatusBefore?: string;
  subscribers: Set<RunSubscriber>;
  stderrBuffer: string;
};

const execFileAsync = promisify(execFile);

export class CodexRunner {
  private readonly chatStore: CodexChatStore;
  private readonly runs = new Map<string, MutableRun>();
  private readonly stateStore: CodexStateStore;

  constructor(
    private readonly config: ServerConfig,
    private readonly fileStore: MarkdownFileStore,
  ) {
    this.chatStore = new CodexChatStore(config, { workspaceId: fileStore.workspaceId });
    this.stateStore = new CodexStateStore(config, { workspaceId: fileStore.workspaceId });
  }

  private resolvePromptScope(
    request: Pick<CodexPromptPreviewRequest, "fileId" | "ticketId">,
    instructionDraft: string,
  ): CodexChatScopeResolution {
    return resolveCodexChatScope({
      defaultScope: "ticket",
      rawMessage: instructionDraft,
      targetFileId: request.fileId,
      targetTicketId: request.ticketId,
      targetWorkspaceId: this.fileStore.workspaceId,
    });
  }

  private resolveWorkspacePromptScope(
    instructionDraft: string,
  ): CodexChatScopeResolution {
    return resolveCodexChatScope({
      defaultScope: "workspace",
      rawMessage: instructionDraft,
      targetWorkspaceId: this.fileStore.workspaceId,
    });
  }

  async previewPrompt(
    request: CodexPromptPreviewRequest,
  ): Promise<CodexPromptPreviewResponse> {
    const { file, document } = await this.fileStore.readTicketDocument(request.fileId);
    const ticket = document.tickets.find((item) => item.id === request.ticketId);

    if (!ticket) {
      throw new CodexRunError(
        CODEX_RUN_ERROR.RUN_NOT_FOUND,
        `Ticket ${request.ticketId} was not found.`,
      );
    }

    const documentState = await this.stateStore.getDocumentState(file.relativePath);
    const workspaceRoot = this.fileStore.workspaceRoot;
    const planPath = document.status.planPath
      ? path.resolve(workspaceRoot, document.status.planPath)
      : undefined;
    const instructionDraft = normalizeInstructionDraft(request);
    const instructionSummary = summarizeInstructionDraft(instructionDraft);
    const mode = normalizeRunMode(request.mode);
    const scopeResolution = this.resolvePromptScope(request, instructionDraft);
    const skipGitRepoCheck = await shouldSkipGitRepoCheck(workspaceRoot);
    const runDefaults = applyCodexRunDefaults(await this.stateStore.getCodexRunDefaults());
    const prompt = buildCodexPrompt({
      instructionDraft,
      instructionSummary,
      mode,
      planPath,
      scopeResolution,
      ticketFilePath: file.absolutePath,
      ticketId: ticket.id,
      ticketRange: ticket.range,
      workspaceRoot,
    });
    const args = buildCodexArgs(prompt, documentState?.codexSessionId, {
      bypassSandbox: request.bypassSandbox,
      runDefaults,
      skipGitRepoCheck,
    });

    return {
      fileId: request.fileId,
      ticketId: request.ticketId,
      mode,
      runDefaults,
      prompt,
      command: await resolveCodexCommand(this.config.codexCommand),
      args,
      instructionDraft: instructionDraft || undefined,
      instructionSummary,
      resumeSessionId: documentState?.codexSessionId,
      scopeResolution,
      statePath: this.stateStore.statePath,
    };
  }

  async startRun(request: CreateCodexRunRequest): Promise<CodexRunSnapshot> {
    if (!request.dryRun) {
      const activeRun = this.findActiveRunForFile(request.fileId);
      if (activeRun) {
        throw new CodexRunError(
          CODEX_RUN_ERROR.DOCUMENT_RUN_ACTIVE,
          `Document already has an active Codex run (${activeRun.id}) for ${activeRun.ticketId}.`,
        );
      }
    }

    const { file, document } = await this.fileStore.readTicketDocument(request.fileId);
    const ticket = document.tickets.find((item) => item.id === request.ticketId);

    if (!ticket) {
      throw new CodexRunError(
        CODEX_RUN_ERROR.RUN_NOT_FOUND,
        `Ticket ${request.ticketId} was not found.`,
      );
    }

    const sourceMessage = request.sourceMessageId
      ? await this.chatStore.findTicketMessage(
          file.relativePath,
          request.ticketId,
          request.sourceMessageId,
        )
      : undefined;

    if (request.sourceMessageId && (!sourceMessage || sourceMessage.role !== "user")) {
      throw new CodexRunError(
        CODEX_RUN_ERROR.CHAT_MESSAGE_NOT_FOUND,
        "Source ticket chat message was not found.",
      );
    }

    const effectiveRequest: CreateCodexRunRequest = sourceMessage
      ? {
          ...request,
          instruction: undefined,
          instructionDraft: sourceMessage.content,
        }
      : request;
    const instructionDraft = normalizeInstructionDraft(effectiveRequest);
    const instructionSummary = summarizeInstructionDraft(instructionDraft);
    const mode = normalizeRunMode(request.mode);
    const scopeResolution = this.resolvePromptScope(effectiveRequest, instructionDraft);
    const runId = randomUUID();

    if (!isCodexChatScopeRunAllowed(scopeResolution, mode)) {
      throw new CodexRunError(
        CODEX_RUN_ERROR.SCOPE_NOT_ALLOWED,
        codexChatScopeRunWarnings(scopeResolution, mode).at(-1) ??
          "Selected scope cannot be used for this Codex run.",
      );
    }

    const preview = await this.previewPrompt(effectiveRequest);
    if (sourceMessage) {
      await this.chatStore.linkTicketMessageRun(
        file.relativePath,
        request.ticketId,
        sourceMessage.id,
        runId,
      );
    } else {
      await this.chatStore.appendTicketMessage({
        fileRelativePath: file.relativePath,
        ticketId: request.ticketId,
        scope: preview.scopeResolution.scope,
        role: "user",
        contentFormat: "markdown",
        content: instructionDraft,
        runId,
      });
    }
    const run: MutableRun = {
      id: runId,
      fileId: request.fileId,
      ticketId: request.ticketId,
      mode,
      status: request.dryRun ? "succeeded" : "queued",
      runDefaults: preview.runDefaults,
      prompt: preview.prompt,
      command: preview.command,
      args: preview.args,
      dryRun: request.dryRun ?? false,
      instructionDraft: instructionDraft || undefined,
      instructionSummary,
      retryOfRunId: sourceMessage?.runId,
      sourceMessageId: sourceMessage?.id,
      startedAt: new Date().toISOString(),
      logPath: path.join(this.config.workspaceRoot, ".alpha-kanban", "runs", `${runId}.jsonl`),
      resumeSessionId: preview.resumeSessionId,
      scopeResolution: preview.scopeResolution,
      events: [],
      isFinishing: false,
      pendingInstructionAppend:
        mode === "edit" && instructionSummary && !request.dryRun
          ? {
              expectedHash: request.expectedHash,
              expectedMtimeMs: request.expectedMtimeMs,
              instructionSummary,
            }
          : undefined,
      readOnlyGitStatusBefore:
        mode === "read_only" && !request.dryRun
          ? await readGitStatus(this.fileStore.workspaceRoot)
          : undefined,
      subscribers: new Set(),
      stderrBuffer: "",
    };

    this.runs.set(runId, run);
    await fs.mkdir(path.dirname(run.logPath), { recursive: true });
    await this.addEvent(run, "prompt", preview.prompt, {
      command: preview.command,
      args: preview.args,
      bypassSandbox: Boolean(effectiveRequest.bypassSandbox),
      instructionSummary,
      mode,
      retryOfRunId: sourceMessage?.runId,
      runDefaults: preview.runDefaults,
      scopeResolution: preview.scopeResolution,
      sourceMessageId: sourceMessage?.id,
      statePath: preview.statePath,
      workspaceId: this.fileStore.workspaceId,
      workspaceRoot: this.fileStore.workspaceRoot,
      fileRelativePath: file.relativePath,
      ticketFilePath: file.absolutePath,
      planPath: document.status.planPath
        ? path.resolve(this.fileStore.workspaceRoot, document.status.planPath)
        : undefined,
    });

    if (request.dryRun) {
      await this.addEvent(run, "system", "Dry run completed. Codex was not executed.");
      run.finishedAt = new Date().toISOString();
      return this.snapshot(run);
    }

    run.status = "running";
    await this.addEvent(run, "system", "Starting Codex run.");
    this.spawnRun(run, {
      chatScope: "ticket",
      fileRelativePath: file.relativePath,
      planPath: document.status.planPath,
    });

    return this.snapshot(run);
  }

  getRun(runId: string): CodexRunSnapshot {
    return this.snapshot(this.requireRun(runId));
  }

  async getArchivedRun(runId: string): Promise<CodexRunSnapshot> {
    const memoryRun = this.runs.get(runId);
    if (memoryRun) {
      return this.snapshot(memoryRun);
    }

    if (!/^[A-Za-z0-9._-]+$/.test(runId)) {
      throw new CodexRunError(CODEX_RUN_ERROR.RUN_NOT_FOUND, "Codex run was not found.");
    }

    const logPath = path.join(this.config.workspaceRoot, ".alpha-kanban", "runs", `${runId}.jsonl`);
    const events = await readArchivedRunEvents(logPath);
    if (events.length === 0) {
      throw new CodexRunError(CODEX_RUN_ERROR.RUN_NOT_FOUND, "Codex run was not found.");
    }

    return buildArchivedRunSnapshot({
      defaultWorkspaceId: this.fileStore.workspaceId,
      events,
      logPath,
      runId,
    });
  }

  async getDocumentRunSummary(fileId: string): Promise<CodexDocumentRunSummaryResponse> {
    const documentRuns = [...this.runs.values()].filter((run) => run.fileId === fileId);
    const readAtByRunId = await this.stateStore.getRunReadAtMap(
      documentRuns.map((run) => run.id),
    );
    const runs = [...this.runs.values()]
      .filter((run) => run.fileId === fileId)
      .map((run) => this.runSummary(run, readAtByRunId.get(run.id)))
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    const activeRun = runs.find((run) => isActiveRunStatus(run.rawStatus));
    const latestRun = runs.at(-1);

    return {
      fileId,
      status: activeRun?.status ?? latestRun?.status ?? "idle",
      canStartRun: !activeRun,
      activeRun,
      latestRun,
      runs,
    };
  }

  async markRunRead(runId: string): Promise<CodexRunSummary> {
    const run = this.requireRun(runId);
    const readState = await this.stateStore.markRunRead(run.id);
    return this.runSummary(run, readState.readAt);
  }

  async getTicketChat(
    fileId: string,
    ticketId: string,
  ): Promise<CodexTicketChatResponse> {
    const { file, document } = await this.fileStore.readTicketDocument(fileId);
    const ticket = document.tickets.find((item) => item.id === ticketId);

    if (!ticket) {
      throw new CodexRunError(
        CODEX_RUN_ERROR.RUN_NOT_FOUND,
        `Ticket ${ticketId} was not found.`,
      );
    }

    return {
      messages: await this.chatStore.listTicketMessages(file.relativePath, ticketId),
    };
  }

  async deleteTicketChatMessage(
    fileId: string,
    ticketId: string,
    messageId: string,
  ): Promise<CodexTicketChatResponse> {
    const { file, document } = await this.fileStore.readTicketDocument(fileId);
    const ticket = document.tickets.find((item) => item.id === ticketId);

    if (!ticket) {
      throw new CodexRunError(
        CODEX_RUN_ERROR.RUN_NOT_FOUND,
        `Ticket ${ticketId} was not found.`,
      );
    }

    const messages = await this.chatStore.deleteTicketMessage(
      file.relativePath,
      ticketId,
      messageId,
    );

    if (!messages) {
      throw new CodexRunError(
        CODEX_RUN_ERROR.CHAT_MESSAGE_NOT_FOUND,
        "Ticket chat message was not found.",
      );
    }

    return { messages };
  }

  async getWorkspaceChat(): Promise<CodexWorkspaceChatResponse> {
    return {
      messages: await this.chatStore.listWorkspaceMessages(),
    };
  }

  async listModels(): Promise<CodexModelsResponse> {
    return listCodexModels(this.config.codexCommand);
  }

  async getRunDefaults(): Promise<CodexRunDefaultsResponse> {
    return {
      defaults: await this.stateStore.getCodexRunDefaults(),
    };
  }

  async setRunDefaults(defaults: {
    model?: string | null;
    reasoningEffort?: string | null;
    speedTier?: string | null;
  }): Promise<CodexRunDefaultsResponse> {
    return {
      defaults: await this.stateStore.setCodexRunDefaults(defaults),
    };
  }

  private async appendRunInstructionIfNeeded(
    request: Pick<
      CreateCodexRunRequest,
      "expectedHash" | "expectedMtimeMs" | "fileId" | "ticketId"
    >,
    instructionSummary: string,
  ): Promise<void> {
    const { document } = await this.fileStore.readTicketDocument(request.fileId);
    const ticket = document.tickets.find((item) => item.id === request.ticketId);
    const latestInstruction = ticket?.userInstructions.at(-1)?.text;

    if (latestInstruction === instructionSummary) {
      return;
    }

    await this.fileStore.appendInstruction(request.fileId, request.ticketId, {
      text: instructionSummary,
      expectedHash: request.expectedHash,
      expectedMtimeMs: request.expectedMtimeMs,
    });
  }

  async appendWorkspaceUserMessage(
    request: Pick<CodexWorkspacePromptPreviewRequest, "instruction" | "instructionDraft">,
  ): Promise<CodexWorkspaceChatResponse> {
    const instructionDraft = normalizeInstructionDraft(request);
    await this.chatStore.appendWorkspaceMessage({
      role: "user",
      contentFormat: "markdown",
      content: instructionDraft,
    });

    return this.getWorkspaceChat();
  }

  async previewWorkspacePrompt(
    request: CodexWorkspacePromptPreviewRequest,
  ): Promise<CodexWorkspacePromptPreviewResponse> {
    const instructionDraft = normalizeInstructionDraft(request);
    const instructionSummary = summarizeInstructionDraft(instructionDraft);
    const intent = normalizeWorkspaceChatIntent(request.intent);
    const mode = normalizeWorkspaceRunMode(request.mode, intent);
    const scopeResolution = this.resolveWorkspacePromptScope(instructionDraft);
    const skipGitRepoCheck = await shouldSkipGitRepoCheck(this.fileStore.workspaceRoot);
    const runDefaults = applyCodexRunDefaults(await this.stateStore.getCodexRunDefaults());
    const documentSets = await this.fileStore.listDocumentSets();
    if (request.currentFileId) {
      this.fileStore.resolveFileId(request.currentFileId);
    }
    const currentFile = request.currentFileId
      ? documentSets
          .flatMap((documentSet) => documentSet.documents)
          .find((document) => document.id === request.currentFileId)
      : undefined;
    const prompt = buildWorkspaceCodexPrompt({
      currentFile,
      documentSets,
      intent,
      instructionDraft,
      instructionSummary,
      mode,
      scopeResolution,
      workspaceRoot: this.fileStore.workspaceRoot,
    });
    const args = buildCodexArgs(prompt, undefined, {
      bypassSandbox: request.bypassSandbox,
      runDefaults,
      skipGitRepoCheck,
    });

    return {
      workspaceId: this.fileStore.workspaceId,
      workspaceRoot: this.fileStore.workspaceRoot,
      intent,
      mode,
      runDefaults,
      prompt,
      command: await resolveCodexCommand(this.config.codexCommand),
      args,
      currentFile,
      instructionDraft: instructionDraft || undefined,
      instructionSummary,
      scopeResolution,
      documentSets,
    };
  }

  async startWorkspaceRun(
    request: CreateWorkspaceCodexRunRequest,
  ): Promise<CodexRunSnapshot> {
    const instructionDraft = normalizeInstructionDraft(request);
    const instructionSummary = summarizeInstructionDraft(instructionDraft);
    const preview = await this.previewWorkspacePrompt(request);
    const runId = randomUUID();

    await this.chatStore.appendWorkspaceMessage({
      role: "user",
      contentFormat: "markdown",
      content: instructionDraft,
      runId,
      metadata: { intent: preview.intent },
    });

    const run: MutableRun = {
      id: runId,
      fileId: "workspace",
      ticketId: "workspace",
      mode: preview.mode,
      runDefaults: preview.runDefaults,
      status: request.dryRun ? "succeeded" : "queued",
      prompt: preview.prompt,
      command: preview.command,
      args: preview.args,
      dryRun: request.dryRun ?? false,
      instructionDraft: instructionDraft || undefined,
      instructionSummary,
      startedAt: new Date().toISOString(),
      logPath: path.join(this.config.workspaceRoot, ".alpha-kanban", "runs", `${runId}.jsonl`),
      scopeResolution: preview.scopeResolution,
      events: [],
      isFinishing: false,
      readOnlyGitStatusBefore:
        preview.mode === "read_only" && !request.dryRun
          ? await readGitStatus(this.fileStore.workspaceRoot)
          : undefined,
      subscribers: new Set(),
      stderrBuffer: "",
    };

    this.runs.set(runId, run);
    await fs.mkdir(path.dirname(run.logPath), { recursive: true });
    await this.addEvent(run, "prompt", preview.prompt, {
      command: preview.command,
      args: preview.args,
      bypassSandbox: Boolean(request.bypassSandbox),
      currentFile: preview.currentFile,
      documentSets: preview.documentSets.map((documentSet) => ({
        slug: documentSet.slug,
        documents: documentSet.documents.map((document) => document.workspaceRelativePath),
      })),
      instructionSummary,
      intent: preview.intent,
      mode: preview.mode,
      runDefaults: preview.runDefaults,
      scopeResolution: preview.scopeResolution,
      workspaceId: this.fileStore.workspaceId,
      workspaceRoot: this.fileStore.workspaceRoot,
    });

    if (request.dryRun) {
      await this.addEvent(run, "system", "Dry run completed. Codex was not executed.");
      run.finishedAt = new Date().toISOString();
      return this.snapshot(run);
    }

    run.status = "running";
    await this.addEvent(run, "system", "Starting workspace Codex run.");
    this.spawnRun(run, { chatScope: "workspace", workspaceIntent: preview.intent });

    return this.snapshot(run);
  }

  subscribe(runId: string, subscriber: RunSubscriber): () => void {
    const run = this.requireRun(runId);

    for (const event of run.events) {
      subscriber(event);
    }

    run.subscribers.add(subscriber);
    return () => run.subscribers.delete(subscriber);
  }

  async cancelRun(runId: string): Promise<CodexRunSnapshot> {
    const run = this.requireRun(runId);

    if (run.status !== "running" || !run.child) {
      throw new CodexRunError(CODEX_RUN_ERROR.NOT_RUNNING, "Codex run is not running.");
    }

    run.status = "cancelled";
    run.child.kill("SIGTERM");
    await this.addEvent(run, "system", "Cancel requested.");

    return this.snapshot(run);
  }

  private spawnRun(
    run: MutableRun,
    context: RunFinishContext,
  ): void {
    let child: ChildProcess;

    try {
      child = spawn(run.command, run.args, {
        cwd: this.fileStore.workspaceRoot,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      void this.finishRun(run, "failed", null, formatCodexCommandError(error), context);
      return;
    }

    run.child = child;
    let stdoutRemainder = "";
    let stderrRemainder = "";

    child.stdout?.on("data", (chunk: Buffer) => {
      const next = splitLines(stdoutRemainder + chunk.toString("utf8"));
      stdoutRemainder = next.remainder;
      for (const line of next.lines) {
        this.handleStdoutLine(run, line);
      }
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const next = splitLines(stderrRemainder + chunk.toString("utf8"));
      stderrRemainder = next.remainder;
      for (const line of next.lines) {
        run.stderrBuffer += `${line}\n`;
        void this.addEvent(run, "stderr", line);
      }
    });

    child.on("error", (error) => {
      void this.finishRun(run, "failed", null, error.message, context);
    });

    child.on("close", (code, signal) => {
      if (stdoutRemainder.trim()) {
        this.handleStdoutLine(run, stdoutRemainder.trim());
      }
      if (stderrRemainder.trim()) {
        run.stderrBuffer += `${stderrRemainder.trim()}\n`;
        void this.addEvent(run, "stderr", stderrRemainder.trim());
      }

      const status: CodexRunStatus =
        run.status === "cancelled" ? "cancelled" : code === 0 ? "succeeded" : "failed";
      const message =
        signal && status === "cancelled"
          ? `Codex run cancelled with signal ${signal}.`
          : status === "succeeded"
            ? "Codex run completed successfully."
            : classifyFailure(run.stderrBuffer);

      void this.finishRun(run, status, code, message, context);
    });
  }

  private handleStdoutLine(run: MutableRun, line: string): void {
    if (!line.trim()) {
      return;
    }

    try {
      const data = JSON.parse(line) as unknown;
      const sessionId = findSessionId(data);
      if (sessionId) {
        run.capturedSessionId = sessionId;
      }
      void this.addEvent(run, "json", summarizeJsonEvent(data), data);
    } catch {
      void this.addEvent(run, "stdout", line);
    }
  }

  private async finishRun(
    run: MutableRun,
    status: CodexRunStatus,
    exitCode: number | null,
    message: string,
    context: RunFinishContext,
  ): Promise<void> {
    if (run.finishedAt || run.isFinishing) {
      return;
    }

    run.isFinishing = true;
    await this.addEvent(run, "system", `Codex process finished with status ${status}.`, {
      exitCode,
      status,
    });

    if (run.capturedSessionId) {
      await this.appendPendingRunInstruction(run);
    }

    if (run.capturedSessionId && context.fileRelativePath) {
      await this.stateStore.setDocumentSession(context.fileRelativePath, run.capturedSessionId, {
        parentTicketId: run.ticketId,
        relatedDocuments: [context.fileRelativePath, context.planPath].filter(
          (item): item is string => Boolean(item),
        ),
      });
    }

    const assistantAnswer = findLatestAssistantAnswer(run.events);
    if (assistantAnswer) {
      try {
        if (context.chatScope === "workspace") {
          await this.chatStore.appendWorkspaceMessage({
            role: "assistant",
            contentFormat: "markdown",
            content: assistantAnswer,
            runId: run.id,
            metadata: context.workspaceIntent ? { intent: context.workspaceIntent } : undefined,
          });
        } else if (context.fileRelativePath) {
          await this.chatStore.appendTicketMessage({
            fileRelativePath: context.fileRelativePath,
            ticketId: run.ticketId,
            scope: run.scopeResolution.scope,
            role: "assistant",
            contentFormat: "markdown",
            content: assistantAnswer,
            runId: run.id,
          });
        }
      } catch (error) {
        await this.addEvent(
          run,
          "system",
          `Could not append Codex chat answer: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (run.mode === "read_only" && !run.dryRun) {
      await this.addReadOnlyDiffEvent(run);
    }

    if (
      context.chatScope === "ticket" &&
      run.mode === "edit" &&
      !run.dryRun &&
      shouldAppendRunOutcomeNote(status)
    ) {
      await this.appendRunResultNote(run, status, message);
    }

    run.status = status;
    run.exitCode = exitCode;
    run.finishedAt = new Date().toISOString();
    await this.addEvent(run, status === "failed" ? "error" : "exit", message, {
      exitCode,
      status,
    });
  }

  private async appendRunResultNote(
    run: MutableRun,
    status: CodexRunStatus,
    message: string,
  ): Promise<void> {
    const relativeLogPath = path.relative(this.config.workspaceRoot, run.logPath);

    try {
      await this.fileStore.appendProgressNote(run.fileId, run.ticketId, {
        text: `Codex run ${status}. ${message} Log: ${relativeLogPath}`,
      });
    } catch (error) {
      await this.addEvent(
        run,
        "system",
        `Could not append Codex result note: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async appendPendingRunInstruction(run: MutableRun): Promise<void> {
    const pending = run.pendingInstructionAppend;
    if (!pending) {
      return;
    }

    run.pendingInstructionAppend = undefined;

    try {
      await this.appendRunInstructionIfNeeded(
        {
          expectedHash: pending.expectedHash,
          expectedMtimeMs: pending.expectedMtimeMs,
          fileId: run.fileId,
          ticketId: run.ticketId,
        },
        pending.instructionSummary,
      );
      await this.addEvent(
        run,
        "system",
        "Appended Codex run instruction to ticket user instructions.",
      );
    } catch (error) {
      await this.addEvent(
        run,
        "system",
        `Could not append Codex run instruction: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async addReadOnlyDiffEvent(run: MutableRun): Promise<void> {
    if (run.readOnlyGitStatusBefore === undefined) {
      await this.addEvent(
        run,
        "system",
        "Read-only diff check skipped because Git status was unavailable before the run.",
      );
      return;
    }

    const after = await readGitStatus(this.fileStore.workspaceRoot);
    if (after === undefined) {
      await this.addEvent(
        run,
        "system",
        "Read-only diff check skipped because Git status was unavailable after the run.",
      );
      return;
    }

    if (after !== run.readOnlyGitStatusBefore) {
      await this.addEvent(run, "system", "Read-only diff check detected workspace changes.", {
        before: run.readOnlyGitStatusBefore,
        after,
      });
      return;
    }

    await this.addEvent(run, "system", "Read-only diff check passed with no Git status change.");
  }

  private async addEvent(
    run: MutableRun,
    type: CodexRunEvent["type"],
    message: string,
    data?: unknown,
  ): Promise<void> {
    const event: CodexRunEvent = {
      id: run.events.length,
      type,
      timestamp: new Date().toISOString(),
      message,
      data,
    };

    run.events.push(event);
    await fs.appendFile(run.logPath, `${JSON.stringify(event)}\n`, "utf8");
    for (const subscriber of run.subscribers) {
      subscriber(event);
    }
  }

  private requireRun(runId: string): MutableRun {
    const run = this.runs.get(runId);
    if (!run) {
      throw new CodexRunError(CODEX_RUN_ERROR.RUN_NOT_FOUND, "Codex run was not found.");
    }
    return run;
  }

  private findActiveRunForFile(fileId: string): MutableRun | undefined {
    return [...this.runs.values()].find(
      (run) => run.fileId === fileId && isActiveRunStatus(run.status),
    );
  }

  private runSummary(run: MutableRun, readAt?: string): CodexRunSummary {
    return {
      id: run.id,
      fileId: run.fileId,
      ticketId: run.ticketId,
      mode: run.mode,
      runDefaults: run.runDefaults,
      status: signalStatus(run),
      rawStatus: run.status,
      instructionSummary: run.instructionSummary,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      readAt,
      isUnread: isFinishedRunStatus(run.status) && !readAt,
      logPath: run.logPath,
      eventCount: run.events.length,
      latestEvent: run.events.at(-1),
    };
  }

  private snapshot(run: MutableRun): CodexRunSnapshot {
    const {
      child: _child,
      isFinishing: _isFinishing,
      pendingInstructionAppend: _pendingInstructionAppend,
      readOnlyGitStatusBefore: _readOnlyGitStatusBefore,
      subscribers: _subscribers,
      stderrBuffer: _stderrBuffer,
      ...snapshot
    } = run;
    return {
      ...snapshot,
      events: [...run.events],
    };
  }
}

export function buildCodexPrompt({
  instructionDraft,
  instructionSummary,
  mode,
  planPath,
  scopeResolution,
  ticketFilePath,
  ticketId,
  ticketRange,
  workspaceRoot,
}: {
  instructionDraft: string;
  instructionSummary?: string;
  mode: CodexRunMode;
  planPath?: string;
  scopeResolution: CodexChatScopeResolution;
  ticketFilePath: string;
  ticketId: string;
  ticketRange: { startLine: number; endLine: number };
  workspaceRoot: string;
}): string {
  const modeRules =
    mode === "read_only"
      ? [
          "작업 모드: Read-only answer",
          "",
          "read-only mode 규칙:",
          "- 파일 생성/수정/삭제를 하지 마. apply_patch, formatter, package install, git write command 등 write side effect를 실행하지 마.",
          "- ticket Markdown의 `사용자 지시`와 `진행 메모`를 append하지 마. status/progress도 변경하지 마.",
          "- 필요한 조사는 rg/sed/git status 같은 read-only command로 제한하고, 구현이 필요하면 제안과 검증 계획을 최종 답변에 적어.",
          "- 서버는 이 실행의 user message와 assistant answer만 ticket chat log에 저장한다.",
        ]
      : [
          "작업 모드: Edit files",
          "",
          "작업 규칙:",
          "- 문서 전체를 prompt 기억에 의존하지 말고, 필요할 때 rg/sed로 ticket range와 관련 plan section을 직접 읽어.",
          "- Run 시작 시 서버가 이번 실행 지시 요약을 ticket의 `사용자 지시`에 append한다. Codex는 같은 사용자 지시를 중복 append하지 마.",
          "- agent 작업 기록과 검증 결과는 `진행 메모`에 append해.",
          "- 상태/progress 변경 시 개별 ticket body와 top-level 현재 진행률을 함께 갱신해. DONE으로 바꿀 때는 `Completed at: YYYY-MM-DDTHH:mm:ss+09:00`을 `Progress` 바로 아래에 추가하고, non-DONE으로 되돌릴 때는 제거해.",
          "- 관련 없는 사용자 변경은 되돌리지 마.",
        ];
  const scopeWarnings = codexChatScopeRunWarnings(scopeResolution, mode);
  const scopeLines = [
    "Resolved scope:",
    `- Scope: ${scopeResolution.scope}`,
    `- Target workspace id: ${scopeResolution.targetWorkspaceId}`,
    scopeResolution.targetFileId
      ? `- Target file id: ${scopeResolution.targetFileId}`
      : "- Target file id: not selected",
    scopeResolution.targetTicketId
      ? `- Target ticket id: ${scopeResolution.targetTicketId}`
      : "- Target ticket id: not selected",
    `- Cleaned message: ${
      scopeResolution.cleanedMessage || "(UI에서 별도 실행 지시가 입력되지 않았음)"
    }`,
    scopeResolution.mentions.length
      ? `- Parsed mentions: ${scopeResolution.mentions
          .map((mention) => mention.token)
          .join(", ")}`
      : "- Parsed mentions: none",
    scopeWarnings.length
      ? `- Scope warnings: ${scopeWarnings.join(" / ")}`
      : "- Scope warnings: none",
    "- Raw mention syntax is already normalized by Alpha Kanban; do not reinterpret @scope tokens as separate user instructions.",
    "- Write target remains the selected ticket unless the mode is read-only.",
  ];

  return [
    `${workspaceRoot} 프로젝트에서 $implementation-ledger 기반 작업을 이어가.`,
    "",
    `Ticket file: ${ticketFilePath}`,
    planPath ? `Plan file: ${planPath}` : "Plan file: not declared in ticket document",
    `Selected ticket: ${ticketId}`,
    `Ticket range hint: lines ${ticketRange.startLine}-${ticketRange.endLine}`,
    "",
    ...scopeLines,
    "",
    ...modeRules,
    "",
    "이번 실행 지시 요약:",
    instructionSummary ?? "(UI에서 별도 실행 지시가 입력되지 않았음)",
    "",
    "이번 실행 지시 원문 draft:",
    instructionDraft || "(UI에서 별도 실행 지시가 입력되지 않았음)",
  ].join("\n");
}

export function buildWorkspaceCodexPrompt({
  currentFile,
  documentSets,
  intent,
  instructionDraft,
  instructionSummary,
  mode,
  scopeResolution,
  workspaceRoot,
}: {
  currentFile?: MarkdownFileSummary;
  documentSets: DocumentSetSummary[];
  intent: CodexWorkspaceChatIntent;
  instructionDraft: string;
  instructionSummary?: string;
  mode: CodexRunMode;
  scopeResolution: CodexChatScopeResolution;
  workspaceRoot: string;
}): string {
  const documentLines = documentSets.length
    ? documentSets.flatMap((documentSet) => [
        `- ${documentSet.slug} (#${documentSet.sequenceNumber ?? "n/a"})`,
        ...documentSet.documents.map(
          (document) =>
            `  - [${document.type}] ${document.workspaceRelativePath}`,
        ),
      ])
    : ["- No implementation-ledger documents were discovered under the selected workspace docs roots."];
  const modeRules =
    intent === "spec_grilling"
      ? [
          "작업 모드: Spec grilling read-only workspace chat",
          "",
          "spec grilling 규칙:",
          "- 파일 생성/수정/삭제를 하지 마.",
          "- ticket Markdown의 `사용자 지시`, `진행 메모`, status/progress를 변경하지 마.",
          "- 요구사항을 바로 구현하거나 plan/ticket 문서를 생성하지 말고, 필요한 질문과 결정사항을 먼저 좁혀.",
          "- 답변은 Markdown으로 작성하고 아래 섹션을 포함해:",
          "  - Clarifying questions",
          "  - Working assumptions",
          "  - Decisions so far",
          "  - Tentative scope",
          "  - Open questions",
          "  - Implementation-ledger handoff readiness",
          "- 충분히 정리되었다고 판단되면 어떤 plan/ticket handoff가 필요한지만 제안하고, 직접 파일을 수정하지 마.",
        ]
      : intent === "plan_ticketing_handoff"
        ? [
            "작업 모드: Implementation-ledger handoff",
            "",
            "implementation-ledger handoff 규칙:",
            "- 이 실행은 사용자가 workspace chat에서 명시적으로 선택한 plan/ticket 생성 또는 갱신 handoff다.",
            "- $implementation-ledger 스킬을 사용해 새 plan/ticket/inventory 문서를 만들거나 기존 문서에 티켓을 추가해.",
            "- 문서 전체를 prompt 기억에 의존하지 말고, 필요할 때 rg/sed로 관련 plan/ticket/inventory 문서를 직접 읽어.",
            "- Alpha Kanban이 아래에 넣은 Resolved scope block을 신뢰하고, raw `@w`/`@t:` mention을 다시 독자적으로 해석하지 마.",
            "- 새 문서나 티켓을 만들었다면 최종 답변에 workspace-relative file path와 생성/갱신한 ticket id를 요약해.",
            "- 관련 없는 사용자 변경은 되돌리지 마.",
          ]
        : mode === "read_only"
      ? [
          "작업 모드: Read-only workspace chat",
          "",
          "read-only workspace chat 규칙:",
          "- 파일 생성/수정/삭제를 하지 마.",
          "- ticket Markdown의 `사용자 지시`, `진행 메모`, status/progress를 변경하지 마.",
          "- 필요한 조사는 rg/sed/git status 같은 read-only command로 제한하고, 답변은 workspace 전체 관점으로 정리해.",
        ]
      : [
          "작업 모드: Edit-capable workspace prompt",
          "",
          "edit-capable workspace prompt 규칙:",
          "- 이 프롬프트는 workspace-level chat에서 생성되었다. 특정 ticket drawer에서 시작된 실행이 아니다.",
          "- 사용자가 plan/ticket/inventory 생성을 요청하면 $implementation-ledger 스킬 규칙을 따르고, 관련 문서는 필요할 때 rg/sed로 직접 읽어.",
          "- 새 문서 생성/수정은 workspace chat의 preview/confirm boundary를 통과한 명시 실행으로만 진행한다.",
          "- 파일을 수정한다면 관련 없는 사용자 변경은 되돌리지 마.",
        ];
  const scopeWarnings = codexChatScopeRunWarnings(scopeResolution, mode);
  const scopeLines = [
    "Resolved scope:",
    `- Scope: ${scopeResolution.scope}`,
    `- Target workspace id: ${scopeResolution.targetWorkspaceId}`,
    `- Cleaned message: ${
      scopeResolution.cleanedMessage || "(UI에서 별도 실행 지시가 입력되지 않았음)"
    }`,
    scopeResolution.mentions.length
      ? `- Parsed mentions: ${scopeResolution.mentions
          .map((mention) => mention.token)
          .join(", ")}`
      : "- Parsed mentions: none",
    scopeWarnings.length
      ? `- Scope warnings: ${scopeWarnings.join(" / ")}`
      : "- Scope warnings: none",
    "- Raw mention syntax is already normalized by Alpha Kanban; do not reinterpret @scope tokens as separate user instructions.",
  ];

  return [
    `${workspaceRoot} 프로젝트에서 workspace-level implementation ledger 논의를 이어가.`,
    "",
    `Workspace root: ${workspaceRoot}`,
    `Workspace chat intent: ${intent}`,
    "",
    "Workspace documents:",
    ...documentLines,
    "",
    currentFile
      ? `Recent selected document: [${currentFile.type}] ${currentFile.workspaceRelativePath}`
      : "Recent selected document: not selected",
    "",
    ...scopeLines,
    "",
    ...modeRules,
    "",
    "이번 workspace chat 지시 요약:",
    instructionSummary ?? "(UI에서 별도 workspace 지시가 입력되지 않았음)",
    "",
    "이번 workspace chat 지시 원문 draft:",
    instructionDraft || "(UI에서 별도 workspace 지시가 입력되지 않았음)",
  ].join("\n");
}

type InstructionDraftSource = {
  instruction?: string;
  instructionDraft?: string;
};

function normalizeInstructionDraft(
  request: InstructionDraftSource,
): string {
  return (request.instructionDraft ?? request.instruction ?? "").trim();
}

function normalizeRunMode(mode: CodexRunMode | undefined): CodexRunMode {
  return mode ?? "edit";
}

function normalizeWorkspaceChatIntent(
  intent: CodexWorkspaceChatIntent | undefined,
): CodexWorkspaceChatIntent {
  return intent ?? "general";
}

function normalizeWorkspaceRunMode(
  mode: CodexRunMode | undefined,
  intent: CodexWorkspaceChatIntent,
): CodexRunMode {
  if (intent === "spec_grilling") {
    return "read_only";
  }
  if (intent === "plan_ticketing_handoff") {
    return "edit";
  }
  return mode ?? "read_only";
}

function summarizeInstructionDraft(instructionDraft: string): string | undefined {
  const normalized = instructionDraft.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return undefined;
  }

  const summary =
    normalized.length > 240 ? `${normalized.slice(0, 237).trimEnd()}...` : normalized;
  return `Codex 실행 지시: ${summary}`;
}

function buildCodexArgs(
  prompt: string,
  sessionId?: string,
  options: {
    bypassSandbox?: boolean;
    runDefaults?: CodexAppliedRunDefaults;
    skipGitRepoCheck?: boolean;
  } = {},
): string[] {
  const defaultArgs = buildCodexRunDefaultArgs(options.runDefaults);
  const safetyArgs = [
    ...(options.skipGitRepoCheck ? ["--skip-git-repo-check"] : []),
    ...(options.bypassSandbox ? ["--dangerously-bypass-approvals-and-sandbox"] : []),
  ];
  if (sessionId) {
    return ["exec", "resume", ...defaultArgs, ...safetyArgs, "--json", sessionId, prompt];
  }
  return ["exec", ...defaultArgs, ...safetyArgs, "--json", prompt];
}

function applyCodexRunDefaults(defaults: CodexRunDefaults): CodexAppliedRunDefaults {
  return {
    model: defaults.model,
    reasoningEffort: defaults.reasoningEffort,
    speedTier: defaults.speedTier,
    speedTierApplied: Boolean(defaults.speedTier),
    speedTierConfigKey: defaults.speedTier ? "service_tier" : undefined,
  };
}

function buildCodexRunDefaultArgs(defaults?: CodexAppliedRunDefaults): string[] {
  const args: string[] = [];

  if (defaults?.model) {
    args.push("-m", defaults.model);
  }
  if (defaults?.reasoningEffort) {
    args.push("-c", `model_reasoning_effort="${defaults.reasoningEffort}"`);
  }
  if (defaults?.speedTier) {
    if (defaults.speedTier === "fast") {
      args.push("-c", "features.fast_mode=true");
    }
    args.push("-c", `service_tier="${defaults.speedTier}"`);
  }

  return args;
}

async function readGitStatus(workspaceRoot: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", workspaceRoot, "status", "--short", "--untracked-files=all"],
      { encoding: "utf8", maxBuffer: 1024 * 1024 },
    );
    return String(stdout).trimEnd();
  } catch {
    return undefined;
  }
}

async function shouldSkipGitRepoCheck(workspaceRoot: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", workspaceRoot, "rev-parse", "--is-inside-work-tree"],
      { encoding: "utf8", maxBuffer: 1024 * 1024 },
    );
    return String(stdout).trim() !== "true";
  } catch {
    return true;
  }
}

function splitLines(value: string): { lines: string[]; remainder: string } {
  const parts = value.split(/\r?\n/);
  return {
    lines: parts.slice(0, -1),
    remainder: parts.at(-1) ?? "",
  };
}

function classifyFailure(stderr: string): string {
  if (/not\s+logged\s+in|auth|authentication|api key|sign in/i.test(stderr)) {
    return "Codex authentication appears to be required.";
  }
  if (/ENOENT|not found|no such file/i.test(stderr)) {
    return "Codex CLI could not be started or found.";
  }
  return "Codex run failed.";
}

function shouldAppendRunOutcomeNote(status: CodexRunStatus): boolean {
  return status !== "succeeded";
}

function isActiveRunStatus(status: CodexRunStatus): boolean {
  return status === "queued" || status === "running";
}

function isFinishedRunStatus(status: CodexRunStatus): boolean {
  return !isActiveRunStatus(status);
}

function signalStatus(run: MutableRun): CodexRunSignalStatus {
  if (run.status === "running" && !run.child) {
    return "unknown";
  }

  if (
    run.status === "failed" &&
    hasAuthSignal(`${run.stderrBuffer}\n${run.events.map((event) => event.message).join("\n")}`)
  ) {
    return "needs_auth";
  }

  return run.status;
}

async function readArchivedRunEvents(logPath: string): Promise<CodexRunEvent[]> {
  let raw: string;
  try {
    raw = await fs.readFile(logPath, "utf8");
  } catch (error) {
    const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
    if (code === "ENOENT") {
      throw new CodexRunError(CODEX_RUN_ERROR.RUN_NOT_FOUND, "Codex run was not found.");
    }
    throw error;
  }

  return raw
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .flatMap((line): CodexRunEvent[] => {
      try {
        return [JSON.parse(line) as CodexRunEvent];
      } catch {
        return [];
      }
    })
    .filter(isCodexRunEventLike);
}

function isCodexRunEventLike(value: CodexRunEvent): value is CodexRunEvent {
  return (
    typeof value.id === "number" &&
    typeof value.timestamp === "string" &&
    typeof value.message === "string" &&
    (value.type === "prompt" ||
      value.type === "system" ||
      value.type === "stdout" ||
      value.type === "stderr" ||
      value.type === "json" ||
      value.type === "exit" ||
      value.type === "error")
  );
}

function buildArchivedRunSnapshot({
  defaultWorkspaceId,
  events,
  logPath,
  runId,
}: {
  defaultWorkspaceId: string;
  events: CodexRunEvent[];
  logPath: string;
  runId: string;
}): CodexRunSnapshot {
  const promptEvent = events.find((event) => event.type === "prompt");
  const promptData = asRecord(promptEvent?.data);
  const terminalEvent = [...events].reverse().find(
    (event) => event.type === "exit" || event.type === "error",
  );
  const terminalData = asRecord(terminalEvent?.data);
  const status = normalizeRunStatus(getStringValue(terminalData, "status"), terminalEvent?.type);
  const scopeResolution = normalizeScopeResolution(
    asRecord(promptData?.scopeResolution),
    defaultWorkspaceId,
  );
  const runDefaults = normalizeRunDefaults(asRecord(promptData?.runDefaults));
  const mode = normalizeArchivedRunMode(getStringValue(promptData, "mode"));
  const startedAt = promptEvent?.timestamp ?? events[0]?.timestamp ?? new Date(0).toISOString();
  const finishedAt =
    terminalEvent?.timestamp ??
    [...events].reverse().find((event) => event.type === "system" && /finished/i.test(event.message))
      ?.timestamp;

  return {
    id: runId,
    fileId: scopeResolution.targetFileId ?? "workspace",
    ticketId: scopeResolution.targetTicketId ?? "workspace",
    mode,
    runDefaults,
    status,
    prompt: promptEvent?.message ?? "Archived Codex run",
    command: getStringValue(promptData, "command") ?? "codex",
    args: getStringArrayValue(promptData, "args"),
    dryRun: events.some((event) => /Dry run completed/i.test(event.message)),
    instructionSummary: getStringValue(promptData, "instructionSummary"),
    retryOfRunId: getStringValue(promptData, "retryOfRunId"),
    sourceMessageId: getStringValue(promptData, "sourceMessageId"),
    startedAt,
    finishedAt,
    exitCode: getNumberValue(terminalData, "exitCode") ?? null,
    logPath,
    resumeSessionId: getStringValue(promptData, "resumeSessionId"),
    capturedSessionId: findCapturedSessionId(events),
    scopeResolution,
    events,
  };
}

function normalizeRunStatus(
  value: string | undefined,
  terminalType: CodexRunEvent["type"] | undefined,
): CodexRunStatus {
  if (
    value === "queued" ||
    value === "running" ||
    value === "succeeded" ||
    value === "failed" ||
    value === "cancelled"
  ) {
    return value;
  }
  return terminalType === "error" ? "failed" : "succeeded";
}

function normalizeArchivedRunMode(value: string | undefined): CodexRunMode {
  return value === "edit" || value === "read_only" ? value : "read_only";
}

function normalizeRunDefaults(value: Record<string, unknown> | undefined): CodexAppliedRunDefaults {
  return {
    model: getStringValue(value, "model"),
    reasoningEffort: getStringValue(value, "reasoningEffort"),
    speedTier: getStringValue(value, "speedTier"),
    speedTierApplied: getBooleanValue(value, "speedTierApplied") ?? false,
    speedTierConfigKey: getStringValue(value, "speedTierConfigKey"),
  };
}

function normalizeScopeResolution(
  value: Record<string, unknown> | undefined,
  defaultWorkspaceId: string,
): CodexChatScopeResolution {
  const scope = getStringValue(value, "scope");
  const normalizedScope =
    scope === "ticket" || scope === "document" || scope === "workspace" ? scope : "workspace";
  const mentions = Array.isArray(value?.mentions)
    ? value.mentions.flatMap((mention) => {
        const record = asRecord(mention);
        const kind = getStringValue(record, "kind");
        const token = getStringValue(record, "token");
        if (!token || (kind !== "ticket" && kind !== "document" && kind !== "workspace")) {
          return [];
        }
        const mentionKind: "ticket" | "document" | "workspace" = kind;
        return [
          {
            kind: mentionKind,
            targetTicketId: getStringValue(record, "targetTicketId"),
            token,
          },
        ];
      })
    : [];

  return {
    scope: normalizedScope,
    targetWorkspaceId: getStringValue(value, "targetWorkspaceId") ?? defaultWorkspaceId,
    targetFileId: getStringValue(value, "targetFileId"),
    targetTicketId: getStringValue(value, "targetTicketId"),
    rawMessage: getStringValue(value, "rawMessage") ?? "",
    cleanedMessage: getStringValue(value, "cleanedMessage") ?? "",
    mentions,
    warnings: getStringArrayValue(value, "warnings"),
  };
}

function findCapturedSessionId(events: CodexRunEvent[]): string | undefined {
  for (const event of events) {
    const sessionId = findSessionId(event.data);
    if (sessionId) {
      return sessionId;
    }
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function getStringValue(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" ? value : undefined;
}

function getNumberValue(record: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = record?.[key];
  return typeof value === "number" ? value : undefined;
}

function getBooleanValue(record: Record<string, unknown> | undefined, key: string): boolean | undefined {
  const value = record?.[key];
  return typeof value === "boolean" ? value : undefined;
}

function getStringArrayValue(
  record: Record<string, unknown> | undefined,
  key: string,
): string[] {
  const value = record?.[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function hasAuthSignal(value: string): boolean {
  return /not\s+logged\s+in|auth|authentication|api key|sign in/i.test(value);
}

function summarizeJsonEvent(data: unknown): string {
  if (typeof data !== "object" || data === null) {
    return String(data);
  }

  const record = data as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : "json";
  const message = findString(record, ["message", "text", "content", "summary"]);
  return message ? `${type}: ${message}` : type;
}

function findLatestAssistantAnswer(events: CodexRunEvent[]): string | undefined {
  for (const event of [...events].reverse()) {
    if (event.type !== "json") {
      continue;
    }

    const answer = extractAssistantAnswer(event.data);
    if (answer) {
      return answer;
    }
  }
  return undefined;
}

function extractAssistantAnswer(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const itemAnswer = extractAssistantAnswer(record.item);
  if (itemAnswer) {
    return itemAnswer;
  }

  if (record.type === "agent_message") {
    return findString(record, ["text", "message", "content"]);
  }

  if (record.type === "message") {
    return findString(record, ["message", "text", "content"]);
  }

  return undefined;
}

function findSessionId(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const direct = findString(record, ["thread_id", "threadId", "session_id", "sessionId"]);
  if (direct) {
    return direct;
  }

  for (const item of Object.values(record)) {
    const nested = findSessionId(item);
    if (nested) {
      return nested;
    }
  }

  return undefined;
}

function findString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return undefined;
}
