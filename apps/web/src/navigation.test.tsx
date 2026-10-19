// @vitest-environment happy-dom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDocumentSets } from "@alpha-kanban/shared/documents";
import { createAppRouter } from "./router";
import { buildAppRoute } from "./appRoute";
import { projectFixture, documentFixture } from "./allProjectsFixtures";
import { browserRepository } from "./browser/repository";
import { setLanguage } from "./i18n";

describe("application navigation history", () => {
  const workspace = projectFixture("workspace/project", "bw_test");
  const response = documentFixture(workspace, "d_test");
  const projectHref = buildAppRoute({ workspaceId: workspace.id });
  const documentHref = buildAppRoute({ workspaceId: workspace.id, filePath: response.file.id });
  const guideHref = buildAppRoute({ workspaceId: workspace.id, showGuide: true });
  let root: Root;
  let container: HTMLDivElement;
  let queryClient: QueryClient;
  let router: ReturnType<typeof createAppRouter>;

  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    localStorage.clear();
    await setLanguage("ko");
    vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => undefined);
    vi.spyOn(browserRepository, "workspaces").mockResolvedValue({ workspaces: [workspace], lastWorkspaceId: workspace.id });
    vi.spyOn(browserRepository, "select").mockResolvedValue({ workspace });
    vi.spyOn(browserRepository, "connections").mockResolvedValue([]);
    vi.spyOn(browserRepository, "recoveries").mockResolvedValue([]);
    vi.spyOn(browserRepository, "documentSets").mockResolvedValue({ sets: buildDocumentSets([response.file]) });
    vi.spyOn(browserRepository, "ticketFiles").mockResolvedValue([response.file]);
    vi.spyOn(browserRepository, "boardOrder").mockResolvedValue({ keys: [] });
    vi.spyOn(browserRepository, "file").mockResolvedValue(response.file);
    vi.spyOn(browserRepository, "tickets").mockResolvedValue(response);
    vi.spyOn(browserRepository, "markdown").mockResolvedValue({ file: response.file, markdown: "# Ticket source", outline: [] });
    vi.spyOn(browserRepository, "subscribe").mockReturnValue(() => undefined);
    vi.spyOn(browserRepository, "patch");
    vi.spyOn(browserRepository, "append");
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, networkMode: "always", refetchOnWindowFocus: false } } });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    router?.history.destroy();
    queryClient.clear();
    container.remove();
    expect(browserRepository.patch).not.toHaveBeenCalled();
    expect(browserRepository.append).not.toHaveBeenCalled();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function settle() {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 40)); });
  }

  async function render(initialEntries: string[]) {
    router = createAppRouter(createMemoryHistory({ initialEntries }));
    await act(async () => {
      await router.load();
      root.render(<StrictMode><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></StrictMode>);
    });
    await settle();
  }

  async function click(selector: string, parent: ParentNode = container) {
    const element = parent.querySelector<HTMLElement>(selector);
    expect(element, selector).not.toBeNull();
    await act(async () => element!.click());
    await settle();
  }

  async function travel(direction: "back" | "forward") {
    await act(async () => router.history[direction]());
    await settle();
  }

  it.each([false, true])("keeps /intro -> / -> project in history with auto-open=%s", async (autoOpen) => {
    localStorage.setItem("alpha-kanban.autoOpenLastWorkspace", String(autoOpen));
    await render(["/intro"]);
    await click('a[href="/"]');
    expect(router.state.location.href).toBe("/");
    expect(container.querySelector(".ak-start-page")).not.toBeNull();
    await click(".ak-project-list-row button");
    expect(container.querySelector(".ak-project-board")).not.toBeNull();
    expect(router.history.length).toBe(3);
    await travel("back");
    expect(router.state.location.href).toBe("/");
    expect(container.querySelector(".ak-start-page")).not.toBeNull();
    await travel("back");
    expect(router.state.location.pathname).toBe("/intro");
    await travel("forward");
    expect(router.state.location.href).toBe("/");
    await travel("forward");
    expect(router.state.location.href).toBe(projectHref);
    expect(container.querySelector(".ak-project-board")).not.toBeNull();
    expect(router.history.length).toBe(3);
  });

  it("auto-opens the last project only once and lets Back stay on Start", async () => {
    localStorage.setItem("alpha-kanban.autoOpenLastWorkspace", "true");
    await render(["/"]);
    expect(router.state.location.href).toBe(projectHref);
    expect(router.history.length).toBe(2);
    await travel("back");
    expect(router.state.location.href).toBe("/");
    expect(container.querySelector(".ak-start-page")).not.toBeNull();
    await settle();
    expect(router.history.length).toBe(2);
    await travel("forward");
    expect(router.state.location.href).toBe(projectHref);
    expect(localStorage.getItem("alpha-kanban.autoOpenLastWorkspace")).toBe("true");
  });

  it("pushes the Start button and project switcher without overwriting either project", async () => {
    const other = projectFixture("workspace/other", "bw_other");
    const otherDocument = documentFixture(other, "d_other");
    vi.mocked(browserRepository.workspaces).mockResolvedValue({ workspaces: [workspace, other] });
    vi.mocked(browserRepository.select).mockImplementation(async (id) => ({ workspace: id === other.id ? other : workspace }));
    vi.mocked(browserRepository.documentSets).mockImplementation(async (id) => ({ sets: buildDocumentSets([id === other.id ? otherDocument.file : response.file]) }));
    vi.mocked(browserRepository.tickets).mockImplementation(async (id) => id === other.id ? otherDocument : response);
    await render([documentHref]);
    await click('[data-tour="project-switcher"]');
    await click(`button[title="${other.root}"]`, document);
    expect(router.state.location.href).toBe(buildAppRoute({ workspaceId: other.id }));
    expect(container.querySelector(".ak-project-board")?.textContent).toContain(`Fixture ${other.id}`);
    await travel("back");
    expect(router.state.location.href).toBe(documentHref);
    expect(container.querySelector(".ak-project-board")?.textContent).toContain(`Fixture ${workspace.id}`);
    await travel("forward");
    await click("main > header > button");
    expect(router.state.location.href).toBe("/");
    expect(router.history.length).toBe(3);
    await travel("back");
    expect(router.state.location.href).toBe(buildAppRoute({ workspaceId: other.id }));
  });

  it("restores document, Markdown and guide views without extra history entries", async () => {
    await render([projectHref]);
    expect(router.history.length).toBe(1);
    await click('nav button[title="docs/01_test_tickets.md"]');
    expect(router.state.location.href).toBe(documentHref);
    await click('nav button[title="docs/01_test_tickets.md"]');
    expect(router.history.length).toBe(2);
    await click('[data-tour="document-view"] button:last-child');
    expect(container.querySelector(".ak-markdown")?.textContent).toContain("Ticket source");
    const markdownHref = `${documentHref}&view=markdown`;
    expect(router.state.location.href).toBe(markdownHref);
    await click("aside [data-tour-help]");
    expect(router.state.location.href).toBe(guideHref);
    expect(container.querySelector(".ak-project-guide")).not.toBeNull();
    await travel("back");
    expect(router.state.location.href).toBe(markdownHref);
    expect(container.querySelector(".ak-markdown")).not.toBeNull();
    await travel("back");
    expect(router.state.location.href).toBe(documentHref);
    expect(container.querySelector(".ak-project-board")).not.toBeNull();
    await travel("forward");
    await travel("forward");
    expect(router.state.location.href).toBe(guideHref);
    await act(async () => { await setLanguage("en"); });
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ["document-sets", workspace.id] }); });
    await settle();
    expect(container.querySelector("#workspace-title")?.textContent).toBe("Usage guide");
    expect(router.history.length).toBe(4);
    expect(router.state.location.href).toBe(guideHref);
  });

  it("restores a deep-linked ticket before sidebar discovery and through Back/Forward", async () => {
    const ticketHref = buildAppRoute({ workspaceId: workspace.id, filePath: response.file.id, ticketId: "TEST-01", detailMode: "modal" });
    vi.mocked(browserRepository.documentSets).mockImplementation(() => new Promise(() => {}));
    await render(["/", ticketHref]);
    expect(document.querySelector(".ak-ticket-detail-shell")?.getAttribute("data-mode")).toBe("modal");
    expect(router.history.length).toBe(2);
    await travel("back");
    expect(router.state.location.href).toBe("/");
    expect(container.querySelector(".ak-start-page")).not.toBeNull();
    expect(document.querySelector(".ak-ticket-detail-shell")).toBeNull();
    await travel("forward");
    expect(router.state.location.href).toBe(ticketHref);
    expect(document.querySelector(".ak-ticket-detail-shell")?.getAttribute("data-mode")).toBe("modal");
    expect(router.history.length).toBe(2);
  });

  it("keeps ticket drafts through view-mode history, restore peek and language changes", async () => {
    const ticketHref = buildAppRoute({ workspaceId: workspace.id, filePath: response.file.id, ticketId: "TEST-01", detailMode: "modal" });
    await render([documentHref, ticketHref]);
    const draft = document.querySelector<HTMLTextAreaElement>('[role="dialog"] form textarea')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(draft, "Keep my draft");
      draft.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click('button[aria-label="티켓 전체 화면으로 보기"]', document);
    expect(router.state.location.hash).toContain("detail=full");
    expect(document.querySelector(".ak-ticket-detail-shell")?.getAttribute("data-mode")).toBe("full");
    await travel("back");
    expect(router.state.location.href).toBe(ticketHref);
    expect(document.querySelector(".ak-ticket-detail-shell")?.getAttribute("data-mode")).toBe("modal");
    expect(draft.isConnected).toBe(true);
    expect(draft.value).toBe("Keep my draft");
    await travel("forward");
    await click('button[aria-label="이전 티켓 보기로 복원"]', document);
    expect(router.state.location.href).toBe(ticketHref);
    await act(async () => { await setLanguage("en"); });
    expect(draft.isConnected).toBe(true);
    expect(draft.value).toBe("Keep my draft");
    expect(localStorage.getItem("alpha-kanban.ticketDetailMode")).toBe("modal");
    expect(router.history.length).toBe(4);
  });

  it("opens and closes ticket details with reversible navigation", async () => {
    await render([documentHref]);
    await click('[data-tour="board-card"] button');
    expect(router.state.location.hash).toContain("ticket=TEST-01");
    expect(document.querySelector(".ak-ticket-detail-shell")).not.toBeNull();
    await travel("back");
    expect(router.state.location.href).toBe(documentHref);
    expect(document.querySelector(".ak-ticket-detail-shell")).toBeNull();
    await travel("forward");
    await click('button[aria-label="티켓 상세 닫기"]', document);
    expect(router.state.location.href).toBe(documentHref);
    expect(document.querySelector(".ak-ticket-detail-shell")).toBeNull();
    expect(router.history.length).toBe(3);
  });

  it("returns to All tickets from a project shortcut and restores its ticket on Forward", async () => {
    await render(["/all"]);
    await click('[data-tour="ticket-project"]');
    const href = router.state.location.href;
    expect(href).toBe(buildAppRoute({ workspaceId: workspace.id, filePath: response.file.id, ticketId: "TEST-01", detailMode: "side" }));
    expect(document.querySelector(".ak-ticket-detail-shell")).not.toBeNull();
    await travel("back");
    expect(router.state.location.href).toBe("/all");
    expect(container.querySelector('[data-tour="ticket-project"]')).not.toBeNull();
    await travel("forward");
    expect(router.state.location.href).toBe(href);
    expect(document.querySelector(".ak-ticket-detail-shell")).not.toBeNull();
    expect(router.history.length).toBe(2);
  });

  it("keeps the default document selected when sidebar ordering changes without writing the URL", async () => {
    await render([projectHref]);
    const reads = vi.mocked(browserRepository.markdown).mock.calls.length;
    const earlierFile = { ...response.file, id: "d_earlier", sequenceNumber: 0, filename: "00_earlier_plan.md", type: "plan" as const, slug: "earlier" };
    await act(async () => {
      queryClient.setQueryData(["document-sets", workspace.id], { sets: buildDocumentSets([earlierFile, response.file]) });
    });
    await settle();
    expect(container.querySelector(".ak-project-board")).not.toBeNull();
    expect(browserRepository.markdown).toHaveBeenCalledTimes(reads);
    expect(browserRepository.markdown).not.toHaveBeenCalledWith(workspace.id, earlierFile.id);
    expect(router.state.location.href).toBe(projectHref);
    expect(router.history.length).toBe(1);
  });

  it.each(["missing-ticket", "markdown-view", "non-ticket-document"])("ignores an unavailable detail without rewriting its deep link (%s)", async (kind) => {
    const href = buildAppRoute({
      workspaceId: workspace.id, filePath: response.file.id,
      ticketId: kind === "missing-ticket" ? "MISSING-01" : "TEST-01",
      ticketViewMode: kind === "markdown-view" ? "markdown" : "board",
    });
    if (kind === "non-ticket-document") {
      const file = { ...response.file, type: "plan" as const };
      vi.mocked(browserRepository.file).mockResolvedValue(file);
      vi.mocked(browserRepository.documentSets).mockResolvedValue({ sets: buildDocumentSets([file]) });
      queryClient.setQueryData(["ticket-document", workspace.id, file.id], response);
    }
    await render([href]);
    expect(document.querySelector(".ak-ticket-detail-shell")).toBeNull();
    expect(container.querySelector(kind === "missing-ticket" ? ".ak-project-board" : ".ak-markdown")).not.toBeNull();
    expect(router.state.location.href).toBe(href);
    expect(router.history.length).toBe(1);
  });
});
