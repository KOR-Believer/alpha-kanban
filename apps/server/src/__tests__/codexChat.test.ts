import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CodexChatStore } from "../codexChat";
import { loadServerConfig } from "../config";

describe("CodexChatStore", () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(path.join(tmpdir(), "alpha-kanban-chat-"));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { force: true, recursive: true });
  });

  it("stores ticket chat messages by workspace, file, and ticket", async () => {
    const config = loadServerConfig({
      workspaceRoot,
      docRoots: ["docs"],
      workspaceRoots: ["."],
    });
    const firstWorkspace = new CodexChatStore(config, { workspaceId: "w_one" });
    const secondWorkspace = new CodexChatStore(config, { workspaceId: "w_two" });

    await firstWorkspace.appendTicketMessage({
      fileRelativePath: "docs/02_alpha_kanban_tickets.md",
      ticketId: "AKW-24",
      role: "user",
      contentFormat: "markdown",
      content: "질문 원문",
      runId: "run_one",
    });
    await firstWorkspace.appendTicketMessage({
      fileRelativePath: "docs/02_alpha_kanban_tickets.md",
      ticketId: "AKW-24",
      role: "assistant",
      contentFormat: "markdown",
      content: "답변 원문",
      runId: "run_one",
    });
    await firstWorkspace.appendTicketMessage({
      fileRelativePath: "docs/other_tickets.md",
      ticketId: "AKW-24",
      role: "user",
      contentFormat: "markdown",
      content: "다른 문서",
    });
    await secondWorkspace.appendTicketMessage({
      fileRelativePath: "docs/02_alpha_kanban_tickets.md",
      ticketId: "AKW-24",
      role: "user",
      contentFormat: "markdown",
      content: "다른 워크스페이스",
    });

    const firstMessages = await firstWorkspace.listTicketMessages(
      "docs/02_alpha_kanban_tickets.md",
      "AKW-24",
    );
    const otherDocumentMessages = await firstWorkspace.listTicketMessages(
      "docs/other_tickets.md",
      "AKW-24",
    );
    const secondMessages = await secondWorkspace.listTicketMessages(
      "docs/02_alpha_kanban_tickets.md",
      "AKW-24",
    );

    expect(firstMessages).toHaveLength(2);
    expect(firstMessages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(firstMessages[0]).toMatchObject({
      workspaceId: "w_one",
      fileRelativePath: "docs/02_alpha_kanban_tickets.md",
      ticketId: "AKW-24",
      content: "질문 원문",
      runId: "run_one",
    });
    expect(firstMessages[1]?.content).toBe("답변 원문");
    expect(otherDocumentMessages.map((message) => message.content)).toEqual(["다른 문서"]);
    expect(secondMessages.map((message) => message.content)).toEqual(["다른 워크스페이스"]);
  });
});
