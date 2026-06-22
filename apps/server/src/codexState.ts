import { promises as fs } from "node:fs";
import path from "node:path";

import type { ServerConfig } from "./config";

export type CodexDocumentState = {
  codexSessionId?: string;
  relatedDocuments: string[];
  parentTicketId?: string;
  updatedAt: string;
};

type AlphaKanbanState = {
  version: 1;
  documents: Record<string, CodexDocumentState>;
};

const EMPTY_STATE: AlphaKanbanState = {
  version: 1,
  documents: {},
};

export class CodexStateStore {
  readonly statePath: string;

  constructor(config: ServerConfig) {
    this.statePath = path.join(config.workspaceRoot, ".alpha-kanban", "state.json");
  }

  async getDocumentState(relativePath: string): Promise<CodexDocumentState | undefined> {
    const state = await this.readState();
    return state.documents[relativePath];
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
    const current = state.documents[relativePath];
    const next: CodexDocumentState = {
      codexSessionId: sessionId,
      relatedDocuments: options.relatedDocuments ?? current?.relatedDocuments ?? [],
      parentTicketId: options.parentTicketId ?? current?.parentTicketId,
      updatedAt: new Date().toISOString(),
    };

    state.documents[relativePath] = next;
    await this.writeState(state);

    return next;
  }

  private async readState(): Promise<AlphaKanbanState> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.statePath, "utf8")) as AlphaKanbanState;

      return {
        version: 1,
        documents: parsed.documents ?? {},
      };
    } catch (error) {
      if (isNodeError(error, "ENOENT")) {
        return { ...EMPTY_STATE, documents: {} };
      }
      throw error;
    }
  }

  private async writeState(state: AlphaKanbanState): Promise<void> {
    await fs.mkdir(path.dirname(this.statePath), { recursive: true });
    const tempPath = `${this.statePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await fs.rename(tempPath, this.statePath);
  }
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
