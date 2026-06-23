import { describe, expect, it } from "vitest";

import {
  codexChatScopeRunWarnings,
  findCodexChatScopeMentionRanges,
  isCodexChatScopeRunAllowed,
  resolveCodexChatScope,
} from "@alpha-kanban/shared";

describe("resolveCodexChatScope", () => {
  const baseInput = {
    defaultScope: "ticket" as const,
    targetFileId: "file_1",
    targetTicketId: "AKW-07",
    targetWorkspaceId: "w_alpha",
  };

  it("keeps bare ticket ids as natural language", () => {
    const resolution = resolveCodexChatScope({
      ...baseInput,
      rawMessage: "AKW-26 말고 AKW-08부터 할까",
    });

    expect(resolution.scope).toBe("ticket");
    expect(resolution.targetTicketId).toBe("AKW-07");
    expect(resolution.cleanedMessage).toBe("AKW-26 말고 AKW-08부터 할까");
    expect(resolution.mentions).toEqual([]);
  });

  it("parses ticket, document, and workspace mentions", () => {
    const ticketResolution = resolveCodexChatScope({
      ...baseInput,
      rawMessage: "@t:akw-26 진행상황을 봐줘",
    });
    const documentResolution = resolveCodexChatScope({
      ...baseInput,
      rawMessage: "@tickets 전체 상태 요약",
    });
    const workspaceResolution = resolveCodexChatScope({
      ...baseInput,
      rawMessage: "@workspace 프로젝트 전체 흐름 봐줘",
    });

    expect(ticketResolution).toMatchObject({
      scope: "ticket",
      targetTicketId: "AKW-26",
      cleanedMessage: "진행상황을 봐줘",
    });
    expect(ticketResolution.mentions[0]).toMatchObject({
      kind: "ticket",
      token: "@t:akw-26",
      targetTicketId: "AKW-26",
    });

    expect(documentResolution).toMatchObject({
      scope: "document",
      targetFileId: "file_1",
      cleanedMessage: "전체 상태 요약",
    });

    expect(workspaceResolution).toMatchObject({
      scope: "workspace",
      targetFileId: undefined,
      targetTicketId: undefined,
      cleanedMessage: "프로젝트 전체 흐름 봐줘",
    });
  });

  it("guards workspace scope edit runs", () => {
    const resolution = resolveCodexChatScope({
      ...baseInput,
      rawMessage: "@w 전체 리팩터링 진행",
    });

    expect(isCodexChatScopeRunAllowed(resolution, "edit")).toBe(false);
    expect(isCodexChatScopeRunAllowed(resolution, "read_only")).toBe(true);
    expect(codexChatScopeRunWarnings(resolution, "edit").at(-1)).toContain(
      "Workspace scope is read-only",
    );
  });

  it("finds scope mention token ranges for composer atom nodes", () => {
    const value = "@t:AKW-26 진행상황 확인";
    const ranges = findCodexChatScopeMentionRanges(value);

    expect(ranges).toEqual([
      {
        end: 9,
        kind: "ticket",
        start: 0,
        targetTicketId: "AKW-26",
        token: "@t:AKW-26",
      },
    ]);
  });
});
