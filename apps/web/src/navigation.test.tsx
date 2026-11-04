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
import { browserRepository, browserLinkMappings } from "./browser/repository";
import { setLanguage } from "./i18n";
import { FakeDirectory, MemoryStorage, testLocks } from "./browser/browserFixtures";
import { LinkMappings } from "./browser/linkMappings";
import { linkedRoute } from "./browser/linkedNavigation";
import { appActivity } from "./pwa/activity";

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
    const element = await ready<HTMLElement>(selector, parent);
    await act(async () => element!.click());
    await settle();
  }

  async function ready<T extends Element = HTMLElement>(selector: string, parent: ParentNode = container) {
    await vi.waitFor(async () => {
      await settle();
      expect(parent.querySelector(selector), selector).not.toBeNull();
    });
    return parent.querySelector<T>(selector)!;
  }

  async function travel(direction: "back" | "forward") {
    await act(async () => router.history[direction]());
    await settle();
  }

  it.each(["", "#skill", "#updates", "?source=guide#updates", "/#skill"])("redirects /intro%s without losing the destination or adding a history entry", async suffix => {
    localStorage.setItem("alpha-kanban.autoOpenLastWorkspace", "true");
    await render(["/docs", "/intro" + suffix]);
    await ready(".ak-intro-page");
    expect(router.state.location.href).toBe("/about" + suffix.replace(/^\//, ""));
    expect(router.history.length).toBe(2);
    expect(browserRepository.workspaces).not.toHaveBeenCalled();
    expect(browserRepository.subscribe).not.toHaveBeenCalled();
    await travel("back");
    expect(router.state.location.pathname).toBe("/docs");
    await travel("forward");
    expect(router.state.location.pathname).toBe("/about");
    expect(router.history.length).toBe(2);
  });

  it("keeps GitHub in the common footer and the four page links in the header in both languages", async () => {
    await render(["/about"]);
    const link = container.querySelector<HTMLAnchorElement>('.ak-site-footer a[href="https://github.com/KOR-Believer/alpha-kanban"]');
    expect(link).not.toBeNull();
    expect(container.querySelector('.ak-intro-header nav a[href="/docs"]')).not.toBeNull();
    const links = [...container.querySelectorAll<HTMLAnchorElement>(".ak-site-navigation a")];
    expect(links.map(item => item.getAttribute("href"))).toEqual(["/", "/docs", "/releases", "/about"]);
    expect(links.map(item => item.textContent)).toEqual(["칸반", "공식 문서", "릴리즈", "소개"]);
    expect(links.at(-1)?.getAttribute("aria-current")).toBe("page");
    expect(container.querySelector(".ak-intro-header a[href^='#']")).toBeNull();
    expect(container.querySelectorAll(".ak-site-footer a")).toHaveLength(1);
    expect(link!.textContent).toBe("GitHub");
    expect(link!.target).toBe("_blank");
    expect(link!.relList.contains("noopener")).toBe(true);
    expect(link!.relList.contains("noreferrer")).toBe(true);
    expect(link!.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(link!.getAttribute("aria-label")).toBe("GitHub에서 Alpha Kanban 저장소 열기 (새 탭)");

    await act(async () => setLanguage("en"));
    expect(link!.getAttribute("aria-label")).toBe("Open Alpha Kanban on GitHub (opens in a new tab)");
    expect(link!.textContent).toBe("GitHub");
    expect(link!.isConnected).toBe(true);
    expect(links.map(item => item.textContent)).toEqual(["Kanban", "Documentation", "Releases", "About"]);
    expect(router.state.location.pathname).toBe("/about");
    expect(router.history.length).toBe(1);
  });

  it.each([false, true])("keeps /about -> / -> project in history with auto-open=%s", async (autoOpen) => {
    localStorage.setItem("alpha-kanban.autoOpenLastWorkspace", String(autoOpen));
    await render(["/about"]);
    await click('a[href="/"]');
    expect(router.state.location.href).toBe("/");
    expect(container.querySelector(".ak-start-page")).not.toBeNull();
    await click(".ak-project-list-row a");
    expect(container.querySelector(".ak-project-board")).not.toBeNull();
    expect(router.history.length).toBe(3);
    await travel("back");
    expect(router.state.location.href).toBe("/");
    expect(container.querySelector(".ak-start-page")).not.toBeNull();
    await travel("back");
    expect(router.state.location.pathname).toBe("/about");
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
    await click(`a[title="${other.root}"]`, document);
    expect(router.state.location.href).toBe(buildAppRoute({ workspaceId: other.id }));
    expect(container.querySelector(".ak-project-board")?.textContent).toContain(`Fixture ${other.id}`);
    await travel("back");
    expect(router.state.location.href).toBe(documentHref);
    expect(container.querySelector(".ak-project-board")?.textContent).toContain(`Fixture ${workspace.id}`);
    await travel("forward");
    await click("main > header > a");
    expect(router.state.location.href).toBe("/");
    expect(router.history.length).toBe(3);
    await travel("back");
    expect(router.state.location.href).toBe(buildAppRoute({ workspaceId: other.id }));
  });

  it("restores document, Markdown and guide views without extra history entries", async () => {
    await render([projectHref]);
    expect(router.history.length).toBe(1);
    await click('nav a[title="docs/01_test_tickets.md"]');
    expect(router.state.location.href).toBe(documentHref);
    await click('nav a[title="docs/01_test_tickets.md"]');
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
    const draft = await ready<HTMLTextAreaElement>('[role="dialog"] form textarea', document);
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
    await click('[data-tour="board-card"] a');
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
    await ready(".ak-ticket-detail-shell", document);
    await travel("back");
    expect(router.state.location.href).toBe("/all");
    expect(container.querySelector('[data-tour="ticket-project"]')).not.toBeNull();
    await travel("forward");
    expect(router.state.location.href).toBe(href);
    await vi.waitFor(async () => {
      await settle();
      expect(document.querySelector(".ak-ticket-detail-shell")).not.toBeNull();
    }, { timeout: 5000, interval: 10 });
    expect(router.history.length).toBe(2);
  });

  it("keeps the default document selected when sidebar ordering changes without writing the URL", async () => {
    await render([projectHref]);
    await ready(".ak-project-board");
    await vi.waitFor(async () => { await settle(); expect(queryClient.isFetching()).toBe(0); });
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

  it("preserves the source ticket draft through connected pages and confirms leaving its source", async () => {
    const target = new FakeDirectory("target"); target.file("linked.md", "# Linked page\n\nRead only\n");
    const service = new LinkMappings(new MemoryStorage(), async () => [], { lock: testLocks() });
    const context = { scopeId: workspace.id, label: workspace.label, root: new FakeDirectory("source").handle(), path: "docs/source.md", documentId: response.file.id };
    const attempt = await service.attempt(context, "/old/target/linked.md");
    const opened = await service.save(context, attempt.location, "/old/target", { handle: target.handle(), label: "target" });
    for (const method of ["document", "openDocument"] as const) vi.spyOn(browserLinkMappings, method).mockImplementation(service[method].bind(service) as never);
    const source = buildAppRoute({ workspaceId: workspace.id, filePath: response.file.id, ticketId: "TEST-01" });
    await render([source]);
    const input = document.querySelector<HTMLTextAreaElement>('textarea')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "Keep this draft");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(appActivity.unloadRisk).toBe(true);
    await act(async () => { await router.navigate({ href: linkedRoute(source, opened.context.documentId) }); }); await settle();
    expect(document.querySelector('.ak-ticket-detail-shell')).toBeNull();
    expect(container.querySelector('[data-linked-document]')?.textContent).toContain("Linked page");
    expect(appActivity.unloadRisk).toBe(true); expect(appActivity.prepare()).toBe(false);
    await travel("back");
    expect(document.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe("Keep this draft");
    expect(router.state.location.href).toBe(source);
    expect(appActivity.unloadRisk).toBe(true);
    await travel("forward");
    const linkedHref = router.state.location.href;
    await act(async () => { void router.navigate({ href: "/" }); }); await settle();
    expect(router.state.location.href).toBe(linkedHref);
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("작성 중인 내용을 버릴까요?");
    const cancel = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find((button) => button.textContent === "취소")!;
    await act(async () => cancel.click()); await settle();
    expect(router.state.location.href).toBe(linkedHref);
    await travel("back");
    expect(document.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe("Keep this draft");
    await travel("forward");
    await act(async () => { void router.navigate({ href: "/" }); }); await settle();
    const discard = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find((button) => button.textContent === "버리고 이동")!;
    await act(async () => discard.click()); await settle();
    expect(router.state.location.href).toBe("/");
    expect(appActivity.unloadRisk).toBe(false);
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
