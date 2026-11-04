// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppRouter } from "../router";
import { browserRepository } from "../browser/repository";
import { skillRepository } from "../skills/repository";
import { setLanguage } from "../i18n";
import { english, korean } from "../i18n/messages";
import { documentId, docHref, publicDocuments, searchDocs } from "./catalog";
import { exampleAfter } from "./DocExample";

describe("public content boundary", () => {
  it.each(["stable", "canary"] as const)("resolves every public link and example anchor for %s", channel => {
    const docs = publicDocuments(channel);
    expect(docs).toHaveLength(16);
    expect(new Set(docs.map(doc => doc.id)).size).toBe(docs.length);
    const corpus = JSON.stringify(docs);
    expect(corpus).not.toMatch(/\/Users\/|sparkone|AKD-\d|AKC-\d|127\.0\.0\.1|localhost|INI/);
    for (const doc of docs) {
      expect(new Set(doc.sections.map(section => section.id)).size).toBe(doc.sections.length);
      if (exampleAfter[doc.id]) expect(doc.sections.some(section => section.id === exampleAfter[doc.id])).toBe(true);
      for (const section of doc.sections) for (const lang of ["ko", "en"] as const) {
        expect(section.title[lang].trim()).not.toBe(""); expect(section.body[lang].trim()).not.toBe("");
        for (const match of section.body[lang].matchAll(/\]\((\/docs[^)\s]*)\)/g)) {
          const url = new URL(match[1]!, "https://local.test");
          const target = docs.find(item => item.id === documentId(url.pathname));
          expect(target, match[1]).toBeDefined();
          if (url.hash) expect(target!.sections.some(item => item.id === url.hash.slice(1))).toBe(true);
        }
      }
    }
    const update = docs.find(doc => doc.id === "updates")!;
    expect(update.sections.some(section => section.id === "stable")).toBe(channel === "canary");
  });
  it("finds body-only matches, combines words, and does not include private documents", () => {
    const docs = publicDocuments("canary");
    expect(searchDocs(docs, "root notes", "en").some(result => result.href.startsWith("/docs/config"))).toBe(true);
    expect(searchDocs(docs, "Command+Shift+G", "ko")[0]?.href).toBe("/docs/updates#connect");
    expect(searchDocs(docs, "private-workspace-secret", "ko")).toEqual([]);
    expect(searchDocs(docs, "  ", "ko")).toEqual([]);
    expect(searchDocs(publicDocuments("stable"), "Canary backup", "en")).toEqual([]);
  });
});

describe("public documentation routes", () => {
  let root: Root, container: HTMLDivElement, query: QueryClient, router: ReturnType<typeof createAppRouter>;
  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("showDirectoryPicker", vi.fn(() => { throw new Error("Public guide requested a folder"); }));
    localStorage.clear(); localStorage.setItem("alpha-kanban.autoOpenLastWorkspace", "true"); await setLanguage("en");
    vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => undefined);
    vi.spyOn(browserRepository, "workspaces"); vi.spyOn(browserRepository, "documentSets"); vi.spyOn(browserRepository, "select"); vi.spyOn(browserRepository, "subscribe");
    vi.spyOn(skillRepository, "connect"); vi.spyOn(skillRepository, "apply"); vi.spyOn(skillRepository, "restore");
    query = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount()); container.remove(); router?.history.destroy(); query.clear();
    expect(browserRepository.workspaces).not.toHaveBeenCalled(); expect(browserRepository.documentSets).not.toHaveBeenCalled();
    expect(browserRepository.select).not.toHaveBeenCalled(); expect(browserRepository.subscribe).not.toHaveBeenCalled();
    expect(window.showDirectoryPicker).not.toHaveBeenCalled(); expect(skillRepository.connect).not.toHaveBeenCalled();
    expect(skillRepository.apply).not.toHaveBeenCalled(); expect(skillRepository.restore).not.toHaveBeenCalled();
    vi.restoreAllMocks(); vi.unstubAllGlobals();
  });
  async function wait(assert: () => void) {
    await vi.waitFor(async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); }); assert(); }, { timeout: 5000 });
  }
  async function render(path: string) {
    router = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
    await act(async () => { await router.load(); root.render(<QueryClientProvider client={query}><RouterProvider router={router} /></QueryClientProvider>); });
    await wait(() => expect(container.querySelector("h1")).not.toBeNull());
  }
  async function clickButton(text: string) {
    const button = [...document.querySelectorAll("button")].find(item => item.textContent === text);
    expect(button, text).toBeDefined(); await act(async () => button!.click());
  }
  async function navigate(href: string) { await act(async () => router.history.push(href)); await wait(() => expect(router.state.location.href).toBe(href)); }

  it("opens configuration directly without mounting any local workspace queries; keeps URLs and language", async () => {
    await render("/docs/config#example");
    expect(container.querySelector("h1")!.textContent).toBe(".ak.config");
    expect(router.state.location.hash).toBe("example");
    const instance = container.querySelector(".ak-docs-example");
    await clickButton("Custom document folder");
    expect(instance?.textContent).toContain("notes/planning/@alice/01_reading_plan.md");
    await act(async () => setLanguage("ko"));
    expect(container.querySelector(".ak-docs-example")).toBe(instance);
    expect(instance?.textContent).toContain("notes/planning/@alice/01_reading_plan.md");
    expect(router.state.location.href).toBe("/docs/config#example");
    await navigate("/docs/user-config");
    await act(async () => router.history.back());
    await wait(() => expect(container.querySelector("h1")!.textContent).toBe(".ak.config"));
    expect(router.state.location.hash).toBe("example");
  });
  it("handles missing and malformed article paths without opening the app", async () => {
    await render("/docs/not/a/guide"); expect(container.querySelector("h1")!.textContent).toBe("Guide not found");
    expect(container.querySelector('main a[href="/docs"]')).not.toBeNull();
    expect(documentId("/docs/%zz")).toBe("");
  });
  it("searches sections with keyboard navigation and goes to the selected anchor", async () => {
    await render("/docs");
    const trigger = container.querySelector<HTMLButtonElement>('button[title="Search documentation"]')!;
    await act(async () => trigger.click());
    const input = document.querySelector<HTMLInputElement>("#public-docs-query")!;
    expect(input).not.toBeNull();
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "owner"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    await wait(() => expect(document.querySelectorAll(".ak-docs-search-results li").length).toBeGreaterThan(1));
    const href = document.querySelectorAll<HTMLAnchorElement>(".ak-docs-search-results a")[1]!.getAttribute("href")!;
    await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    await wait(() => expect(router.state.location.href).toBe(href));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it("copies only code content and offers manual selection when clipboard fails", async () => {
    await render("/docs/config");
    const writeText = vi.fn().mockResolvedValue(undefined); Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const buttons = container.querySelectorAll<HTMLButtonElement>(".ak-docs-code button");
    await act(async () => buttons[1]!.click());
    expect(writeText).toHaveBeenCalledWith("[documents]\nroot = notes");
    writeText.mockRejectedValue(new Error("Denied"));
    await act(async () => buttons[1]!.click());
    expect(container.textContent).toContain("Text selected. Copy it manually.");
  });
  it("uses real connection controls in the example while keeping all filesystem operations inert", async () => {
    await render("/docs/updates#visual-guide");
    await clickButton("Show the state after dropping a folder");
    expect(container.textContent).toContain("Connect this folder?");
    await clickButton("Cancel selection");
    await clickButton("Choose folder");
    await clickButton("Allow access and connect");
    const apply = [...container.querySelectorAll("button")].find(button => button.textContent === "Back up and update skill")!;
    expect(apply.disabled).toBe(true);
    await act(async () => container.querySelector<HTMLButtonElement>('.ak-docs-example [role="checkbox"]')!.click());
    expect(apply.disabled).toBe(false);
    await act(async () => apply.click());
    expect(container.textContent).toContain("Example complete:");
    await clickButton("Compatibility needs review");
    expect([...container.querySelectorAll("button")].some(button => button.textContent === "Back up and update skill")).toBe(false);
  });
  it("requires preview and Apply for the maintenance example; local-links example keeps source paths", async () => {
    await render("/docs/organize");
    await clickButton("Document maintenance");
    expect(container.querySelector(".ak-code-diff")).not.toBeNull();
    expect(container.textContent).not.toContain("Example applied:");
    await clickButton("Apply reviewed changes"); expect(container.textContent).toContain("Example applied:");
    await navigate("/docs/local-links"); await clickButton("Connect only docs");
    expect(container.querySelector(".ak-docs-example")?.textContent).toContain("Only links under the old docs prefix");
    expect(container.querySelector(".ak-docs-example")?.textContent).toContain("/old-laptop/work/reports/docs/guide.md");
  });
  it("has bilingual keys for documentation controls", () => {
    for (const key of ["Documentation", "Interactive example", "Search documentation", "Next guide", "Browse documentation", "Read documentation (opens in a new tab)"]) {
      expect(korean[key]).toBeTruthy(); expect(korean[key]).not.toBe(key); expect(english[key]).toBe(key);
    }
    expect(docHref("start", "workflow")).toBe("/docs#workflow");
  });
});
