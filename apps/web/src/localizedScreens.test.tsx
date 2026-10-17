// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { documentFixture, projectFixture } from "./allProjectsFixtures";
import { setLanguage } from "./i18n";

const route = vi.hoisted(() => ({ location: { hash: "", href: "/", pathname: "/", searchStr: "" }, navigate: vi.fn() }));
vi.mock("@tanstack/react-router", async (original) => ({
  ...await original<typeof import("@tanstack/react-router")>(),
  useNavigate: () => route.navigate, useLocation: () => route.location,
  Link: ({ to, children, ...props }: React.PropsWithChildren<{ to: string }>) => <a href={to} {...props}>{children}</a>,
}));

describe("localized application screens", () => {
  let client: QueryClient;
  let root: Root;
  let container: HTMLDivElement;
  const workspace = projectFixture("/work/example", "w_example");
  const roots = [{ label: "work", path: "/work" }];
  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected network request")));
    vi.stubGlobal("EventSource", class { addEventListener() {} close() {} });
    window.localStorage.clear();
    await setLanguage("ko");
    route.location = { hash: "", href: "/", pathname: "/", searchStr: "" };
    route.navigate.mockClear();
    client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: 0 } } });
    client.setQueryData(["health"], { status: "ok" });
    client.setQueryData(["workspaces"], { workspaces: [workspace] });
    client.setQueryData(["workspace-roots-settings"], { roots, defaultRoots: roots, hasOverride: false });
    client.setQueryData(["workspace-directories", undefined], { roots });
    container = document.createElement("div"); document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    client.clear(); container.remove(); vi.unstubAllGlobals();
  });
  const mount = () => act(async () => root.render(<QueryClientProvider client={client}><App /></QueryClientProvider>));
  function projectRoute(file?: string) {
    const pathname = `/w/${workspace.id}`;
    const searchStr = file ? `?file=${encodeURIComponent(file)}` : "";
    route.location = { pathname, searchStr, href: pathname + searchStr, hash: "" };
  }

  it("localizes Start, roots, guide and the new-project form without losing a typed name", async () => {
    await mount();
    expect(document.querySelector("h1")?.textContent).toBe("프로젝트");
    expect(document.body.textContent).toContain("프로젝트 루트");
    expect(document.body.textContent).toContain("AI와 플랜 초안 만들기");
    const create = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim() === "새 프로젝트")!;
    await act(async () => create.click());
    expect(document.body.textContent).toContain("등록된 루트 안에 새 프로젝트 폴더");
    const input = document.querySelector<HTMLInputElement>('[placeholder="my-new-project"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "my-project-원문");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await setLanguage("en");
    });
    expect(document.body.textContent).toContain("Create project");
    expect(document.querySelector('[placeholder="my-new-project"]')).toBe(input);
    expect(input.value).toBe("my-project-원문");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("localizes the empty workspace and switches without navigation or a run", async () => {
    projectRoute();
    client.setQueryData(["document-sets", workspace.id], { sets: [] });
    await mount();
    expect(document.body.textContent).toContain("아직 계획 문서가 없습니다");
    expect(document.body.textContent).toContain("서버 연결됨");
    route.navigate.mockClear();
    await act(async () => { await setLanguage("en"); });
    expect(document.body.textContent).toContain("No planning documents yet");
    expect(route.navigate).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["plan", "inventory", "markdown"] as const)("localizes %s reader chrome but leaves source Markdown untouched", async (type) => {
    const fixture = documentFixture(workspace);
    const file = { ...fixture.file, type };
    projectRoute(file.relativePath);
    client.setQueryData(["document-sets", workspace.id], { sets: [{ id: "set", workspaceId: workspace.id,
      directory: "docs", slug: "example", label: "Original document set", documents: [file], types: [type], primaryFile: file,
      ticketProgress: { doneTickets: 2, totalTickets: 3 } }] });
    client.setQueryData(["markdown-document", workspace.id, file.id], {
      file, markdown: "# Original heading\n\nStatus: DONE\n\n사용자 원문 그대로.", outline: [{ line: 1, level: 1, title: "Original heading" }],
    });
    await mount();
    expect(document.body.textContent).toContain("연관 문서");
    expect(document.body.textContent).toContain("티켓 2 / 3개 완료");
    expect(document.body.textContent).toContain("목차");
    const markdown = document.querySelector(".ak-markdown")!;
    const original = markdown.textContent;
    await act(async () => { await setLanguage("en"); });
    expect(document.body.textContent).toContain("Linked docs");
    expect(markdown.textContent).toBe(original);
    expect(markdown.textContent).toContain("Status: DONE");
    expect(fetch).not.toHaveBeenCalled();
  });
});
