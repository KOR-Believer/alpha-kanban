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
  CreateCodexRunRequest,
} from "@alpha-kanban/shared";
import {
  codexChatScopeRunWarnings,
  isCodexChatScopeRunAllowed,
  resolveCodexChatScope,
} from "@alpha-kanban/shared";

import { CodexChatStore } from "./codexChat";
import type { ServerConfig } from "./config";
import { CodexStateStore } from "./codexState";
import type { MarkdownFileStore } from "./files";

export const CODEX_RUN_ERROR = {
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

type MutableRun = Omit<CodexRunSnapshot, "events"> & {
  child?: ChildProcess;
  events: CodexRunEvent[];
  isFinishing: boolean;
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
    const args = buildCodexArgs(prompt, documentState?.codexSessionId);

    return {
      fileId: request.fileId,
      ticketId: request.ticketId,
      mode,
      prompt,
      command: this.config.codexCommand,
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

    const instructionDraft = normalizeInstructionDraft(request);
    const instructionSummary = summarizeInstructionDraft(instructionDraft);
    const mode = normalizeRunMode(request.mode);
    const scopeResolution = this.resolvePromptScope(request, instructionDraft);
    const runId = randomUUID();

    if (!isCodexChatScopeRunAllowed(scopeResolution, mode)) {
      throw new CodexRunError(
        CODEX_RUN_ERROR.SCOPE_NOT_ALLOWED,
        codexChatScopeRunWarnings(scopeResolution, mode).at(-1) ??
          "Selected scope cannot be used for this Codex run.",
      );
    }

    if (mode === "edit" && instructionSummary && !request.dryRun) {
      await this.fileStore.appendInstruction(request.fileId, request.ticketId, {
        text: instructionSummary,
        expectedHash: request.expectedHash,
        expectedMtimeMs: request.expectedMtimeMs,
      });
    }

    const preview = await this.previewPrompt(request);
    const { file, document } = await this.fileStore.readTicketDocument(request.fileId);
    await this.chatStore.appendTicketMessage({
      fileRelativePath: file.relativePath,
      ticketId: request.ticketId,
      scope: preview.scopeResolution.scope,
      role: "user",
      contentFormat: "markdown",
      content: instructionDraft,
      runId,
    });
    const run: MutableRun = {
      id: runId,
      fileId: request.fileId,
      ticketId: request.ticketId,
      mode,
      status: request.dryRun ? "succeeded" : "queued",
      prompt: preview.prompt,
      command: preview.command,
      args: preview.args,
      dryRun: request.dryRun ?? false,
      instructionDraft: instructionDraft || undefined,
      instructionSummary,
      startedAt: new Date().toISOString(),
      logPath: path.join(this.config.workspaceRoot, ".alpha-kanban", "runs", `${runId}.jsonl`),
      resumeSessionId: preview.resumeSessionId,
      scopeResolution: preview.scopeResolution,
      events: [],
      isFinishing: false,
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
      instructionSummary,
      mode,
      scopeResolution: preview.scopeResolution,
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
      fileRelativePath: file.relativePath,
      planPath: document.status.planPath,
    });

    return this.snapshot(run);
  }

  getRun(runId: string): CodexRunSnapshot {
    return this.snapshot(this.requireRun(runId));
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
    context: {
      fileRelativePath: string;
      planPath?: string;
    },
  ): void {
    let child: ChildProcess;

    try {
      child = spawn(run.command, run.args, {
        cwd: this.fileStore.workspaceRoot,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      void this.finishRun(run, "failed", null, error instanceof Error ? error.message : String(error), context);
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
    context: {
      fileRelativePath: string;
      planPath?: string;
    },
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
        await this.chatStore.appendTicketMessage({
          fileRelativePath: context.fileRelativePath,
          ticketId: run.ticketId,
          scope: run.scopeResolution.scope,
          role: "assistant",
          contentFormat: "markdown",
          content: assistantAnswer,
          runId: run.id,
        });
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

    if (run.mode === "edit" && !run.dryRun && shouldAppendRunOutcomeNote(status)) {
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
    `${workspaceRoot} 프로젝트에서 plan-ticketing 문서 기반 작업을 이어가.`,
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

function normalizeInstructionDraft(
  request: Pick<CodexPromptPreviewRequest, "instruction" | "instructionDraft">,
): string {
  return (request.instructionDraft ?? request.instruction ?? "").trim();
}

function normalizeRunMode(mode: CodexRunMode | undefined): CodexRunMode {
  return mode ?? "edit";
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

function buildCodexArgs(prompt: string, sessionId?: string): string[] {
  if (sessionId) {
    return ["exec", "resume", "--json", sessionId, prompt];
  }
  return ["exec", "--json", prompt];
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
