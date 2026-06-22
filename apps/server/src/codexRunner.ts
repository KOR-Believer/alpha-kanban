import { spawn, type ChildProcess } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type {
  CodexDocumentRunSummaryResponse,
  CodexPromptPreviewRequest,
  CodexPromptPreviewResponse,
  CodexRunEvent,
  CodexRunSignalStatus,
  CodexRunSnapshot,
  CodexRunSummary,
  CodexRunStatus,
  CreateCodexRunRequest,
} from "@alpha-kanban/shared";

import type { ServerConfig } from "./config";
import { CodexStateStore } from "./codexState";
import type { MarkdownFileStore } from "./files";

export const CODEX_RUN_ERROR = {
  DOCUMENT_RUN_ACTIVE: "CODEX_DOCUMENT_RUN_ACTIVE",
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
  subscribers: Set<RunSubscriber>;
  stderrBuffer: string;
};

export class CodexRunner {
  private readonly runs = new Map<string, MutableRun>();
  private readonly stateStore: CodexStateStore;

  constructor(
    private readonly config: ServerConfig,
    private readonly fileStore: MarkdownFileStore,
  ) {
    this.stateStore = new CodexStateStore(config);
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
    const planPath = document.status.planPath
      ? path.resolve(this.config.workspaceRoot, document.status.planPath)
      : undefined;
    const relatedDocuments = [file.absolutePath, planPath].filter(
      (item): item is string => Boolean(item),
    );
    const instructionDraft = normalizeInstructionDraft(request);
    const instructionSummary = summarizeInstructionDraft(instructionDraft);
    const prompt = buildPrompt({
      instructionDraft,
      instructionSummary,
      planPath,
      ticketFilePath: file.absolutePath,
      ticketId: ticket.id,
      ticketRange: ticket.range,
      workspaceRoot: this.config.workspaceRoot,
    });
    const args = buildCodexArgs(prompt, documentState?.codexSessionId);

    return {
      fileId: request.fileId,
      ticketId: request.ticketId,
      prompt,
      command: this.config.codexCommand,
      args,
      instructionDraft: instructionDraft || undefined,
      instructionSummary,
      resumeSessionId: documentState?.codexSessionId,
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

    if (instructionSummary && !request.dryRun) {
      await this.fileStore.appendInstruction(request.fileId, request.ticketId, {
        text: instructionSummary,
        expectedHash: request.expectedHash,
        expectedMtimeMs: request.expectedMtimeMs,
      });
    }

    const preview = await this.previewPrompt(request);
    const { file, document } = await this.fileStore.readTicketDocument(request.fileId);
    const runId = randomUUID();
    const run: MutableRun = {
      id: runId,
      fileId: request.fileId,
      ticketId: request.ticketId,
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
      events: [],
      isFinishing: false,
      subscribers: new Set(),
      stderrBuffer: "",
    };

    this.runs.set(runId, run);
    await fs.mkdir(path.dirname(run.logPath), { recursive: true });
    await this.addEvent(run, "prompt", preview.prompt, {
      command: preview.command,
      args: preview.args,
      instructionSummary,
      statePath: preview.statePath,
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
        cwd: this.config.workspaceRoot,
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
    await this.addEvent(run, status === "failed" ? "error" : "exit", message, { exitCode });

    if (run.capturedSessionId) {
      await this.stateStore.setDocumentSession(context.fileRelativePath, run.capturedSessionId, {
        parentTicketId: run.ticketId,
        relatedDocuments: [context.fileRelativePath, context.planPath].filter(
          (item): item is string => Boolean(item),
        ),
      });
    }

    if (!run.dryRun) {
      await this.appendRunResultNote(run, status, message);
    }

    run.status = status;
    run.exitCode = exitCode;
    run.finishedAt = new Date().toISOString();
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
        "error",
        `Could not append Codex result note: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
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

function buildPrompt({
  instructionDraft,
  instructionSummary,
  planPath,
  ticketFilePath,
  ticketId,
  ticketRange,
  workspaceRoot,
}: {
  instructionDraft: string;
  instructionSummary?: string;
  planPath?: string;
  ticketFilePath: string;
  ticketId: string;
  ticketRange: { startLine: number; endLine: number };
  workspaceRoot: string;
}): string {
  return [
    `${workspaceRoot} 프로젝트에서 plan-ticketing 문서 기반 작업을 이어가.`,
    "",
    `Ticket file: ${ticketFilePath}`,
    planPath ? `Plan file: ${planPath}` : "Plan file: not declared in ticket document",
    `Selected ticket: ${ticketId}`,
    `Ticket range hint: lines ${ticketRange.startLine}-${ticketRange.endLine}`,
    "",
    "작업 규칙:",
    "- 문서 전체를 prompt 기억에 의존하지 말고, 필요할 때 rg/sed로 ticket range와 관련 plan section을 직접 읽어.",
    "- Run 시작 시 서버가 이번 실행 지시 요약을 ticket의 `사용자 지시`에 append한다. Codex는 같은 사용자 지시를 중복 append하지 마.",
    "- agent 작업 기록과 검증 결과는 `진행 메모`에 append해.",
    "- 상태/progress 변경 시 개별 ticket body, Progress Board, top-level 현재 진행률을 함께 갱신해.",
    "- 관련 없는 사용자 변경은 되돌리지 마.",
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
