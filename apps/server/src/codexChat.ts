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
  metadata?: Record<string, unknown>;
  role: CodexChatRole;
  runId?: string;
  scope?: CodexChatScope;
  ticketId: string;
};

export type AppendWorkspaceChatMessageInput = {
  content: string;
  contentFormat: CodexChatContentFormat;
  metadata?: Record<string, unknown>;
  role: CodexChatRole;
  runId?: string;
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

  async findTicketMessage(
    fileRelativePath: string,
    ticketId: string,
    messageId: string,
  ): Promise<CodexChatMessage | undefined> {
    const messages = await this.listTicketMessages(fileRelativePath, ticketId);
    return messages.find((message) => message.id === messageId);
  }

  async deleteTicketMessage(
    fileRelativePath: string,
    ticketId: string,
    messageId: string,
  ): Promise<CodexChatMessage[] | undefined> {
    const messages = await this.listTicketMessages(fileRelativePath, ticketId);
    const nextMessages = messages.filter((message) => message.id !== messageId);

    if (nextMessages.length === messages.length) {
      return undefined;
    }

    await this.writeTicketMessages(fileRelativePath, ticketId, nextMessages);
    return nextMessages;
  }

  async linkTicketMessageRun(
    fileRelativePath: string,
    ticketId: string,
    messageId: string,
    runId: string,
  ): Promise<CodexChatMessage | undefined> {
    const messages = await this.listTicketMessages(fileRelativePath, ticketId);
    let updatedMessage: CodexChatMessage | undefined;
    const nextMessages = messages.map((message) => {
      if (message.id !== messageId) {
        return message;
      }

      const previousRunIds = uniqueStrings([
        ...metadataRunIds(message.metadata?.previousRunIds),
        message.runId,
      ]);
      updatedMessage = {
        ...message,
        runId,
        metadata: {
          ...message.metadata,
          previousRunIds,
        },
      };
      return updatedMessage;
    });

    if (!updatedMessage) {
      return undefined;
    }

    await this.writeTicketMessages(fileRelativePath, ticketId, nextMessages);
    return updatedMessage;
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
      metadata: input.metadata,
    };
    const chatPath = this.ticketChatPath(input.fileRelativePath, input.ticketId);

    await fs.mkdir(path.dirname(chatPath), { recursive: true });
    await fs.appendFile(chatPath, `${JSON.stringify(message)}\n`, "utf8");

    return message;
  }

  async listWorkspaceMessages(): Promise<CodexChatMessage[]> {
    const chatPath = this.workspaceChatPath();

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

  async appendWorkspaceMessage(
    input: AppendWorkspaceChatMessageInput,
  ): Promise<CodexChatMessage | undefined> {
    const content = input.content.trim();
    if (!content) {
      return undefined;
    }

    const message: CodexChatMessage = {
      id: randomUUID(),
      scope: "workspace",
      role: input.role,
      contentFormat: input.contentFormat,
      content,
      createdAt: new Date().toISOString(),
      workspaceId: this.workspaceId,
      runId: input.runId,
      metadata: input.metadata,
    };
    const chatPath = this.workspaceChatPath();

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

  private async writeTicketMessages(
    fileRelativePath: string,
    ticketId: string,
    messages: CodexChatMessage[],
  ): Promise<void> {
    const chatPath = this.ticketChatPath(fileRelativePath, ticketId);
    await fs.mkdir(path.dirname(chatPath), { recursive: true });
    if (messages.length === 0) {
      await fs.rm(chatPath, { force: true });
      return;
    }
    await fs.writeFile(
      chatPath,
      `${messages.map((message) => JSON.stringify(message)).join("\n")}\n`,
      "utf8",
    );
  }

  private workspaceChatPath(): string {
    return path.join(
      this.config.workspaceRoot,
      ".alpha-kanban",
      "chats",
      encodePathSegment(this.workspaceId),
      "_workspace.jsonl",
    );
  }
}

function encodePathSegment(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function metadataRunIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
