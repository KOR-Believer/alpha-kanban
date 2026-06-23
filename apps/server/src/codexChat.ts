import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import {
  codexChatMessageSchema,
  type CodexChatScope,
  type CodexChatContentFormat,
  type CodexChatMessage,
  type CodexChatRole,
} from "@alpha-kanban/shared";

import type { ServerConfig } from "./config";

type CodexChatStoreOptions = {
  workspaceId?: string;
};

export type AppendTicketChatMessageInput = {
  content: string;
  contentFormat: CodexChatContentFormat;
  fileRelativePath: string;
  role: CodexChatRole;
  runId?: string;
  scope?: CodexChatScope;
  ticketId: string;
};

export class CodexChatStore {
  private readonly workspaceId: string;

  constructor(
    private readonly config: ServerConfig,
    options: CodexChatStoreOptions = {},
  ) {
    this.workspaceId = options.workspaceId ?? config.workspaceId;
  }

  async listTicketMessages(
    fileRelativePath: string,
    ticketId: string,
  ): Promise<CodexChatMessage[]> {
    const chatPath = this.ticketChatPath(fileRelativePath, ticketId);

    try {
      const contents = await fs.readFile(chatPath, "utf8");
      return contents
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0)
        .map((line) => codexChatMessageSchema.parse(JSON.parse(line)));
    } catch (error) {
      if (isNodeError(error, "ENOENT")) {
        return [];
      }
      throw error;
    }
  }

  async appendTicketMessage(
    input: AppendTicketChatMessageInput,
  ): Promise<CodexChatMessage | undefined> {
    const content = input.content.trim();
    if (!content) {
      return undefined;
    }

    const message: CodexChatMessage = {
      id: randomUUID(),
      scope: input.scope ?? "ticket",
      role: input.role,
      contentFormat: input.contentFormat,
      content,
      createdAt: new Date().toISOString(),
      workspaceId: this.workspaceId,
      fileRelativePath: input.fileRelativePath,
      ticketId: input.ticketId,
      runId: input.runId,
    };
    const chatPath = this.ticketChatPath(input.fileRelativePath, input.ticketId);

    await fs.mkdir(path.dirname(chatPath), { recursive: true });
    await fs.appendFile(chatPath, `${JSON.stringify(message)}\n`, "utf8");

    return message;
  }

  private ticketChatPath(fileRelativePath: string, ticketId: string): string {
    return path.join(
      this.config.workspaceRoot,
      ".alpha-kanban",
      "chats",
      encodePathSegment(this.workspaceId),
      encodePathSegment(fileRelativePath),
      `${encodePathSegment(ticketId)}.jsonl`,
    );
  }
}

function encodePathSegment(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
