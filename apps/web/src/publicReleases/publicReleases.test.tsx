// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import stable from "../../releases.json";
import canary from "../../releases.canary.json";
import { createAppRouter } from "../router";
import { browserRepository } from "../browser/repository";
import { skillRepository } from "../skills/repository";
import { pwaClient } from "../pwa/client";
import { observeRelease, parseHistory, releaseHref, releaseTitle, unreadReleases, type ReleaseInfo } from "../pwa/releases";
import { setLanguage } from "../i18n";
import { publicDocuments } from "../publicDocs/catalog";
import { publicReleases, releaseArticle, releasePathId } from "./catalog";
import { ReleasesContent } from "./ReleasesContent";

function fixture(channel: "stable" | "canary", index?: number): ReleaseInfo {
  const history = parseHistory(channel === "stable" ? stable : canary), current = history[index ?? history.length - 1]!;
  return { ...__APP_RELEASE__, channel, history, releaseId: current.id, notes: current.notes };
}
describe("public release content boundary", () => {
  it("only lists the running channel up to its pinned release, newest date and sequence first", () => {
    const running = fixture("stable", 1);
    expect(publicReleases(running).map(row => row.sequence)).toEqual([2, 1]);
    expect(publicReleases(running, "canary")).toEqual([]);
    expect(publicReleases(fixture("canary", 0)).map(row => row.id)).toEqual(["2026-11-03-canary-baseline"]);
    expect(releaseArticle(running, "2026-11-01-document-owner-context")).toBeUndefined();
    expect(releaseArticle(running, canary[0]!.id)).toBeUndefined();
    expect(releaseArticle(fixture("canary"), stable[0]!.id)).toBeUndefined();
  });
  it.each(["stable", "canary"] as const)("keeps %s rich details explicit, bilingual and linked to real guides", channel => {
    const running = fixture(channel), docs = publicDocuments(channel);
    for (const record of publicReleases(running)) {
      expect(record.title?.ko).toBeTruthy(); expect(record.title?.en).toBeTruthy();
      const article = releaseArticle(running, record.id);
      if (!article) continue;
      for (const id of article.guides) expect(docs.some(doc => doc.id === id), id).toBe(true);
      const ids = ["changes", "skill", "related", "visual-guide", ...article.sections.map(section => section.id)];
      expect(new Set(ids).size).toBe(ids.length);
      for (const section of article.sections) for (const language of ["ko", "en"] as const) {
        expect(section.title[language].trim()).not.toBe(""); expect(section.body[language].trim()).not.toBe("");
      }
      expect(JSON.stringify(article)).not.toMatch(/\/Users\/|sparkone|AKD-\d|AKC-\d|127\.0\.0\.1|localhost/);
    }
  });
  it("preserves summary-only records and rejects unknown or malformed detail paths", () => {
    const running = fixture("stable");
    expect(releaseArticle(running, stable[0]!.id)).toBeUndefined();
    expect(publicReleases(running).some(row => row.id === stable[0]!.id)).toBe(true);
    expect(releasePathId("/releases/")).toBeNull();
    expect(releasePathId(releaseHref(stable[0]!.id))).toBe(stable[0]!.id);
    expect(releasePathId("/releases/%E0%A4%A")).toBe("");
    expect(releaseArticle(running, "unknown")).toBeUndefined();
  });
});

describe("public release pages", () => {
  let root: Root, container: HTMLDivElement, query: QueryClient, router: ReturnType<typeof createAppRouter> | undefined;
  let savedPreferences: string;
  const releasePreferences = () => JSON.stringify(Object.keys(localStorage).filter(key => key.startsWith("alpha-kanban.releases.")).sort().map(key => [key, localStorage.getItem(key)]));
  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("showDirectoryPicker", vi.fn(() => { throw new Error("Release page requested a folder"); }));
    localStorage.clear(); localStorage.setItem("alpha-kanban.autoOpenLastWorkspace", "true"); await setLanguage("en");
    savedPreferences = releasePreferences();
    vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => undefined);
    for (const method of ["workspaces", "documentSets", "select", "subscribe"] as const) vi.spyOn(browserRepository, method);
    for (const method of ["connect", "apply", "restore"] as const) vi.spyOn(skillRepository, method);
    vi.spyOn(pwaClient, "apply");
    query = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount()); container.remove(); router?.history.destroy(); router = undefined; query.clear();
    for (const method of ["workspaces", "documentSets", "select", "subscribe"] as const) expect(browserRepository[method]).not.toHaveBeenCalled();
    for (const method of ["connect", "apply", "restore"] as const) expect(skillRepository[method]).not.toHaveBeenCalled();
    expect(window.showDirectoryPicker).not.toHaveBeenCalled(); expect(pwaClient.apply).not.toHaveBeenCalled();
    expect(releasePreferences()).toBe(savedPreferences);
    vi.restoreAllMocks(); vi.unstubAllGlobals();
  });
  async function wait(check: () => void) {
    await vi.waitFor(async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); }); check(); }, { timeout: 5000 });
  }
  async function render(path: string) {
    router = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
    await act(async () => { await router!.load(); root.render(<QueryClientProvider client={query}><RouterProvider router={router!} /></QueryClientProvider>); });
    await wait(() => expect(container.querySelector("h1")).not.toBeNull());
  }
  async function go(path: string) { await act(async () => router!.history.push(path)); await wait(() => expect(router!.state.location.href).toBe(path)); }
  it("opens a folder-free list and details directly, preserves summaries and native links", async () => {
    await render("/releases");
    const records = publicReleases(__APP_RELEASE__);
    expect(container.querySelectorAll(".ak-release-item")).toHaveLength(records.length);
    expect([...container.querySelectorAll(".ak-release-item h2")].map(el => el.textContent)).toEqual(records.map(row => releaseTitle(row, "en")));
    const old = records.at(-1)!;
    const link = container.querySelector<HTMLAnchorElement>(`.ak-release-item h2 a[href="${releaseHref(old.id)}"]`)!;
    const modified = new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true });
    let intercepted: boolean | undefined;
    document.addEventListener("click", event => { intercepted = event.defaultPrevented; event.preventDefault(); }, { once: true });
    await act(async () => link.dispatchEvent(modified));
    expect(intercepted).toBe(false); expect(router!.state.location.pathname).toBe("/releases");
    await go(releaseHref(old.id));
    await wait(() => expect(container.querySelector("h1")!.textContent).toBe(releaseTitle(old, "en")));
    for (const note of old.notes.en) expect(container.querySelector("main")!.textContent).toContain(note);
    expect(container.querySelector('main a[href="/docs/updates"]')).not.toBeNull();
    await act(async () => setLanguage("ko"));
    expect(container.querySelector("h1")!.textContent).toBe(releaseTitle(old, "ko"));
    expect(router!.state.location.pathname).toBe(releaseHref(old.id));
    await act(async () => router!.history.back());
    await wait(() => expect(container.querySelector("h1")!.textContent).toBe("새로워진 Alpha Kanban"));
  });
  it("does not change unread records or notification baseline when navigating between detail and docs", async () => {
    const records = publicReleases(__APP_RELEASE__);
    observeRelease({ ...__APP_RELEASE__, releaseId: records.at(-1)!.id });
    savedPreferences = releasePreferences(); const unread = unreadReleases(__APP_RELEASE__);
    const rich = records.find(row => releaseArticle(__APP_RELEASE__, row.id)?.sections.length)!;
    await render(releaseHref(rich.id) + "#related");
    expect(container.querySelectorAll("main .ak-docs-section").length).toBeGreaterThan(2);
    expect(router!.state.location.hash).toBe("related");
    await go("/docs/updates"); await wait(() => expect(container.querySelector("h1")!.textContent).toBe("App & skill updates"));
    await go("/releases"); expect(unreadReleases(__APP_RELEASE__)).toEqual(unread);
  });
  it("handles missing, other-channel and malformed IDs without fallback to workspace discovery", async () => {
    const other = __APP_RELEASE__.channel === "canary" ? stable[0]!.id : canary[0]!.id;
    await render(releaseHref(other));
    expect(container.querySelector("h1")!.textContent).toBe("Release not found");
    await go("/releases/not/available"); expect(container.querySelector("h1")!.textContent).toBe("Release not found");
    expect(container.querySelector('main a[href="/releases"]')).not.toBeNull();
  });
  it("renders a canary rich example after its explanation without filesystem effects", async () => {
    const release = fixture("canary", 0), records = publicReleases(release), record = records[0]!;
    await act(async () => root.render(<ReleasesContent release={release} records={records} record={record} article={releaseArticle(release, record.id)} isList={false} go={vi.fn()} />));
    const headings = [...container.querySelectorAll("h2")];
    expect(headings.findIndex(el => el.id === "local-links")).toBeLessThan(headings.findIndex(el => el.id === "visual-guide"));
    expect(container.querySelector(".ak-docs-example")).not.toBeNull();
    expect(container.querySelector('a[href="/docs/local-links"]')).not.toBeNull();
  });
});
