import { promises as fs } from "node:fs";
import path from "node:path";

import {
  alphaKanbanStateSchema,
  type AlphaKanbanState,
  type CodexDocumentState,
  type CodexRunDefaults,
  type CodexRunReadState,
  type RecentWorkspace,
} from "@alpha-kanban/shared";

import type { ServerConfig } from "./config";

const EMPTY_STATE: AlphaKanbanState = {
  version: 2,
  recentWorkspaces: [],
  documents: {},
  runResults: {},
  codexRunDefaults: {},
};

export class CodexStateStore {
  readonly statePath: string;
  private readonly workspaceId: string;

  constructor(
    config: ServerConfig,
    options: {
      workspaceId?: string;
    } = {},
  ) {
    this.statePath = path.join(config.workspaceRoot, ".alpha-kanban", "state.json");
    this.workspaceId = options.workspaceId ?? config.workspaceId;
  }

  async getDocumentState(relativePath: string): Promise<CodexDocumentState | undefined> {
    const state = await this.readState();
    return (
      state.documents[this.documentKey(relativePath)] ??
      state.documents[normalizeDocumentPath(relativePath)]
    );
  }

  async setDocumentSession(
    relativePath: string,
    sessionId: string,
    options: {
      parentTicketId?: string;
      relatedDocuments?: string[];
    } = {},
  ): Promise<CodexDocumentState> {
    const state = await this.readState();
    const key = this.documentKey(relativePath);
    const current = state.documents[key] ?? state.documents[normalizeDocumentPath(relativePath)];
    const next: CodexDocumentState = {
      codexSessionId: sessionId,
      relatedDocuments: options.relatedDocuments ?? current?.relatedDocuments ?? [],
      parentTicketId: options.parentTicketId ?? current?.parentTicketId,
      lastTicketId: options.parentTicketId ?? current?.lastTicketId,
      updatedAt: new Date().toISOString(),
    };

    state.documents[key] = next;
    await this.writeState(state);

    return next;
  }

  async getRecentWorkspaces(): Promise<RecentWorkspace[]> {
    const state = await this.readState();
    return state.recentWorkspaces;
  }

  async getLastWorkspaceId(): Promise<string | undefined> {
    const state = await this.readState();
    return state.lastWorkspaceId;
  }

  async recordRecentWorkspace(
    workspace: Omit<RecentWorkspace, "lastOpenedAt"> & { lastOpenedAt?: string },
  ): Promise<RecentWorkspace> {
    const state = await this.readState();
    const now = new Date().toISOString();
    const next: RecentWorkspace = {
      ...workspace,
      lastOpenedAt: workspace.lastOpenedAt ?? now,
    };

    state.recentWorkspaces = [
      next,
      ...state.recentWorkspaces.filter((item) => item.id !== next.id),
    ].slice(0, 20);
    state.lastWorkspaceId = next.id;
    await this.writeState(state);

    return next;
  }

  async getRunReadAt(runId: string): Promise<string | undefined> {
    const state = await this.readState();
    return state.runResults[runId]?.readAt;
  }

  async getRunReadAtMap(runIds: string[]): Promise<Map<string, string>> {
    const state = await this.readState();
    const result = new Map<string, string>();

    for (const runId of runIds) {
      const readAt = state.runResults[runId]?.readAt;
      if (readAt) {
        result.set(runId, readAt);
      }
    }

    return result;
  }

  async markRunRead(runId: string): Promise<CodexRunReadState> {
    const state = await this.readState();
    const now = new Date().toISOString();
    const current = state.runResults[runId];
    const next: CodexRunReadState = {
      readAt: current?.readAt ?? now,
      updatedAt: now,
    };

    state.runResults[runId] = next;
    await this.writeState(state);

    return next;
  }

  async getCodexRunDefaults(): Promise<CodexRunDefaults> {
    const state = await this.readState();
    return state.codexRunDefaults;
  }

  async setCodexRunDefaults(
    defaults: {
      model?: string | null;
      reasoningEffort?: string | null;
      speedTier?: string | null;
    },
  ): Promise<CodexRunDefaults> {
    const state = await this.readState();
    const next: CodexRunDefaults = {
      model: normalizeOptionalSetting(defaults.model, state.codexRunDefaults.model),
      reasoningEffort: normalizeOptionalSetting(
        defaults.reasoningEffort,
        state.codexRunDefaults.reasoningEffort,
      ),
      speedTier: normalizeOptionalSetting(defaults.speedTier, state.codexRunDefaults.speedTier),
    };

    state.codexRunDefaults = next;
    await this.writeState(state);

    return next;
  }

  private async readState(): Promise<AlphaKanbanState> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.statePath, "utf8")) as AlphaKanbanState;
      return normalizeState(parsed, this.workspaceId);
    } catch (error) {
      if (isNodeError(error, "ENOENT")) {
        return emptyState();
      }
      throw error;
    }
  }

  private async writeState(state: AlphaKanbanState): Promise<void> {
    const nextState = alphaKanbanStateSchema.parse(state);
    await fs.mkdir(path.dirname(this.statePath), { recursive: true });
    const tempPath = `${this.statePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tempPath, `${JSON.stringify(nextState, null, 2)}\n`, "utf8");
    await fs.rename(tempPath, this.statePath);
  }

  private documentKey(relativePath: string): string {
    return `${this.workspaceId}::${normalizeDocumentPath(relativePath)}`;
  }
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function emptyState(): AlphaKanbanState {
  return {
    ...EMPTY_STATE,
    recentWorkspaces: [],
    documents: {},
    runResults: {},
    codexRunDefaults: {},
  };
}

function normalizeState(value: unknown, workspaceId: string): AlphaKanbanState {
  if (!isRecord(value)) {
    return emptyState();
  }

  return alphaKanbanStateSchema.parse({
    version: 2,
    recentWorkspaces: normalizeRecentWorkspaces(value.recentWorkspaces),
    lastWorkspaceId:
      typeof value.lastWorkspaceId === "string" && value.lastWorkspaceId
        ? value.lastWorkspaceId
        : undefined,
    documents: normalizeDocuments(value.documents, workspaceId),
    runResults: normalizeRunResults(value.runResults),
    codexRunDefaults: normalizeCodexRunDefaults(value.codexRunDefaults),
  });
}

function normalizeRecentWorkspaces(value: unknown): RecentWorkspace[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const id = asNonEmptyString(item.id);
    const root = asNonEmptyString(item.root);
    const label = asNonEmptyString(item.label);
    const lastOpenedAt = normalizeDateTime(item.lastOpenedAt);

    return id && root && label && lastOpenedAt ? [{ id, root, label, lastOpenedAt }] : [];
  });
}

function normalizeDocuments(
  value: unknown,
  workspaceId: string,
): Record<string, CodexDocumentState> {
  if (!isRecord(value)) {
    return {};
  }

  const documents: Record<string, CodexDocumentState> = {};

  for (const [rawKey, rawDocument] of Object.entries(value)) {
    const document = normalizeDocumentState(rawDocument);
    if (!document) {
      continue;
    }

    const key = isWorkspaceScopedDocumentKey(rawKey)
      ? rawKey
      : `${workspaceId}::${normalizeDocumentPath(rawKey)}`;
    if (!documents[key] || isWorkspaceScopedDocumentKey(rawKey)) {
      documents[key] = document;
    }
  }

  return documents;
}

function normalizeDocumentState(value: unknown): CodexDocumentState | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const codexSessionId = asNonEmptyString(value.codexSessionId);
  const relatedDocuments = Array.isArray(value.relatedDocuments)
    ? value.relatedDocuments.filter((item): item is string => typeof item === "string")
    : [];
  const parentTicketId = asNonEmptyString(value.parentTicketId);
  const lastTicketId = asNonEmptyString(value.lastTicketId);

  return {
    codexSessionId,
    relatedDocuments,
    parentTicketId,
    lastTicketId,
    updatedAt: normalizeDateTime(value.updatedAt) ?? new Date().toISOString(),
  };
}

function normalizeRunResults(value: unknown): Record<string, CodexRunReadState> {
  if (!isRecord(value)) {
    return {};
  }

  const runResults: Record<string, CodexRunReadState> = {};

  for (const [runId, rawState] of Object.entries(value)) {
    if (!isRecord(rawState)) {
      continue;
    }

    const readAt = normalizeDateTime(rawState.readAt);
    if (!readAt) {
      continue;
    }

    runResults[runId] = {
      readAt,
      updatedAt: normalizeDateTime(rawState.updatedAt) ?? readAt,
    };
  }

  return runResults;
}

function normalizeCodexRunDefaults(value: unknown): CodexRunDefaults {
  if (!isRecord(value)) {
    return {};
  }

  return {
    model: asNonEmptyString(value.model),
    reasoningEffort: asNonEmptyString(value.reasoningEffort),
    speedTier: asNonEmptyString(value.speedTier),
  };
}

function normalizeOptionalSetting(
  value: string | null | undefined,
  fallback: string | undefined,
): string | undefined {
  if (value === undefined) {
    return fallback;
  }
  if (value === null) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeDocumentPath(relativePath: string): string {
  return path.normalize(relativePath).replace(/\\/g, "/").split(path.sep).join("/");
}

function isWorkspaceScopedDocumentKey(key: string): boolean {
  return /^[^:]+::.+$/.test(key);
}

function normalizeDateTime(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : new Date(timestamp).toISOString();
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
