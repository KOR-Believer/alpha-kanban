// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { AppRoot } from "../AppRoot";
import { partitionProjects, ProjectLists } from "../components/ProjectLauncher";
import { WorkspaceButton, WorkspaceSwitcherTrigger } from "../components/WorkspaceNavigation";
import { DEMO_TICKET, DEMO_MARKDOWN, READING_DEMO } from "../components/IntroDemoBoard";
import { AllProjectsBoard } from "../AllProjectsBoard";
import { buildAppRoute, parseAppRouteState } from "../appRoute";
import { browserRepository } from "./repository";
import { BrowserMarkdownImage } from "./MarkdownResources";
import { BrowserSkillGuide, BrowserStartPage } from "./BrowserConnections";
import { tourStorageKey } from "../onboarding/tourState";
import { ProjectGuide } from "../components/ProjectGuide";
import { setLanguage } from "../i18n";
import { projectFixture, documentFixture } from "../allProjectsFixtures";
import { buildDocumentSets } from "@alpha-kanban/shared/documents";

const routing = vi.hoisted(() => ({ location: { pathname: "/", searchStr: "", hash: "", href: "/" }, navigate: vi.fn() }));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...await importOriginal<object>(),
  useNavigate: () => routing.navigate,
  useLocation: ({ select }: { select: (location: typeof routing.location) => unknown }) => select(routing.location),
  Link: ({ to, children, ...props }: React.PropsWithChildren<{ to: string }>) => <a href={to} {...props}>{children}</a>,
}));

describe("browser mode UI boundaries", () => {
  let root: Root;
  let container: HTMLDivElement;
  let queryClient: QueryClient;
  const workspace = projectFixture("root/project", "bw_test");
  const response = documentFixture(workspace, "d_test");
  const plainFile = { ...response.file, id: "d_notes", type: "markdown" as const, slug: "notes", filename: "notes.md", relativePath: "docs/notes.md", workspaceRelativePath: "docs/notes.md" };
  const fetch = vi.fn(() => { throw new Error("Unexpected network"); });
  const eventSource = vi.fn(() => { throw new Error("Unexpected SSE"); });
  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("EventSource", eventSource);
    vi.clearAllMocks(); window.localStorage.clear();
    routing.location = { pathname: "/", searchStr: "", hash: "", href: "/" };
    await setLanguage("ko");
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([new DOMRect(0, 0, 100, 28)] as unknown as DOMRectList);
    vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => undefined);
    vi.spyOn(browserRepository, "workspaces").mockResolvedValue({ workspaces: [workspace] });
    vi.spyOn(browserRepository, "connections").mockResolvedValue([]);
    vi.spyOn(browserRepository, "recoveries").mockResolvedValue([]);
    vi.spyOn(browserRepository, "files").mockResolvedValue([response.file]);
    vi.spyOn(browserRepository, "ticketFiles").mockResolvedValue([response.file]);
    vi.spyOn(browserRepository, "file").mockResolvedValue(response.file);
    vi.spyOn(browserRepository, "tickets").mockResolvedValue(response);
    vi.spyOn(browserRepository, "markdown").mockResolvedValue({ file: response.file, markdown: "# Original document\n\nOriginal body", outline: [{ level: 1, line: 1, title: "Original document" }] });
    vi.spyOn(browserRepository, "subscribe").mockReturnValue(() => undefined);
    vi.spyOn(browserRepository, "boardOrder").mockResolvedValue({ keys: [] });
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, networkMode: "always", refetchOnWindowFocus: false } } });
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); queryClient.clear(); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  async function render(element: React.ReactNode) {
    await act(async () => { root.render(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
  }
  function selectDocument(ticketId?: string) {
    const href = buildAppRoute({ workspaceId: workspace.id, filePath: response.file.id, ticketId, detailMode: ticketId ? "modal" : undefined });
    const url = new URL(href, "http://localhost");
    routing.location = { pathname: url.pathname, searchStr: url.search, hash: url.hash.slice(1), href };
  }

  async function typeInto(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
    await act(async () => {
      const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  async function waitForElement<T extends Element>(selector: string, parent: ParentNode = container): Promise<T> {
    const deadline = Date.now() + 1_000;
    while (!parent.querySelector(selector) && Date.now() < deadline) {
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    }
    const element = parent.querySelector<T>(selector);
    expect(element, selector).not.toBeNull();
    return element!;
  }

  it.each([false, true])("keeps direct intro entry independent of auto-open=%s, folder queries and agents", async (autoOpen) => {
    localStorage.setItem("alpha-kanban.autoOpenLastWorkspace", String(autoOpen));
    vi.mocked(browserRepository.workspaces).mockResolvedValue({ workspaces: [workspace], lastWorkspaceId: workspace.id });
    routing.location = { pathname: "/intro", searchStr: "", hash: "", href: "/intro" };
    const oldTitle = document.title;
    await render(<AppRoot />);
    expect(container.querySelector("h1")?.textContent).toBe("Alpha Kanban");
    expect(document.title).toContain("같은 Markdown");
    expect(container.querySelectorAll(".ak-intro-demo-column-heading")).toHaveLength(6);
    expect(container.querySelectorAll(".ak-intro-demo-card")).toHaveLength(READING_DEMO.length);
    const demo = container.querySelector(`[data-ticket-id="${DEMO_TICKET.id}"]`)!;
    expect(demo.textContent).toContain(DEMO_TICKET.title);
    expect(demo.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe(String(DEMO_TICKET.progress));
    expect(container.querySelector("#demo-markdown pre")?.textContent).toBe(DEMO_MARKDOWN);
    expect(DEMO_MARKDOWN).toContain(`Status: ${DEMO_TICKET.status}`);
    expect(DEMO_MARKDOWN).toContain(`Progress: ${DEMO_TICKET.progress}%`);
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(container.textContent).toContain("모든 작업을 AI 채팅만으로 진행해도 됩니다");
    expect(container.textContent).not.toContain("호환 Markdown");
    expect(container.textContent).not.toContain("브라우저 로컬 모드");
    expect(container.textContent).not.toMatch(/배포·문서 형식 버전|준비 중|후속 예정|Claude/);
    expect(container.querySelector('a[href="/"]')).not.toBeNull();
    expect(browserRepository.workspaces).not.toHaveBeenCalled();
    expect(browserRepository.connections).not.toHaveBeenCalled();
    expect(browserRepository.recoveries).not.toHaveBeenCalled();
    expect(browserRepository.files).not.toHaveBeenCalled();
    expect(browserRepository.subscribe).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(eventSource).not.toHaveBeenCalled();
    expect(routing.navigate).not.toHaveBeenCalled();
    await act(async () => { await setLanguage("en"); });
    expect(container.textContent).toContain("Start with a conversation. Continue in documents.");
    expect(container.textContent).not.toMatch(/versions are being prepared|cannot inspect your installed skill|Claude/);
    expect(document.documentElement.lang).toBe("en");
    expect(browserRepository.workspaces).not.toHaveBeenCalled();
    // An explicit visit from intro is not a fresh root-page load.
    routing.location = { pathname: "/", searchStr: "", hash: "", href: "/" };
    await render(<AppRoot />);
    expect(container.querySelector("h1")?.textContent).toBe("Projects");
    expect(routing.navigate).not.toHaveBeenCalled();
    expect(document.title).toBe(oldTitle);
    expect(document.head.querySelector('meta[property="og:image"]')).toBeNull();
    expect(localStorage.getItem("alpha-kanban.autoOpenLastWorkspace")).toBe(String(autoOpen));
  });

  it.each(["/", "/intro"])("explains scoped question review before ticket implementation on %s in both languages", async (pathname) => {
    routing.location = { pathname, searchStr: "", hash: "", href: pathname };
    await render(<AppRoot />);
    const workflow = container.querySelector(".ak-document-workflow")!;
    const headings = () => [...workflow.querySelectorAll("h3")].map((heading) => heading.textContent);
    expect(headings()).toEqual(["AI와 플랜 초안 만들기", "관련 열린 질문 논의하기", "티켓 작성·갱신하기", "구현 요청하고 검토하기"]);
    expect(workflow.querySelectorAll("li")).toHaveLength(4);
    expect(workflow.textContent).toContain("이번 구현에 영향을 주는 열린 질문부터");
    expect(workflow.textContent).toContain("다음 작업에 관한 질문은 남겨둬도 됩니다");
    expect(workflow.textContent).toContain("합의한 범위와 완료 기준");
    expect(workflow.textContent).toContain("선택 사항입니다");
    await act(async () => { await setLanguage("en"); });
    expect(workflow.isConnected).toBe(true);
    expect(headings()).toEqual(["Draft a plan with your AI", "Discuss relevant open questions", "Create or update tickets", "Implement and review"]);
    expect(workflow.textContent).toContain("open questions that affect this implementation");
    expect(workflow.textContent).toContain("Questions about later work can stay open");
    expect(workflow.textContent).toContain("agreed scope and completion criteria");
    expect(workflow.textContent).toContain("Moving tickets and leaving instructions are optional");
    expect(fetch).not.toHaveBeenCalled();
    expect(eventSource).not.toHaveBeenCalled();
    expect(routing.navigate).not.toHaveBeenCalled();
  });

  it("uses real recency and deduplicates project identities", () => {
    const neverOpened = projectFixture("root/unopened", "bw_unopened");
    const projects = Array.from({ length: 7 }, (_, index) => ({ ...projectFixture(`root/${index}`, `bw_${index}`), lastOpenedAt: `2026-10-0${index + 1}T12:00:00Z` }));
    const { recent, other } = partitionProjects([...projects, neverOpened, projects[6]!]);
    expect(recent.map((item) => item.id)).toEqual(["bw_6", "bw_5", "bw_4", "bw_3", "bw_2"]);
    expect(other.map((item) => item.id)).toEqual(["bw_0", "bw_1", "bw_unopened"]);
    expect(partitionProjects([neverOpened]).recent).toEqual([]);
  });

  it.each(["empty", "direct", "root", "loading", "error", "permission"])("only offers the connection tour for a genuinely empty start (%s)", async (state) => {
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("showDirectoryPicker", vi.fn());
    vi.stubGlobal("indexedDB", {});
    vi.spyOn(navigator, "locks", "get").mockReturnValue({} as LockManager);
    if (["root", "permission"].includes(state)) vi.mocked(browserRepository.connections).mockResolvedValue([{ id: "root", kind: "root", name: "workspace", handle: {} } as never]);
    if (state === "error") vi.mocked(browserRepository.connections).mockRejectedValue(new Error("permission failure"));
    await render(<BrowserStartPage autoOpen={false} onAutoOpen={vi.fn()} onSelect={vi.fn()}
      workspaces={state === "direct" ? [workspace] : []} error={null} isLoading={state === "loading"} />);
    expect(Boolean(container.querySelector("[data-tour-offer]"))).toBe(state === "empty");
    expect(document.querySelector(".driver-popover")).toBeNull();
    expect(window.showDirectoryPicker).not.toHaveBeenCalled();
  });

  it("waits for connection discovery instead of showing a first-use offer prematurely", async () => {
    vi.stubGlobal("isSecureContext", true); vi.stubGlobal("showDirectoryPicker", vi.fn()); vi.stubGlobal("indexedDB", {});
    vi.spyOn(navigator, "locks", "get").mockReturnValue({} as LockManager);
    let resolve!: (value: []) => void;
    vi.mocked(browserRepository.connections).mockReturnValue(new Promise((done) => { resolve = done; }));
    await render(<BrowserStartPage autoOpen={false} onAutoOpen={vi.fn()} onSelect={vi.fn()} workspaces={[]} error={null} isLoading={false} />);
    expect(container.querySelector("[data-tour-offer]")).toBeNull();
    await act(async () => { resolve([]); await new Promise((done) => setTimeout(done, 20)); });
    expect(container.querySelector("[data-tour-offer]")).not.toBeNull();
  });

  it("replays from Help on the populated board and keeps all-project guidance independent", async () => {
    vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => undefined);
    vi.spyOn(browserRepository, "documentSets").mockResolvedValue({ sets: buildDocumentSets([response.file]) });
    const patch = vi.spyOn(browserRepository, "patch");
    const append = vi.spyOn(browserRepository, "append");
    selectDocument(); await render(<App />);
    const offer = await waitForElement("[data-tour-offer]");
    await act(async () => offer.querySelector<HTMLButtonElement>("button:last-child")!.click());
    expect(localStorage.getItem(tourStorageKey("project"))).toBe("dismissed");
    expect(container.querySelector("[data-tour-replay]")).toBeNull();
    await act(async () => container.querySelector<HTMLButtonElement>("[data-tour-help]")!.click());
    const replay = await waitForElement<HTMLButtonElement>("[data-tour-replay]", document);
    await act(async () => replay.click());
    const tour = await waitForElement(".ak-screen-tour", document);
    expect(tour.textContent).toContain("현재 프로젝트 전환하기");
    await act(async () => tour.querySelector<HTMLButtonElement>(".driver-popover-close-btn")!.click());
    await render(<AllProjectsBoard />);
    expect(container.querySelector("[data-tour-offer]")).not.toBeNull();
    expect(patch).not.toHaveBeenCalled(); expect(append).not.toHaveBeenCalled();
  });

  it("tours an open ticket without closing the detail or discarding an instruction draft", async () => {
    vi.spyOn(browserRepository, "documentSets").mockResolvedValue({ sets: buildDocumentSets([response.file]) });
    const patch = vi.spyOn(browserRepository, "patch");
    const append = vi.spyOn(browserRepository, "append");
    selectDocument("TEST-01"); await render(<App />);
    const draft = await waitForElement<HTMLTextAreaElement>('[role="dialog"] form textarea', document);
    await typeInto(draft, "Keep this instruction");
    const detail = document.querySelector<HTMLElement>(".ak-ticket-detail-shell")!;
    await act(async () => detail.querySelector<HTMLButtonElement>("[data-tour-replay]")!.click());
    const popover = await waitForElement(".ak-screen-tour", detail);
    expect(popover.textContent).toContain("편한 크기로 상세 보기");
    for (let index = 1; index < 6; index++) await act(async () => detail.querySelector<HTMLButtonElement>(".driver-popover-next-btn")!.click());
    expect(detail.querySelector(".ak-screen-tour")?.textContent).toContain("작업 결과와 이력 읽기");
    await act(async () => detail.querySelector<HTMLButtonElement>(".driver-popover-close-btn")!.click());
    expect(detail.isConnected).toBe(true);
    expect(draft.isConnected).toBe(true); expect(draft.value).toBe("Keep this instruction");
    expect(patch).not.toHaveBeenCalled(); expect(append).not.toHaveBeenCalled();
  });

  it("does not offer a board tour over a ticket draft or on a board without cards", async () => {
    vi.spyOn(browserRepository, "documentSets").mockResolvedValue({ sets: buildDocumentSets([response.file]) });
    selectDocument("TEST-01"); await render(<App />);
    const draft = await waitForElement<HTMLTextAreaElement>('[role="dialog"] form textarea', document);
    await typeInto(draft, "Keep this instruction");
    expect(container.querySelector("[data-tour-offer]")).toBeNull();
    expect(draft.value).toBe("Keep this instruction");
    await act(async () => root.render(null));
    queryClient.clear();
    vi.mocked(browserRepository.tickets).mockResolvedValue({ ...response, document: { ...response.document, tickets: [] } });
    selectDocument(); await render(<App />);
    expect(container.querySelector("[data-tour-offer]")).toBeNull();
  });

  it.each(["start", "project", "all"])("unifies Help on %s and opens the AI guide without navigation or document writes", async (surface) => {
    const patch = vi.spyOn(browserRepository, "patch");
    const append = vi.spyOn(browserRepository, "append");
    localStorage.setItem(`${tourStorageKey(surface as "start" | "project" | "all")}.offered`, "true");
    vi.spyOn(browserRepository, "documentSets").mockResolvedValue({ sets: buildDocumentSets([response.file]) });
    if (surface === "project") selectDocument();
    await render(surface === "start"
      ? <BrowserStartPage autoOpen={false} onAutoOpen={vi.fn()} onSelect={vi.fn()} workspaces={[]} error={null} isLoading={false} />
      : surface === "project" ? <App /> : <AllProjectsBoard />);
    expect(container.querySelectorAll("header [data-tour-help], .ak-start-navigation [data-tour-help]")).toHaveLength(1);
    expect(container.querySelector("[data-tour-replay]")).toBeNull();
    expect(container.querySelector('header a[href="/intro"], .ak-start-navigation a[href="/intro"]')).toBeNull();
    const help = container.querySelector<HTMLButtonElement>("[data-tour-help]")!;
    expect(help.textContent).toBe("도움말");
    await act(async () => { help.focus(); help.click(); });
    const menu = await waitForElement('[role="dialog"]', document);
    expect([...menu.querySelectorAll("button, a")].map((item) => item.textContent)).toEqual(["화면 둘러보기", "AI와 계획·티켓 만들기", "Alpha Kanban 소개"]);
    expect(menu.querySelector("a")?.getAttribute("href")).toBe("/intro");
    await act(async () => { await setLanguage("en"); });
    expect(help.textContent).toBe("Help");
    expect([...menu.querySelectorAll("button, a")].map((item) => item.textContent)).toEqual(["Take a quick tour", "Create plans and tickets with AI", "About Alpha Kanban"]);
    await act(async () => { await setLanguage("ko"); });
    const read = [...menu.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "AI와 계획·티켓 만들기")!;
    await act(async () => read.click());
    const guide = await waitForElement<HTMLElement>(".ak-usage-guide-dialog", document);
    expect(guide.getAttribute("role")).toBe("dialog");
    expect(guide.querySelectorAll(".ak-guide-step")).toHaveLength(7);
    expect(guide.textContent).toContain("토론 모드로 진행하자");
    expect(guide.textContent).toContain("선행 관계를 지키면서 티켓을 순서대로 구현");
    expect(document.querySelector(".driver-overlay")).toBeNull();
    await act(async () => { await setLanguage("en"); });
    expect(guide.isConnected).toBe(true);
    expect(guide.textContent).toContain("Read the draft yourself");
    const close = [...guide.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Close")!;
    await act(async () => { close.click(); await new Promise((resolve) => setTimeout(resolve, 30)); });
    expect(document.querySelector(".ak-usage-guide-dialog")).toBeNull();
    expect(document.activeElement).toBe(help);
    expect(localStorage.getItem(tourStorageKey("start"))).toBeNull();
    expect(localStorage.getItem(tourStorageKey("board"))).toBeNull();
    expect(routing.navigate).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled(); expect(append).not.toHaveBeenCalled();
  });

  it.each([false, true])("preserves auto-open=%s on a fresh root-page load", async (autoOpen) => {
    localStorage.setItem("alpha-kanban.autoOpenLastWorkspace", String(autoOpen));
    vi.mocked(browserRepository.workspaces).mockResolvedValue({ workspaces: [workspace], lastWorkspaceId: workspace.id });
    vi.spyOn(browserRepository, "documentSets").mockResolvedValue({ sets: [] });
    await render(<AppRoot />);
    expect(Boolean(container.querySelector(".ak-start-page"))).toBe(!autoOpen);
    expect(Boolean(container.querySelector('[aria-label="프로젝트 문서"]'))).toBe(autoOpen);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("searches and sorts cached lists, retains reconnect and tab/search state across language changes", async () => {
    const onSelect = vi.fn().mockResolvedValue(undefined);
    const projects = [
      { ...projectFixture("root/recent", "bw_recent"), lastOpenedAt: "2026-10-18T01:00:00Z" },
      projectFixture("root/zulu", "bw_zulu"), projectFixture("root/alpha", "bw_alpha"),
      { ...projectFixture("root/missing", "bw_missing"), isAvailable: false },
    ];
    await render(<ProjectLists workspaces={projects} onSelect={onSelect} reconnect={() => <button>Reconnect fixture</button>} />);
    const other = container.querySelector('section[aria-label="다른 프로젝트"]')!;
    const input = other.querySelector<HTMLInputElement>('input[type="search"]')!;
    const select = other.querySelector<HTMLButtonElement>('[role="combobox"]')!;
    expect(input.classList.contains("h-9")).toBe(true);
    expect(select.getAttribute("data-size")).toBe("field");
    expect(select.classList.contains("h-9")).toBe(true);
    expect(select.classList.contains("ak-control-field")).toBe(true);
    expect(select.classList.contains("rounded-2xl")).toBe(false);
    await act(async () => { select.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })); });
    const name = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((item) => item.textContent === "이름순")!;
    await act(async () => { name.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    expect([...other.querySelectorAll<HTMLButtonElement>("button[title]")].map((item) => item.title)).toEqual(["root/alpha", "root/missing", "root/zulu"]);
    expect(other.querySelector<HTMLButtonElement>('[title="root/missing"]')!.disabled).toBe(true);
    expect(other.textContent).toContain("Reconnect fixture");
    await typeInto(input, "alpha");
    expect(other.querySelectorAll("button[title]")).toHaveLength(1);
    await act(async () => container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1]!.click());
    await act(async () => { await setLanguage("en"); });
    expect(input.value).toBe("alpha");
    expect(other.getAttribute("data-mobile-active")).toBe("true");
    await act(async () => other.querySelector<HTMLButtonElement>('[title="root/alpha"]')!.click());
    expect(onSelect).toHaveBeenCalledWith("bw_alpha");
    await typeInto(input, "not-present");
    expect(other.textContent).toContain("No matching projects");
    expect(container.querySelector('section[aria-label="Recent projects"]')!.textContent).toContain("recent");
    expect(browserRepository.workspaces).not.toHaveBeenCalled();
    expect(browserRepository.files).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    { hasDocs: true, isAvailable: true, label: "문서 있음", background: "bg-primary" },
    { hasDocs: false, isAvailable: true, label: "문서 없음", background: "bg-muted" },
    { hasDocs: true, isAvailable: false, label: "접근 불가", background: "bg-[var(--ak-warning-soft)]" },
    { hasDocs: false, isAvailable: false, label: "접근 불가", background: "bg-[var(--ak-warning-soft)]" },
  ])("shares $label badge colors across project lists and the switcher (docs=$hasDocs)", async ({ hasDocs, isAvailable, label, background }) => {
    const project = { ...workspace, hasDocs, isAvailable };
    await render(<>
      <WorkspaceButton workspace={project} isSelected={false} onSelect={vi.fn()} />
      <WorkspaceSwitcherTrigger workspace={project} onClick={vi.fn()} />
    </>);
    const badges = container.querySelectorAll("span.rounded-full");
    expect(badges).toHaveLength(2);
    for (const badge of badges) {
      expect(badge.textContent).toBe(label);
      expect(badge.classList.contains(background)).toBe(true);
    }
  });

  it("filters cached sidebar groups in a popover without navigation, rereading files or losing a ticket draft", async () => {
    selectDocument("TEST-01");
    const plain = { ...response.file, id: "d_notes", type: "markdown" as const, slug: "notes", filename: "notes.md", relativePath: "docs/notes.md", workspaceRelativePath: "docs/notes.md" };
    const sets = buildDocumentSets([response.file, plain]).map((set) => set.slug === response.file.slug ? { ...set, ticketProgress: { doneTickets: 1, totalTickets: 1 } } : set);
    vi.spyOn(browserRepository, "documentSets").mockResolvedValue({ sets });
    await render(<App />);
    const search = container.querySelector<HTMLInputElement>('[role="searchbox"]')!;
    const nav = container.querySelector('nav[aria-label="문서"]')!;
    const draft = await waitForElement<HTMLTextAreaElement>('[role="dialog"] form textarea', document);
    await typeInto(draft, "Keep my instructions");
    const reads = { sets: vi.mocked(browserRepository.documentSets).mock.calls.length, files: vi.mocked(browserRepository.files).mock.calls.length, tickets: vi.mocked(browserRepository.tickets).mock.calls.length, markdown: vi.mocked(browserRepository.markdown).mock.calls.length };
    const trigger = container.querySelector<HTMLButtonElement>('[aria-label="문서 필터"]')!;
    await act(async () => trigger.click());
    const filters = document.querySelector<HTMLElement>('[role="dialog"][aria-label="문서 필터"]')!;
    expect(filters).not.toBeNull();
    const checkboxes = filters.querySelectorAll<HTMLButtonElement>('[role="checkbox"]');
    expect(checkboxes).toHaveLength(2);
    await act(async () => checkboxes[1]!.click());
    expect(nav.textContent).not.toContain("notes");
    expect(nav.textContent).toContain("test");
    await typeInto(search, "no-match");
    expect(nav.children).toHaveLength(0);
    expect(container.textContent).toContain("조건에 맞는 문서가 없습니다");
    await typeInto(search, "");
    await act(async () => checkboxes[0]!.click());
    expect(nav.children).toHaveLength(0);
    expect(trigger.title).toBe("문서 필터 (2개 적용)");
    expect(JSON.parse(localStorage.getItem("alpha-kanban.documentFilters")!)).toEqual({ hidePlainMarkdown: true, hideCompletedSets: true });
    await act(async () => { await setLanguage("en"); });
    expect(filters.textContent).toContain("Hide completed sets (100%)");
    expect(search.placeholder).toBe("Search documents");
    expect(draft.isConnected).toBe(true);
    expect(draft.value).toBe("Keep my instructions");
    expect(container.querySelector(".ak-project-board")?.textContent).toContain("TEST-01");
    expect(routing.navigate).not.toHaveBeenCalled();
    expect(browserRepository.documentSets).toHaveBeenCalledTimes(reads.sets);
    expect(browserRepository.files).toHaveBeenCalledTimes(reads.files);
    expect(browserRepository.tickets).toHaveBeenCalledTimes(reads.tickets);
    expect(browserRepository.markdown).toHaveBeenCalledTimes(reads.markdown);
    const reset = [...filters.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Reset")!;
    await act(async () => reset.click());
    expect(nav.children).toHaveLength(2);
  });

  it("restores display preferences without replacing a directly opened plain document", async () => {
    selectDocument();
    localStorage.setItem("alpha-kanban.documentFilters", JSON.stringify({ hidePlainMarkdown: true, hideCompletedSets: false }));
    const file = { ...response.file, type: "markdown" as const };
    vi.mocked(browserRepository.file).mockResolvedValue(file);
    vi.mocked(browserRepository.markdown).mockResolvedValue({ file, markdown: "# Still open", outline: [] });
    vi.spyOn(browserRepository, "documentSets").mockResolvedValue({ sets: buildDocumentSets([file]) });
    await render(<App />);
    expect(container.querySelector('nav[aria-label="문서"]')!.children).toHaveLength(0);
    expect((await waitForElement(".ak-markdown")).textContent).toContain("Still open");
    expect(routing.navigate).not.toHaveBeenCalled();
    const reset = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "필터 초기화")!;
    await act(async () => reset.click());
    expect(container.querySelector('nav[aria-label="문서"]')!.children).toHaveLength(1);
  });

  it("uses the shared full-width name/path/status project trigger", async () => {
    selectDocument();
    vi.spyOn(browserRepository, "documentSets").mockResolvedValue({ sets: buildDocumentSets([response.file]) });
    await render(<App />);
    const trigger = container.querySelector<HTMLButtonElement>('header button[aria-label="프로젝트 전환"]')!;
    expect(trigger).not.toBeNull();
    expect(trigger.classList.contains("w-full")).toBe(true);
    expect(trigger.textContent).toContain(workspace.label);
    expect(trigger.textContent).toContain(workspace.root);
    expect(trigger.textContent).toContain("문서 있음");
    await act(async () => trigger.click());
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("이 브라우저에 연결된 폴더");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps recent and other connected projects in disjoint lists on Start", async () => {
    const workspaces = Array.from({ length: 7 }, (_, index) => ({ ...projectFixture(`root/project-${index}`, `bw_${index}`), lastOpenedAt: `2026-10-${String(index + 1).padStart(2, "0")}T12:00:00Z` }));
    vi.mocked(browserRepository.workspaces).mockResolvedValue({ workspaces });
    await render(<App />);
    expect(container.querySelector("h1")?.textContent).toBe("프로젝트");
    const section = container.querySelector<HTMLElement>('section[aria-label="최근 프로젝트"]')!;
    const recent = [...section.querySelectorAll<HTMLButtonElement>("button[title]")].filter((button) => !button.closest("details"));
    expect(recent.map((button) => button.title)).toEqual(["root/project-6", "root/project-5", "root/project-4", "root/project-3", "root/project-2"]);
    const other = container.querySelector('section[aria-label="다른 프로젝트"]')!;
    expect(other.querySelectorAll("button[title]")).toHaveLength(2);
    expect(container.querySelectorAll(".ak-project-list-scroll")).toHaveLength(2);
    expect(container.querySelectorAll("aside")).toHaveLength(0);
    expect(container.textContent).toContain("설치 요청문 확인·복사");
    await act(async () => container.querySelector<HTMLElement>('[role="checkbox"]')!.click());
    expect(routing.navigate).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["tickets", "plan", "inventory", "markdown"] as const)("opens a selected %s before the sidebar, retaining it when the list arrives", async (type) => {
    selectDocument();
    const file = { ...response.file, type };
    vi.mocked(browserRepository.file).mockResolvedValue(file);
    vi.mocked(browserRepository.markdown).mockResolvedValue({ file, markdown: "# Original document\n\nOriginal body", outline: [{ level: 1, line: 1, title: "Original document" }] });
    let finish!: (value: Awaited<ReturnType<typeof browserRepository.documentSets>>) => void;
    vi.spyOn(browserRepository, "documentSets").mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await render(<App />);
    expect(browserRepository.file).toHaveBeenCalledWith(workspace.id, file.id);
    await waitForElement(type === "tickets" ? ".ak-project-board" : ".ak-markdown");
    const content = () => type === "tickets" ? container.querySelector(".ak-project-board") : container.querySelector(".ak-markdown");
    expect(content()?.textContent).toContain(type === "tickets" ? "TEST-01" : "Original body");
    expect(container.querySelector('aside[aria-label]')?.textContent).toContain("문서 불러오는 중");
    const opened = content();
    const another = { ...file, id: "d_other", slug: "another", relativePath: "another.md" };
    await act(async () => { finish({ sets: buildDocumentSets([another, file]) }); });
    await render(<App />);
    expect(content()).toBe(opened);
    expect(container.querySelector('aside[aria-label]')?.textContent).not.toContain("문서 불러오는 중");
    expect(routing.navigate).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps an open ticket and its draft when sidebar refresh fails", async () => {
    selectDocument("TEST-01");
    vi.spyOn(browserRepository, "documentSets").mockImplementation(() => new Promise(() => {}));
    await render(<App />);
    const textarea = document.querySelector<HTMLTextAreaElement>('[role="dialog"] form textarea')!;
    expect(textarea).not.toBeNull();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, "Keep this draft");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await queryClient.cancelQueries({ queryKey: ["document-sets", workspace.id] });
    vi.mocked(browserRepository.documentSets).mockRejectedValue(new Error("Unrelated Markdown read failed"));
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ["document-sets", workspace.id] }); });
    await render(<App />);
    expect(container.querySelector(".ak-project-board")?.textContent).toContain("TEST-01");
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(textarea.isConnected).toBe(true);
    expect(textarea.value).toBe("Keep this draft");
    expect(container.textContent).toContain("문서를 불러오지 못했습니다");
    expect(routing.navigate).not.toHaveBeenCalled();
  });

  it("shows a missing deep-linked document without waiting for the sidebar or choosing a replacement", async () => {
    selectDocument();
    vi.mocked(browserRepository.file).mockRejectedValue(new Error("Selected document removed"));
    vi.spyOn(browserRepository, "documentSets").mockImplementation(() => new Promise(() => {}));
    await render(<App />);
    expect(container.textContent).toContain("Selected document removed");
    expect(browserRepository.tickets).not.toHaveBeenCalled();
    expect(routing.navigate).not.toHaveBeenCalled();
  });
  it("renders Start and external skill guidance without health, Codex, workspace API or SSE requests", async () => {
    await render(<App />);
    expect(container.textContent).toContain("설치 요청문 확인·복사");
    expect(container.textContent).toContain("프로젝트 열기");
    expect(fetch).not.toHaveBeenCalled(); expect(eventSource).not.toHaveBeenCalled();
    const control = container.querySelector<HTMLElement>('[role="checkbox"]')!;
    await act(async () => control.click());
    expect(routing.navigate).not.toHaveBeenCalled();
  });
  it("reads the all-projects board through local adapters, not server endpoints", async () => {
    await render(<AllProjectsBoard />);
    expect(container.textContent).toContain("TEST-01");
    expect(browserRepository.ticketFiles).toHaveBeenCalledWith(workspace.id);
    expect(browserRepository.files).not.toHaveBeenCalled();
    expect(browserRepository.tickets).toHaveBeenCalledWith(workspace.id, response.file.id, false);
    expect(fetch).not.toHaveBeenCalled(); expect(eventSource).not.toHaveBeenCalled();
  });
  it("reviews an installation request before copying and preserves the open guide across languages", async () => {
    await render(<BrowserSkillGuide />);
    const button = container.querySelector<HTMLButtonElement>("button")!;
    expect(button.textContent).toBe("설치 요청문 확인·복사");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector('a[href="/downloads/INSTALL.txt"]')).toBeNull();
    await act(async () => button.click());
    const guide = document.querySelector<HTMLElement>('[role="dialog"]')!;
    const request = guide.querySelector("textarea")!;
    expect(request.value).toContain("개인 스킬과 비교");
    expect(request.value).toContain("github.com/KOR-Believer/alpha-kanban/tree/master/skills/implementation-ledger");
    expect(guide.querySelectorAll("li")).toHaveLength(4);
    expect(guide.textContent).toContain("~/.codex/skills/implementation-ledger/");
    expect(guide.textContent).toContain("$CODEX_HOME/skills/implementation-ledger/");
    expect(guide.textContent).toContain("이번 작업에 영향을 주는 열린 질문을 논의하고 티켓을 작성하거나 갱신");
    expect(guide.textContent).not.toContain("\uFFFD");
    expect(document.body.textContent).not.toMatch(/배포·문서 형식 버전|준비 중|후속 예정|Claude/);
    await act(async () => { await setLanguage("en"); });
    expect(button.textContent).toBe("Review and copy install request");
    expect(guide.isConnected).toBe(true);
    expect(request.value).toContain("preserve personal changes");
    expect(guide.textContent).toContain("back it up and compare the changes");
    expect(guide.textContent).toContain("$implementation-ledger");
    expect(guide.textContent).toContain("discuss open questions that affect the work and create or update the tickets");
    expect(document.body.textContent).not.toMatch(/versions are being prepared|cannot inspect your installed skill|Claude/);
    const clipboard = vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    const copy = [...guide.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent === "Copy request")!;
    await act(async () => copy.click());
    expect(guide.textContent).toContain("Text selected. Copy it manually.");
    expect(request.selectionStart).toBe(0);
    expect(request.selectionEnd).toBe(request.value.length);
    clipboard.mockResolvedValue(undefined);
    await act(async () => copy.click());
    expect(clipboard).toHaveBeenLastCalledWith(request.value);
    expect(guide.textContent).toContain("Copied. Paste this request into your AI tool.");
    expect(routing.navigate).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("shows the skill guide in an empty project and switches its language without an API request", async () => {
    const href = buildAppRoute({ workspaceId: workspace.id });
    routing.location = { pathname: href, searchStr: "", hash: "", href };
    vi.spyOn(browserRepository, "documentSets").mockResolvedValue({ sets: [] });
    await render(<App />);
    expect(container.textContent).toContain("설치 요청문 확인·복사");
    const guide = container.querySelector(".ak-project-guide")!;
    expect(guide.querySelectorAll(".ak-guide-step")).toHaveLength(7);
    expect(guide.querySelectorAll(".ak-guide-review")).toHaveLength(2);
    expect(guide.querySelectorAll("blockquote")).toHaveLength(5);
    expect([...guide.querySelectorAll(".ak-guide-step h3")].map((heading) => heading.textContent)).toEqual([
      "아이디어부터 충분히 대화하기", "플랜·티켓 초안 요청하기", "초안은 사람이 직접 읽기", "열린 질문을 하나씩 논의하기", "결정한 내용으로 문서 갱신하기", "최종 문서 다시 확인하기", "티켓 순서대로 개발 요청하기",
    ]);
    expect(guide.textContent).toContain("후속 작업에 관한 질문까지 모두 없앨 필요는 없습니다");
    expect(guide.textContent).toContain("토론 모드로 진행하자");
    expect(guide.textContent).toContain("선행 관계를 지키면서 티켓을 순서대로 구현");
    expect(guide.textContent).toContain("보드에서 상태를 옮기거나 지시를 남기는 기능은 필요할 때만");
    await act(async () => { await setLanguage("en"); });
    expect(guide.isConnected).toBe(true);
    expect(guide.textContent).toContain("Read the draft yourself");
    expect(guide.textContent).toContain("Review the final documents");
    expect(guide.textContent).toContain("Questions about later work can stay open");
    expect(container.textContent).toContain("Review and copy install request");
    expect(container.textContent).toContain("Give your AI a shared structure for writing plans and tickets.");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("defaults to the guide with only plain Markdown, then preserves an explicit sidebar selection", async () => {
    const href = buildAppRoute({ workspaceId: workspace.id });
    routing.location = { pathname: href, searchStr: "", hash: "", href };
    vi.spyOn(browserRepository, "documentSets").mockResolvedValue({ sets: buildDocumentSets([plainFile]) });
    vi.mocked(browserRepository.markdown).mockResolvedValue({ file: plainFile, markdown: "# Notes\n\nPlain Markdown body", outline: [] });
    await render(<App />);
    expect(container.querySelector(".ak-project-guide")).not.toBeNull();
    expect(container.querySelector(".ak-markdown")).toBeNull();
    expect(browserRepository.markdown).not.toHaveBeenCalled();
    expect(browserRepository.tickets).not.toHaveBeenCalled();
    expect(routing.navigate).not.toHaveBeenCalled();

    const button = container.querySelector<HTMLButtonElement>('nav[aria-label="문서"] button[title="docs/notes.md"]')!;
    expect(button).not.toBeNull();
    await act(async () => button.click());
    const reader = await waitForElement(".ak-markdown");
    expect(reader.textContent).toContain("Plain Markdown body");
    expect(container.querySelector(".ak-project-guide")).toBeNull();
    expect(browserRepository.markdown).toHaveBeenCalledWith(workspace.id, plainFile.id);
    expect(routing.navigate).toHaveBeenLastCalledWith(expect.objectContaining({ href: buildAppRoute({ workspaceId: workspace.id, filePath: plainFile.id }) }));

    await act(async () => { await queryClient.invalidateQueries({ queryKey: ["document-sets", workspace.id] }); });
    await act(async () => { await setLanguage("en"); });
    expect(reader.isConnected).toBe(true);
    expect(container.querySelector(".ak-project-guide")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(eventSource).not.toHaveBeenCalled();
  });

  it.each(["plan", "tickets", "inventory"] as const)("still opens a %s automatically ahead of ordinary Markdown", async (type) => {
    const href = buildAppRoute({ workspaceId: workspace.id });
    routing.location = { pathname: href, searchStr: "", hash: "", href };
    const file = { ...response.file, type, sequenceNumber: 1 };
    vi.spyOn(browserRepository, "documentSets").mockResolvedValue({ sets: buildDocumentSets([{ ...plainFile, sequenceNumber: 0 }, file]) });
    vi.mocked(browserRepository.markdown).mockResolvedValue({ file, markdown: "# Planning document", outline: [] });
    await render(<App />);
    const content = await waitForElement(type === "tickets" ? ".ak-project-board" : ".ak-markdown");
    expect(content.textContent).toContain(type === "tickets" ? "TEST-01" : "Planning document");
    expect(container.querySelector(".ak-project-guide")).toBeNull();
    expect(routing.navigate).toHaveBeenLastCalledWith(expect.objectContaining({ href: buildAppRoute({ workspaceId: workspace.id, filePath: file.id }) }));
    if (type === "tickets") expect(browserRepository.tickets).toHaveBeenCalledWith(workspace.id, file.id);
    else expect(browserRepository.markdown).toHaveBeenCalledWith(workspace.id, file.id);

    await typeInto(container.querySelector<HTMLInputElement>('[role="searchbox"]')!, "no matching documents");
    expect(container.querySelector('nav[aria-label="문서"]')!.textContent).toBe("");
    expect(content.isConnected).toBe(true);
    expect(container.querySelector(".ak-project-guide")).toBeNull();
  });

  it("shows the guide when switching from a ticket project to a plain Markdown project", async () => {
    const other = projectFixture("root/notes", "bw_notes");
    const file = { ...plainFile, workspaceId: other.id };
    selectDocument();
    vi.mocked(browserRepository.workspaces).mockResolvedValue({ workspaces: [workspace, other] });
    vi.spyOn(browserRepository, "documentSets").mockImplementation(async (id) => ({ sets: buildDocumentSets(id === workspace.id ? [response.file] : [file]) }));
    await render(<App />);
    expect(container.querySelector(".ak-project-board")).not.toBeNull();

    const href = buildAppRoute({ workspaceId: other.id });
    routing.location = { pathname: href, searchStr: "", hash: "", href };
    await render(<App />);
    expect(container.querySelector(".ak-project-guide")).not.toBeNull();
    expect(container.querySelector(".ak-project-board")).toBeNull();
    expect(container.querySelector(".ak-markdown")).toBeNull();
    expect(container.querySelector('nav[aria-label="문서"] button[title="docs/notes.md"]')).not.toBeNull();
    expect(browserRepository.markdown).not.toHaveBeenCalledWith(other.id, file.id);
  });

  it.each([false, true])("returns to the guide from Markdown with planning documents=%s and can reopen the document", async (hasPlanningDocuments) => {
    const href = buildAppRoute({ workspaceId: workspace.id, filePath: plainFile.id });
    const url = new URL(href, "http://localhost");
    routing.location = { pathname: url.pathname, searchStr: url.search, hash: "", href };
    const sets = buildDocumentSets(hasPlanningDocuments ? [plainFile, response.file] : [plainFile]);
    vi.spyOn(browserRepository, "documentSets").mockResolvedValue({ sets });
    vi.mocked(browserRepository.file).mockResolvedValue(plainFile);
    vi.mocked(browserRepository.markdown).mockResolvedValue({ file: plainFile, markdown: "# Notes\n\nPlain Markdown body", outline: [] });
    const patch = vi.spyOn(browserRepository, "patch");
    const append = vi.spyOn(browserRepository, "append");
    await render(<App />);
    expect(container.querySelector(".ak-markdown")?.textContent).toContain("Plain Markdown body");
    const guideButton = [...container.querySelectorAll<HTMLButtonElement>("aside button")].find((button) => button.textContent === "사용 안내")!;
    expect(guideButton).toBeDefined();
    expect(guideButton.closest(".ak-scroll-area")).toBeNull();
    expect(guideButton.getAttribute("aria-current")).toBeNull();
    const scanCount = vi.mocked(browserRepository.documentSets).mock.calls.length;
    await act(async () => guideButton.click());
    const guide = await waitForElement(".ak-project-guide");
    expect(guideButton.getAttribute("aria-current")).toBe("page");
    expect(container.querySelector("#workspace-title")?.textContent).toBe("사용 안내");
    expect(container.querySelector(".ak-markdown")).toBeNull();
    expect(container.querySelector(".ak-project-board")).toBeNull();
    expect(container.querySelector('nav[aria-label="문서"] .ak-row-active')).toBeNull();
    expect(routing.navigate).toHaveBeenLastCalledWith(expect.objectContaining({ href: `/w/${workspace.id}?view=guide` }));
    expect(browserRepository.documentSets).toHaveBeenCalledTimes(scanCount);
    routing.location = { pathname: `/w/${workspace.id}`, searchStr: "?view=guide", hash: "", href: `/w/${workspace.id}?view=guide` };
    await render(<App />);

    await act(async () => { await queryClient.invalidateQueries({ queryKey: ["document-sets", workspace.id] }); });
    const search = container.querySelector<HTMLInputElement>('[role="searchbox"]')!;
    await typeInto(search, "not-present");
    await act(async () => { await setLanguage("en"); });
    expect(guide.isConnected).toBe(true);
    expect(guideButton.textContent).toBe("Usage guide");
    expect(container.querySelector("#workspace-title")?.textContent).toBe("Usage guide");
    expect(search.value).toBe("not-present");
    await typeInto(search, "");
    await act(async () => container.querySelector<HTMLButtonElement>('nav[aria-label="Documents"] button[title="docs/notes.md"]')!.click());
    expect((await waitForElement(".ak-markdown")).textContent).toContain("Plain Markdown body");
    expect(container.querySelector(".ak-project-guide")).toBeNull();
    expect(guideButton.getAttribute("aria-current")).toBeNull();
    expect(routing.navigate).toHaveBeenLastCalledWith(expect.objectContaining({ href }));
    expect(patch).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("restores an explicit guide URL without waiting for discovery and leaves it on a document route", async () => {
    const href = `/w/${workspace.id}?view=guide`;
    routing.location = { pathname: `/w/${workspace.id}`, searchStr: "?view=guide", hash: "", href };
    let finish!: (value: Awaited<ReturnType<typeof browserRepository.documentSets>>) => void;
    vi.spyOn(browserRepository, "documentSets").mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await render(<App />);
    expect(container.querySelector(".ak-project-guide")).not.toBeNull();
    expect(browserRepository.file).not.toHaveBeenCalled();
    expect(browserRepository.markdown).not.toHaveBeenCalled();
    expect(browserRepository.tickets).not.toHaveBeenCalled();
    await act(async () => { finish({ sets: buildDocumentSets([response.file]) }); });
    await render(<App />);
    expect(container.querySelector(".ak-project-guide")).not.toBeNull();
    expect(routing.navigate).not.toHaveBeenCalled();

    selectDocument();
    await render(<App />);
    expect(container.querySelector(".ak-project-guide")).toBeNull();
    expect(container.querySelector(".ak-project-board")).not.toBeNull();
  });

  it("keeps browser guide routes distinct from document and ticket routes", () => {
    const guide = { workspaceId: workspace.id, showGuide: true };
    expect(buildAppRoute({ ...guide, filePath: plainFile.id, ticketId: "TEST-01", ticketViewMode: "markdown" })).toBe(`/w/${workspace.id}?view=guide`);
    expect(parseAppRouteState({ pathname: `/w/${workspace.id}`, searchStr: "?view=guide", hash: "" })).toEqual(guide);
    expect(parseAppRouteState({ pathname: `/w/${workspace.id}`, searchStr: `?view=guide&doc=${plainFile.id}`, hash: "ticket=TEST-01&detail=modal" })).toEqual(guide);
    expect(parseAppRouteState({ pathname: "/", searchStr: "?view=guide" })).toEqual({});
  });

  it("copies only the selected example request and uses the current language without running AI", async () => {
    const clipboard = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    await render(<ProjectGuide />);
    const button = container.querySelector<HTMLButtonElement>('[aria-label="요청 예시 복사: 아이디어부터 충분히 대화하기"]')!;
    const request = container.querySelector("blockquote")!;
    await act(async () => button.click());
    expect(clipboard).toHaveBeenLastCalledWith(request.textContent);
    expect(request.textContent).toContain("아직 문서 작성이나 코딩은 하지 마");
    expect(container.textContent).toContain("요청문 복사됨");
    expect(clipboard).toHaveBeenCalledTimes(1);
    await act(async () => { await setLanguage("en"); });
    expect(container.textContent).not.toContain("Request copied");
    await act(async () => button.click());
    expect(clipboard).toHaveBeenLastCalledWith(request.textContent);
    expect(request.textContent).toContain("don't write documents or code yet");
    expect(container.textContent).toContain("Request copied");
    expect(fetch).not.toHaveBeenCalled();
    expect(browserRepository.workspaces).not.toHaveBeenCalled();
    expect(browserRepository.connections).not.toHaveBeenCalled();
    expect(routing.navigate).not.toHaveBeenCalled();
  });
  it("selects the example text for manual copying when clipboard access is denied", async () => {
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    await render(<ProjectGuide />);
    const button = container.querySelector<HTMLButtonElement>('[aria-label="요청 예시 복사: 플랜·티켓 초안 요청하기"]')!;
    await act(async () => button.click());
    const request = container.querySelectorAll("blockquote")[1]!;
    expect(document.activeElement).toBe(request);
    expect(window.getSelection()?.toString()).toBe(request.textContent);
    expect(container.textContent).toContain("요청문을 선택했습니다. 직접 복사해주세요");
    expect(container.textContent).not.toContain("요청문 복사됨");
    expect(fetch).not.toHaveBeenCalled();
    expect(routing.navigate).not.toHaveBeenCalled();
  });
  it("preserves a deep link while folder permission is pending", async () => {
    const href = buildAppRoute({ workspaceId: workspace.id, filePath: "d_test", ticketId: "TEST-01", detailMode: "modal" });
    const url = new URL(href, "http://localhost");
    routing.location = { pathname: url.pathname, searchStr: url.search, hash: url.hash.slice(1), href };
    vi.spyOn(browserRepository, "workspaces").mockResolvedValue({ workspaces: [{ ...workspace, isAvailable: false }] });
    vi.spyOn(browserRepository, "projectConnection").mockRejectedValue(new Error("Reconnect the original folder from Start."));
    await render(<App />);
    expect(container.textContent).toContain("다시 연결");
    expect(routing.navigate).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("uses opaque document routes and does not turn a native path into a hosted URL", () => {
    const route = buildAppRoute({ workspaceId: "bw_1", filePath: "d_abc", ticketId: "T-01", detailMode: "full" });
    expect(route).toBe("/w/bw_1?doc=d_abc#ticket=T-01&detail=full");
    expect(parseAppRouteState({ pathname: "/w/bw_1", searchStr: "?file=docs%2Fprivate_tickets.md" }).filePath).toBe("unavailable");
    expect(buildAppRoute({ filePath: "/Users/private/repo/docs/a.md" })).not.toContain("private");
  });
  it("does not load a tracking image until the user explicitly allows it", async () => {
    await render(<BrowserMarkdownImage src="https://example.invalid/tracker.png" alt="preview" />);
    expect(container.querySelector("img")).toBeNull();
    const button = container.querySelector("button")!;
    await act(async () => button.click());
    expect(container.querySelector("img")?.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(container.querySelector("img")?.src).toBe("https://example.invalid/tracker.png");
    await render(<BrowserMarkdownImage src="https://example.invalid/another.png" alt="preview" />);
    expect(container.querySelector("img")).toBeNull();
  });
});
