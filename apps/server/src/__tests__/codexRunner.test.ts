import { describe, expect, it } from "vitest";

import { resolveCodexChatScope } from "@alpha-kanban/shared";

import { buildCodexPrompt } from "../codexRunner";

const basePromptInput = {
  instructionDraft: "진행",
  instructionSummary: "Codex 실행 지시: 진행",
  planPath: "/workspace/docs/01_plan.md",
  ticketFilePath: "/workspace/docs/02_tickets.md",
  ticketId: "AKW-25",
  ticketRange: { startLine: 1505, endLine: 1588 },
  workspaceRoot: "/workspace",
  scopeResolution: resolveCodexChatScope({
    defaultScope: "ticket",
    rawMessage: "진행",
    targetFileId: "file_1",
    targetTicketId: "AKW-25",
    targetWorkspaceId: "w_alpha",
  }),
};

describe("buildCodexPrompt", () => {
  it("uses edit mode policy by default callers and separates read-only policy", () => {
    const editPrompt = buildCodexPrompt({
      ...basePromptInput,
      mode: "edit",
    });
    const readOnlyPrompt = buildCodexPrompt({
      ...basePromptInput,
      mode: "read_only",
    });

    expect(editPrompt).toContain("작업 모드: Edit files");
    expect(editPrompt).toContain("Resolved scope:");
    expect(editPrompt).toContain("- Scope: ticket");
    expect(editPrompt).toContain("- Target ticket id: AKW-25");
    expect(editPrompt).toContain("Run 시작 시 서버가 이번 실행 지시 요약");
    expect(editPrompt).toContain("진행 메모`에 append");
    expect(editPrompt).not.toContain("파일 생성/수정/삭제를 하지 마");

    expect(readOnlyPrompt).toContain("작업 모드: Read-only answer");
    expect(readOnlyPrompt).toContain("파일 생성/수정/삭제를 하지 마");
    expect(readOnlyPrompt).toContain("ticket Markdown의 `사용자 지시`와 `진행 메모`를 append하지 마");
    expect(readOnlyPrompt).not.toContain("Run 시작 시 서버가 이번 실행 지시 요약");
  });
});
