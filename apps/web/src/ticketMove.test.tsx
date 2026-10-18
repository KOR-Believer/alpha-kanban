// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TicketDocumentResponse, TicketItem, TicketStatus } from "@alpha-kanban/shared";

import { TicketBoard } from "./App";
import { setLanguage, t } from "./i18n";
import type { SaveTicketStatus } from "./components/tickets/TicketStatusFields";

const ticket: TicketItem = {
  id: "MOV-01", title: "Move fixture", status: "DONE", progress: 100,
  completedAt: "2026-10-13T12:00:00+09:00", repository: ["fixture"], priority: "P1", type: "Feature",
  dependsOn: [], goal: [], currentProblem: [], implementationScope: [], outOfScope: [],
  completionCriteria: [], completionCriteriaItems: [], validation: [], validationItems: [],
  userInstructions: [], progressNotes: [], hasUserInstructionsSection: true,
  unknownBlocks: [], range: { startLine: 10, endLine: 40 }, missingFields: [],
};
const fixture: TicketDocumentResponse = {
  file: { id: "fixture", workspaceId: "w_fixture", type: "tickets", filename: "fixture_tickets.md",
    directory: "docs", relativePath: "docs/fixture_tickets.md", workspaceRelativePath: "docs/fixture_tickets.md",
    absolutePath: "/fixture/docs/fixture_tickets.md", mtimeMs: 1, hash: "initial-hash", slug: "fixture" },
  document: { title: "Fixture", status: { doneTickets: 1, totalTickets: 1 }, tickets: [ticket], lineCount: 40, missingSections: [] },
};

describe("ticket drag confirmation", () => {
  let root: Root;
  let container: HTMLDivElement;
  let save: ReturnType<typeof vi.fn<SaveTicketStatus>>;

  beforeEach(async () => {
    await setLanguage("ko");
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    save = vi.fn<SaveTicketStatus>(async () => {});
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  function render(data = fixture) {
    const grouped = new Map<TicketStatus, TicketItem[]>();
    for (const item of data.document.tickets) grouped.set(item.status, [...(grouped.get(item.status) ?? []), item]);
    root.render(<TicketBoard document={data} ticketsByStatus={grouped} onTicketSelect={() => {}}
      onSaveStatus={save} />);
  }
  function button(text: string) {
    const element = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((item) => item.textContent?.trim() === text);
    expect(element, `button: ${text}`).toBeDefined();
    return element!;
  }
  function column(status: TicketStatus) {
    return document.querySelector<HTMLElement>(`section[aria-label="${t("{{status}} tickets", { status: t(status) })}"]`)!;
  }
  async function drag(to: TicketStatus) {
    const source = column("DONE").querySelector("article")!;
    const dataTransfer = { setData: vi.fn(), effectAllowed: "", dropEffect: "" };
    for (const [target, type] of [[source, "dragstart"], [column(to), "dragover"], [column(to), "drop"], [source, "dragend"]] as const) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
      await act(async () => { target.dispatchEvent(event); });
    }
  }

  it("opens the shared form without saving or moving, and cancel leaves the source unchanged", async () => {
    await act(async () => render());
    await drag("TODO");
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.querySelector("textarea")?.placeholder).toBe("사용자가 명시적으로 할 일로 변경했습니다.");
    expect(column("DONE").textContent).toContain("MOV-01");
    expect(column("TODO").textContent).not.toContain("MOV-01");
    expect(save).not.toHaveBeenCalled();
    await act(async () => button("취소").click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(save).not.toHaveBeenCalled();
    expect(column("DONE").textContent).toContain("MOV-01");
  });

  it("allows an empty reason, captures the original guard, and moves only on successful save", async () => {
    let finish!: () => void;
    const response = new Promise<void>((resolve) => { finish = resolve; });
    save.mockImplementation(async () => {
      await response;
      render({ ...fixture, file: { ...fixture.file, hash: "saved-hash", mtimeMs: 2 },
        document: { ...fixture.document, tickets: [{ ...ticket, status: "TODO", progress: 0 }] } });
    });
    await act(async () => render());
    await drag("TODO");
    expect(button("저장하고 이동").disabled).toBe(false);
    await act(async () => button("저장하고 이동").click());
    expect(save).toHaveBeenCalledExactlyOnceWith("MOV-01", "TODO", 0, "", {
      expectedHash: "initial-hash", expectedMtimeMs: 1,
    });
    expect(column("DONE").textContent).toContain("MOV-01");
    expect(button("저장하고 이동").disabled).toBe(true);
    await act(async () => button("저장하고 이동").click());
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); await response; });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(column("TODO").textContent).toContain("MOV-01");
    expect(column("DONE").textContent).not.toContain("MOV-01");
  });

  it("keeps the dialog, reason, and original column when saving fails", async () => {
    save.mockRejectedValue(new Error("STALE_FILE"));
    await act(async () => render());
    await drag("TODO");
    const textarea = document.querySelector("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, "버그 발견");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => button("저장하고 이동").click());
    expect(save.mock.calls[0]?.[3]).toBe("버그 발견");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("STALE_FILE");
    expect(textarea.value).toBe("버그 발견");
    expect(column("DONE").textContent).toContain("MOV-01");
    expect(column("TODO").textContent).not.toContain("MOV-01");
  });

  it("blocks confirmation when the document changes while the modal is open", async () => {
    await act(async () => render());
    await drag("TODO");
    await act(async () => render({ ...fixture, file: { ...fixture.file, hash: "external-change" } }));
    expect(button("저장하고 이동").disabled).toBe(true);
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("문서가 변경되었습니다");
    expect(save).not.toHaveBeenCalled();
  });

  it("does nothing for same-column or external drops", async () => {
    await act(async () => render());
    await drag("DONE");
    await act(async () => { column("TODO").dispatchEvent(new Event("drop", { bubbles: true })); });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });

  it("discards the pending move when the board changes document", async () => {
    await act(async () => render());
    await drag("TODO");
    await act(async () => { root.render(<TicketBoard key="different-file" document={fixture} ticketsByStatus={new Map()}
      onSaveStatus={save} onTicketSelect={() => {}} />); });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });
});
