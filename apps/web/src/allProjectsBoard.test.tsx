// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TicketDocumentResponse } from "@alpha-kanban/shared";
import { AllProjectsBoard, allTicketsKey } from "./AllProjectsBoard";
import { BOARD_FILTERS_KEY, type BoardData } from "./allProjectsData";
import { documentFixture, projectFixture } from "./allProjectsFixtures";
import { setLanguage, t } from "./i18n";

const api = vi.hoisted(() => ({
  workspaces: vi.fn(), document: vi.fn(), request: vi.fn(), patch: vi.fn(), append: vi.fn(),
}));
vi.mock("./App", async (original) => ({
  ...await original<typeof import("./App")>(),
  fetchWorkspaces: api.workspaces, fetchTicketDocument: api.document,
  requestJson: api.request, patchTicket: api.patch, appendTicketInstruction: api.append,
}));
vi.mock("@tanstack/react-router", async (original) => ({
  ...await original<typeof import("@tanstack/react-router")>(), useNavigate: () => vi.fn(),
}));

describe("all-projects document workflow", () => {
  const first = projectFixture("/work/project", "w_first");
  const second = projectFixture("/personal/project", "w_second");
  let documents: Record<string, TicketDocumentResponse>;
  let root: Root;
  let container: HTMLDivElement;
  let client: QueryClient;

  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.clearAllMocks();
    window.localStorage.clear();
    await setLanguage("ko");
    window.localStorage.setItem("alpha-kanban.ticketDetailMode", "modal");
    documents = { [first.id]: documentFixture(first), [second.id]: documentFixture(second) };
    api.workspaces.mockResolvedValue({ workspaces: [first, second] });
    api.document.mockImplementation(async (id: string) => documents[id]);
    api.request.mockImplementation(async (url: string, _schema: unknown, init?: RequestInit) => {
      if (url === "/api/board-order") return init?.body ? JSON.parse(String(init.body)) : { keys: [] };
      const id = url.split("/")[3]!;
      return { files: [documents[id]!.file] };
    });
    api.patch.mockImplementation(async (workspaceId: string, _fileId: string, _ticketId: string, body: { status: string; progress: number }) => {
      const before = documents[workspaceId]!;
      const next = { ...before, file: { ...before.file, hash: "saved-hash", mtimeMs: 2 },
        document: { ...before.document, tickets: [{ ...before.document.tickets[0]!, ...body }] } } as TicketDocumentResponse;
      documents[workspaceId] = next;
      return next;
    });
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
    container = document.createElement("div"); document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    client.clear(); container.remove(); vi.unstubAllGlobals();
  });
  async function mount() {
    await act(async () => root.render(<QueryClientProvider client={client}><AllProjectsBoard /></QueryClientProvider>));
    for (let attempt = 0; attempt < 30 && !document.querySelector("[data-ticket-key]"); attempt++) {
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    }
    expect(document.querySelectorAll("[data-ticket-key]")).toHaveLength(2);
  }
  function card(id = first.id) {
    return [...document.querySelectorAll<HTMLElement>("[data-ticket-key]")].find((element) => element.textContent?.includes(`Fixture ${id}`))!;
  }
  function column(status: string) { return document.querySelector<HTMLElement>(`section[aria-label="${t("{{status}} tickets", { status: t(status) })}"]`)!; }
  function button(label: string) {
    const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find((element) => element.textContent?.trim() === label || element.getAttribute("aria-label") === label);
    expect(found, label).toBeDefined(); return found!;
  }
  async function drag(status: string, id = first.id) {
    const source = card(id);
    const key = source.dataset.ticketKey!;
    const dataTransfer = { setData: vi.fn(), getData: () => key, effectAllowed: "" };
    for (const [target, type] of [[source, "dragstart"], [column(status), "dragover"], [column(status), "drop"], [source, "dragend"]] as const) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
      await act(async () => { target.dispatchEvent(event); });
    }
  }
  async function enter(element: HTMLTextAreaElement | HTMLInputElement, value: string) {
    await act(async () => {
      const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  it("opens the shared reason dialog and cancel does not patch or reorder", async () => {
    await mount(); await drag("TODO");
    expect(document.querySelector("textarea")?.placeholder).toBe("사용자가 명시적으로 할 일로 변경했습니다.");
    expect(column("DONE").textContent).toContain("Fixture w_first");
    expect(column("TODO").textContent).not.toContain("Fixture w_first");
    expect(api.patch).not.toHaveBeenCalled();
    await act(async () => button("취소").click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(api.request.mock.calls.some((call) => call[2]?.method === "PUT")).toBe(false);
  });
  it("saves to the exact workspace/file, waits for success, and leaves the other same-id ticket untouched", async () => {
    let finish!: (value: TicketDocumentResponse) => void;
    const next = { ...documents[first.id]!, file: { ...documents[first.id]!.file, hash: "saved", mtimeMs: 2 },
      document: { ...documents[first.id]!.document, tickets: [{ ...documents[first.id]!.document.tickets[0]!, status: "TODO", progress: 0 }] } } as TicketDocumentResponse;
    api.patch.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    await mount(); await drag("TODO"); await enter(document.querySelector("textarea")!, "회귀 버그 발견");
    await act(async () => button("저장하고 이동").click());
    expect(api.patch).toHaveBeenCalledExactlyOnceWith(first.id, first.id, "TEST-01", {
      expectedHash: "hash-w_first", expectedMtimeMs: 1, status: "TODO", progress: 0, reason: "회귀 버그 발견",
    });
    expect(column("DONE").textContent).toContain("Fixture w_first");
    expect(button("저장하고 이동").disabled).toBe(true);
    await act(async () => { finish(next); });
    expect(column("TODO").textContent).toContain("Fixture w_first");
    expect(column("DONE").textContent).toContain("Fixture w_second");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it("keeps the form and board unchanged after a failed PATCH", async () => {
    api.patch.mockRejectedValue(new Error("STALE_FILE"));
    await mount(); await drag("READY");
    await act(async () => button("저장하고 이동").click());
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("STALE_FILE");
    expect(column("DONE").textContent).toContain("Fixture w_first");
    expect(api.request.mock.calls.some((call) => call[2]?.method === "PUT")).toBe(false);
  });
  it("saves a cross-column position only after the Markdown change succeeds", async () => {
    documents[second.id]!.document.tickets[0]!.status = "TODO";
    documents[second.id]!.document.tickets[0]!.progress = 0;
    api.patch.mockRejectedValueOnce(new Error("write failed"));
    await mount();
    const source = card();
    const target = card(second.id);
    const dataTransfer = { setData: vi.fn(), getData: () => source.dataset.ticketKey, effectAllowed: "" };
    for (const [element, type] of [[source, "dragstart"], [target, "dragover"], [target, "drop"], [source, "dragend"]] as const) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
      Object.defineProperty(event, "clientY", { value: 1 });
      await act(async () => { element.dispatchEvent(event); });
    }
    await act(async () => button("저장하고 이동").click());
    expect(api.request.mock.calls.some((call) => call[2]?.method === "PUT")).toBe(false);
    expect(column("DONE").textContent).toContain("Fixture w_first");
    await act(async () => button("저장하고 이동").click());
    const writes = api.request.mock.calls.filter((call) => call[2]?.method === "PUT");
    expect(writes).toHaveLength(1);
    expect(JSON.parse(String(writes[0]![2].body)).keys).toEqual([target.dataset.ticketKey, source.dataset.ticketKey]);
    expect(column("TODO").textContent).toContain("Fixture w_first");
  });
  it("uses the existing detail editor and persists manual directions with the correct guard", async () => {
    api.append.mockResolvedValue(documents[first.id]);
    await mount();
    await act(async () => card().querySelector<HTMLAnchorElement>("a")!.click());
    expect(document.body.textContent).toContain("속성");
    expect(document.body.textContent).not.toContain("Run with Codex");
    const text = document.querySelector<HTMLTextAreaElement>('textarea[id$="-instruction-text"]') ?? document.querySelector("textarea")!;
    await enter(text, "확인해 주세요");
    await act(async () => button("문서에 추가").click());
    expect(api.append).toHaveBeenCalledExactlyOnceWith(first.id, first.id, "TEST-01", {
      kind: "manual", text: "확인해 주세요", expectedHash: "hash-w_first", expectedMtimeMs: 1,
    });
  });
  it("blocks a pending move if its document changed during polling", async () => {
    await mount(); await drag("TODO");
    await act(async () => {
      client.setQueryData<BoardData>(allTicketsKey, (data) => ({ ...data!, documents: data!.documents.map((item) =>
        item.workspace.id === first.id ? { ...item, response: { ...item.response, file: { ...item.response.file, hash: "external" } } } : item) }));
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(button("저장하고 이동").disabled).toBe(true);
    expect(document.body.textContent).toContain("문서가 변경되었습니다");
  });
  it("remembers search/hide-DONE filters and counts only visible cards", async () => {
    await mount();
    await enter(document.querySelector<HTMLInputElement>('[aria-label="티켓 검색"]')!, "w_first");
    expect(document.querySelectorAll("[data-ticket-key]")).toHaveLength(1);
    expect(container.textContent).toContain("티켓 1개");
    await act(async () => document.querySelector<HTMLElement>('[role="checkbox"]')!.click());
    expect(document.querySelectorAll("[data-ticket-key]")).toHaveLength(0);
    expect(container.textContent).toContain("티켓 0개");
    expect(JSON.parse(window.localStorage.getItem(BOARD_FILTERS_KEY)!)).toMatchObject({ hideDone: true, search: "w_first" });
  });
  it("serializes reordering and rolls back on a failed order save", async () => {
    let reject!: (reason: Error) => void;
    const normal = api.request.getMockImplementation()!;
    api.request.mockImplementation((url, schema, init) => init?.method === "PUT"
      ? new Promise((_, fail) => { reject = fail; }) : normal(url, schema, init));
    await mount();
    const source = column("DONE").querySelector<HTMLElement>("[data-ticket-key]")!;
    const originalKey = source.dataset.ticketKey;
    const down = source.querySelector<HTMLButtonElement>('button[title="아래로 이동"]')!;
    await act(async () => down.click());
    expect(api.request.mock.calls.filter((call) => call[2]?.method === "PUT")).toHaveLength(1);
    expect([...document.querySelectorAll<HTMLElement>("[data-ticket-key]")].every((element) => !element.draggable)).toBe(true);
    await act(async () => { reject(new Error("write failed")); });
    expect(column("DONE").querySelector<HTMLElement>("[data-ticket-key]")?.dataset.ticketKey).toBe(originalKey);
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("write failed");
  });
});
