import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  TICKET_WRITE_ERROR,
  TicketMarkdownWriteError,
  appendProgressNote,
  appendUserInstruction,
  parseTicketDocument,
  updateTicketStatusAndProgress,
} from "../ticketMarkdown";

const realTicketDocument = readFileSync(
  new URL("../../../../../docs/02_alpha_kanban_tickets.md", import.meta.url),
  "utf8",
);

const legacyTicketDocument = `# Legacy 티켓

## Status

- 작성일: 2026-06-22
- 기준 문서: \`docs/legacy_plan.md\`
- 목적: legacy compatibility
- 범위: \`alpha-kanban\`
- 현재 진행률: \`0 / 1 tickets\`

## 티켓 상태

- \`TODO\`: 아직 시작하지 않음

## Progress 기준

- \`0%\`: 티켓 초안만 있음

## 운영 원칙

- append-only

## Ticket Template

\`\`\`md
template
\`\`\`

## Progress Board

| Ticket | Status | Progress | Repository | Depends on |
| --- | --- | ---: | --- | --- |
| LEG-01 | READY | 25% | \`alpha-kanban\` | - |

## Ticket List

### LEG-01. Legacy ticket

Status: READY
Progress: 25%
Repository:

- \`alpha-kanban\`

Priority: P0
Type: Feature
Depends on:

- 없음

목표:

- Parse a ticket without user instructions.

현재 문제:

- Existing documents may not have the new field.

구현 범위:

- Support backwards compatibility.

제외 범위:

- UI

완료 기준:

- [ ] User instruction section can be inserted.

검증:

- [ ] Serializer smoke

진행 메모:

- 2026-06-22: 초안 작성.
`;

describe("ticketMarkdown", () => {
  it("parses the current project ticket document", () => {
    const document = parseTicketDocument(realTicketDocument);
    const akb02 = document.tickets.find((ticket) => ticket.id === "AKB-02");

    expect(document.title).toBe("Alpha Kanban 티켓");
    expect(document.status.doneTickets).toBe(8);
    expect(document.progressBoard).toHaveLength(8);
    expect(akb02?.status).toBe("DONE");
    expect(akb02?.progress).toBe(100);
    expect(akb02?.hasUserInstructionsSection).toBe(true);
    expect(akb02?.userInstructions).toHaveLength(3);
    expect(akb02?.missingFields).toEqual([]);
  });

  it("parses a legacy ticket without 사용자 지시 as backwards compatible", () => {
    const document = parseTicketDocument(legacyTicketDocument);
    const ticket = document.tickets[0];

    expect(ticket?.id).toBe("LEG-01");
    expect(ticket?.hasUserInstructionsSection).toBe(false);
    expect(ticket?.userInstructions).toEqual([]);
    expect(ticket?.progressNotes).toHaveLength(1);
    expect(ticket?.missingFields).toEqual([]);
  });

  it("updates status/progress in ticket body, board, and top-level progress", () => {
    const updated = updateTicketStatusAndProgress(realTicketDocument, "AKB-07", {
      status: "IN_PROGRESS",
      progress: 50,
    });

    expect(updated).toContain("- 현재 진행률: `7 / 8 tickets`");
    expect(updated).toContain("| AKB-07 | IN_PROGRESS | 50% | `alpha-kanban` | AKB-01, AKB-02, AKB-03, AKB-04, AKB-05, AKB-06 |");
    expect(updated).toContain(`### AKB-07. 통합 검증, sample 문서, 운영 문서 정리

Status: IN_PROGRESS
Progress: 50%`);
  });

  it("appends 사용자 지시 to an existing section", () => {
    const before = parseTicketDocument(realTicketDocument).tickets.find(
      (ticket) => ticket.id === "AKB-02",
    );
    const updated = appendUserInstruction(
      realTicketDocument,
      "AKB-02",
      "새 지시는 사용자 지시 섹션에만 추가한다.",
      { date: "2026-06-22" },
    );

    const document = parseTicketDocument(updated);
    const akb02 = document.tickets.find((ticket) => ticket.id === "AKB-02");

    expect(akb02?.userInstructions.at(-1)?.text).toBe(
      "새 지시는 사용자 지시 섹션에만 추가한다.",
    );
    expect(akb02?.progressNotes.map((entry) => entry.text)).toEqual(
      before?.progressNotes.map((entry) => entry.text),
    );
  });

  it("inserts 사용자 지시 before 진행 메모 for legacy tickets", () => {
    const updated = appendUserInstruction(
      legacyTicketDocument,
      "LEG-01",
      "기존 문서에는 사용자 지시 섹션을 새로 삽입한다.",
      { date: "2026-06-22" },
    );

    expect(updated).toContain(`사용자 지시:

- 2026-06-22: 기존 문서에는 사용자 지시 섹션을 새로 삽입한다.

진행 메모:`);

    const ticket = parseTicketDocument(updated).tickets[0];
    expect(ticket?.hasUserInstructionsSection).toBe(true);
    expect(ticket?.userInstructions).toHaveLength(1);
  });

  it("appends agent progress notes separately", () => {
    const updated = appendProgressNote(
      legacyTicketDocument,
      "LEG-01",
      "진행 메모는 agent-authored log로만 추가한다.",
      { date: "2026-06-22" },
    );

    const ticket = parseTicketDocument(updated).tickets[0];
    expect(ticket?.userInstructions).toEqual([]);
    expect(ticket?.progressNotes.at(-1)?.text).toBe(
      "진행 메모는 agent-authored log로만 추가한다.",
    );
  });

  it("preserves unknown prose while changing a canonical field", () => {
    const withExtraProse = realTicketDocument.replace(
      "목표:\n\n- canonical ticket Markdown을 구조화하고",
      "목표:\n\nExtra prose that should survive serializers.\n\n- canonical ticket Markdown을 구조화하고",
    );

    const updated = updateTicketStatusAndProgress(withExtraProse, "AKB-02", {
      status: "IN_PROGRESS",
      progress: 50,
    });

    expect(updated).toContain("Extra prose that should survive serializers.");
  });

  it("blocks writes when required canonical fields are missing", () => {
    const malformed = legacyTicketDocument.replace("\n진행 메모:\n", "\n");

    expect(() =>
      appendProgressNote(malformed, "LEG-01", "이 쓰기는 차단되어야 한다.", {
        date: "2026-06-22",
      }),
    ).toThrow(TicketMarkdownWriteError);

    try {
      appendProgressNote(malformed, "LEG-01", "이 쓰기는 차단되어야 한다.", {
        date: "2026-06-22",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(TicketMarkdownWriteError);
      expect((error as TicketMarkdownWriteError).code).toBe(
        TICKET_WRITE_ERROR.NEEDS_REPAIR,
      );
    }
  });
});
