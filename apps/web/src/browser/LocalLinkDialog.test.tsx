// @vitest-environment happy-dom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import ReactMarkdown from "react-markdown";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBrowserMarkdownComponents, localLinkUrlTransform } from "./MarkdownResources";
import { LinkConnectionManager } from "./LocalLinkDialog";
import { browserLinkMappings } from "./repository";
import { LinkMappings, type LinkContext } from "./linkMappings";
import { FakeDirectory, MemoryStorage, testLocks } from "./browserFixtures";
import { setLanguage, t, useTranslation } from "../i18n";
import { appActivity } from "../pwa/activity";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { LinkedNavigationProvider, useLinkedNavigation } from "./linkedNavigation";
import { LinkedDocumentPage } from "./LinkedDocumentPage";

function Source({ context, href }: { context: LinkContext; href: string }) {
  useTranslation();
  const components = useBrowserMarkdownComponents(undefined, context);
  return <ReactMarkdown urlTransform={localLinkUrlTransform} components={components}>{`[Read document](${href})`}</ReactMarkdown>;
}

describe("local link connection UI", () => {
  let root: Root, container: HTMLDivElement, target: FakeDirectory, storage: MemoryStorage, service: LinkMappings, context: LinkContext;
  let picker: ReturnType<typeof vi.fn>;
  let history: ReturnType<typeof createMemoryHistory>;
  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    await setLanguage("ko");
    target = new FakeDirectory("local-docs"); target.file("report.md", "# Remote report\n\n## Section\nKept text\n\n[Next](next.md)\n"); target.file("next.md", "# Next document\n"); target.file("data.txt", "download me");
    storage = new MemoryStorage(); service = new LinkMappings(storage, async () => [], { lock: testLocks() });
    for (const method of ["attempt", "save", "scan", "automatic", "list", "remove", "retry", "error", "propose", "preview", "scope", "document", "openDocument", "reconnectDocument"] as const) vi.spyOn(browserLinkMappings, method).mockImplementation(service[method].bind(service) as never);
    context = { scopeId: "source", label: "Source project", root: new FakeDirectory("source").handle(), path: "docs/source.md", documentId: "d_source" };
    picker = vi.fn().mockResolvedValue(target.handle()); vi.stubGlobal("showDirectoryPicker", picker);
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => undefined);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  async function render(href = "file:///old/repo/report.md#section", initial = "/w/source?doc=d_source", dirty = false) {
    history = createMemoryHistory({ initialEntries: [initial] });
    function Page() {
      const linked = useLinkedNavigation();
      useEffect(() => {
        const owner = {};
        linked.protectDraft(owner, dirty, false);
        return () => linked.protectDraft(owner, false, false);
      }, [linked.protectDraft, dirty]);
      return <><div hidden={Boolean(linked.id)}><Source context={context} href={href} /></div>{linked.id ? <LinkedDocumentPage /> : null}</>;
    }
    const route = createRootRoute({ component: () => <LinkedNavigationProvider><Page /></LinkedNavigationProvider> });
    const router = createRouter({ routeTree: route.addChildren([createRoute({ getParentRoute: () => route, path: "/w/source" })]), history });
    await act(async () => { await router.load(); root.render(<RouterProvider router={router} />); });
  }
  function button(key: string) { const found = [...document.querySelectorAll<HTMLElement>("button, a")].find((element) => element.textContent?.trim() === t(key)); expect(found, key).toBeDefined(); return found!; }
  async function click(key: string) { await act(async () => button(key).click()); }
  async function follow(text = "Read document") { await act(async () => [...document.querySelectorAll<HTMLAnchorElement>("a")].find((element) => element.textContent === text)!.click()); }
  async function ready(check: () => boolean) {
    for (let i = 0; i < 80 && !check(); i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
    expect(check()).toBe(true);
  }
  it("tours missing-link selection and its preview without saving or requesting more access", async () => {
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (this: HTMLElement) { return (this.hidden ? [] : [new DOMRect(0, 0, 180, 28)]) as unknown as DOMRectList; });
    await render(); await follow(); await ready(() => Boolean(document.querySelector('[role="dialog"]')));
    for (const phase of ["choose", "preview"]) {
      if (phase === "preview") { await click("Choose folder directly"); await click("Review selected folder"); }
      const pickerCalls = picker.mock.calls.length;
      await click("Tour this dialog");
      expect(document.querySelector(".driver-popover")).not.toBeNull();
      for (let i = 0; i < 8 && document.querySelector(".driver-popover"); i++) await act(async () => document.querySelector<HTMLButtonElement>(".driver-popover-next-btn")!.click());
      expect(picker).toHaveBeenCalledTimes(pickerCalls);
      expect(browserLinkMappings.save).not.toHaveBeenCalled(); expect(await service.list()).toEqual([]);
      expect(document.querySelector('[role="dialog"]')).not.toBeNull();
      expect([...target.children.values()].every(file => "writes" in file && file.writes === 0)).toBe(true);
    }
  });

  it("keeps file URLs through Markdown, prompts only on click, saves only on Connect and opens a read-only document with its relative links", async () => {
    await render(); expect(picker).not.toHaveBeenCalled(); expect(document.querySelector('[role="dialog"]')).toBeNull();
    await follow(); await ready(() => Boolean(document.querySelector('[role="dialog"]')));
    expect(document.body.textContent).toContain("/old/repo/report.md"); expect(picker).not.toHaveBeenCalled();
    await click("Choose folder directly"); expect(picker).toHaveBeenCalledWith({ id: "alpha-kanban-link", mode: "read" });
    expect(await service.list()).toEqual([]);
    await click("Review selected folder"); await click("Connect and open");
    await ready(() => Boolean(document.querySelector('[data-linked-document]')));
    expect(document.body.textContent).toContain("Remote report"); expect(document.body.textContent).toContain(t("Read-only"));
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
    const firstAddress = history.location.href;
    expect(firstAddress).toMatch(/linked=ld_/); expect(firstAddress).not.toContain("old");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await follow("Next"); await ready(() => document.body.textContent!.includes("Next document"));
    const nextAddress = history.location.href;
    expect(nextAddress).not.toBe(firstAddress);
    await act(async () => history.back()); await ready(() => Boolean(document.querySelector('[data-linked-document]')?.textContent?.includes("Remote report")));
    await act(async () => history.forward()); await ready(() => Boolean(document.querySelector('[data-linked-document]')?.textContent?.includes("Next document")));
    await act(async () => { await setLanguage("en"); });
    expect(document.body.textContent).toContain("Next document");
    expect(await service.list()).toHaveLength(1);
    expect([...target.children.values()].every((file) => "writes" in file && file.writes === 0)).toBe(true);
    await render(undefined, nextAddress); await ready(() => Boolean(document.querySelector('[data-linked-document]')?.textContent?.includes("Next document")));
    expect(await service.list()).toHaveLength(1); expect(picker).toHaveBeenCalledTimes(1);
  });
  it("keeps the requested address through permission loss, removal and explicit reconnection", async () => {
    const at = await service.attempt(context, "/old/repo/report.md");
    const opened = await service.save(context, at.location, "/old/repo", { handle: target.handle(), label: "target" });
    const address = "/w/source?doc=d_source&linked=" + opened.context.documentId;
    target.read = "denied";
    await render(undefined, address); await ready(() => Boolean(document.querySelector('[role="alert"]')));
    expect(history.location.href).toBe(address); expect(picker).not.toHaveBeenCalled();
    target.read = "granted"; await click("Retry"); await ready(() => Boolean(document.querySelector('[data-linked-document]')));
    await service.remove(opened.mapping!);
    await render(undefined, address); await ready(() => Boolean(document.querySelector('[role="alert"]')));
    expect(history.location.href).toBe(address);
    await click("Reconnect linked document"); await ready(() => Boolean(document.querySelector('[role="dialog"]')));
    await click("Cancel"); expect(history.location.href).toBe(address);
    await click("Reconnect linked document"); await ready(() => Boolean(document.querySelector('[role="dialog"]')));
    await click("Choose folder directly"); await click("Review selected folder"); await click("Connect and open");
    await ready(() => Boolean(document.querySelector('[data-linked-document]')));
    expect(history.location.href).not.toBe(address);
  });
  it("allows search-only URL changes while retaining the hidden draft exit guard", async () => {
    const at = await service.attempt(context, "/old/repo/report.md");
    const opened = await service.save(context, at.location, "/old/repo", { handle: target.handle(), label: "target" });
    const address = "/w/source?doc=d_source&linked=" + opened.context.documentId;
    await render(undefined, address, true);
    await ready(() => Boolean(document.querySelector('[data-linked-document]')));
    await act(async () => history.replace(address + "&q=needle&match=old"));
    expect(history.location.href).toContain("q=needle");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => history.push("/w/source?doc=d_other&q=needle"));
    await ready(() => Boolean(document.querySelector('[role="dialog"]')));
    expect(history.location.href).toContain("doc=d_source");
    await click("Cancel");
    expect(history.location.href).toContain("linked=");
  });
  it("shows an unknown saved ID and storage failure without navigating to another document", async () => {
    const address = "/w/source?doc=d_source&linked=ld_missing";
    await render(undefined, address); await ready(() => Boolean(document.querySelector('[role="alert"]')));
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(t("This linked document is not saved in this browser. Open its source link to connect it again."));
    expect(history.location.href).toBe(address);
    vi.mocked(browserLinkMappings.document).mockRejectedValueOnce(new Error("Saved link connections could not be read. Try again before changing a connection."));
    await click("Retry"); await ready(() => document.querySelector('[role="alert"]')?.textContent === t("Saved link connections could not be read. Try again before changing a connection."));
    expect(history.location.href).toBe(address); expect(picker).not.toHaveBeenCalled();
    await click("Back to source document"); await ready(() => !history.location.href.includes("linked="));
  });
  it("makes manual selection available during discovery and cancels without saving or discarding the old connection", async () => {
    vi.mocked(browserLinkMappings.scan).mockImplementation(() => new Promise(() => undefined));
    await render(); await follow(); await ready(() => Boolean(document.querySelector('[role="dialog"]')));
    expect(button("Choose folder directly").hasAttribute("disabled")).toBe(false);
    picker.mockRejectedValueOnce(new DOMException("cancel", "AbortError"));
    await click("Choose folder directly"); expect(document.querySelector('[role="alert"]')).toBeNull();
    await click("Choose folder directly");
    expect(appActivity.unloadRisk).toBe(true);
    await click("Cancel"); expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(await service.list()).toEqual([]); expect(appActivity.unloadRisk).toBe(false);
  });
  it("retains selection when switching language, reports a missing file without saving, and lets the user retry", async () => {
    target.children.delete("report.md");
    await render(); await follow(); await ready(() => Boolean(document.querySelector('[role="dialog"]')));
    await click("Choose folder directly");
    await act(async () => { await setLanguage("en"); });
    expect(document.body.textContent).toContain("Selected folder: local-docs");
    await click("Review selected folder");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("file is missing");
    expect(await service.list()).toEqual([]);
    target.file("report.md", "# Now present"); await click("Review selected folder"); await click("Connect and open");
    await ready(() => document.body.textContent!.includes("Now present"));
  });
  it("reuses persisted mappings, stops at permission loss and can retry after explicit access", async () => {
    await render(); await follow(); await ready(() => Boolean(document.querySelector('[role="dialog"]')));
    await click("Choose folder directly"); await click("Review selected folder"); await click("Connect and open"); await ready(() => Boolean(document.querySelector('[data-linked-document]')));
    await click("Back to source document"); target.read = "denied";
    await follow(); await ready(() => Boolean(document.querySelector('[role="alert"]')));
    expect(button("Allow access and retry")).toBeDefined(); expect(picker).toHaveBeenCalledTimes(1);
    target.read = "granted"; await click("Allow access and retry"); await ready(() => Boolean(document.querySelector('[data-linked-document]')));
    expect(picker).toHaveBeenCalledTimes(1);
  });
  it("keeps HTTP/mail links external and refuses executable URL schemes", async () => {
    await render("https://example.com/docs"); expect(container.querySelector("a")?.getAttribute("href")).toBe("https://example.com/docs");
    await render("mailto:test@example.com"); expect(container.querySelector("a")?.getAttribute("href")).toBe("mailto:test@example.com");
    expect(localLinkUrlTransform("javascript:alert(1)", "href", { type: "element", tagName: "a", properties: {}, children: [] })).toBe("");
    expect(localLinkUrlTransform("file:///old/a.png", "src", { type: "element", tagName: "img", properties: {}, children: [] })).toBe("");
    expect(picker).not.toHaveBeenCalled();
  });
  it("lists saved connections in folder management and confirms removal without file writes", async () => {
    const at = await service.attempt(context, "/old/repo/report.md");
    await service.save(context, at.location, "/old/repo", { handle: target.handle(), label: "local-docs" });
    await act(async () => root.render(<LinkConnectionManager />));
    expect(document.body.textContent).toContain("Source project: /old/repo → local-docs");
    await click("Remove link connection"); await click("Cancel"); expect(await service.list()).toHaveLength(1);
    await click("Remove link connection");
    const confirm = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find((item) => item.textContent === t("Remove link connection"))!;
    await act(async () => confirm.click()); expect(await service.list()).toEqual([]);
  });
  it("labels the mapped repository by its target folder while preserving the source project on replacement", async () => {
    target.directory(".git").file("config", '[remote "origin"]\nurl = https://example.invalid/team/product.git\n');
    const at = await service.attempt(context, "/old/repo/report.md");
    await service.save(context, at.location, "/old/repo", { handle: target.handle(), label: "workspace/renamed-product" });
    await act(async () => root.render(<LinkConnectionManager />));
    await click("Change link connection");
    await ready(() => Boolean(document.querySelector('[role="dialog"] button[aria-pressed]')));
    const candidate = document.querySelector<HTMLButtonElement>('[role="dialog"] button[aria-pressed]')!;
    expect(candidate.textContent).toContain("workspace/renamed-product");
    expect(candidate.textContent).not.toContain("Source project");
    await act(async () => candidate.click());
    await click("Review selected folder"); await click("Save link connection");
    const [mapping] = await service.list();
    expect(mapping).toMatchObject({ scopeId: context.scopeId, sourceLabel: "Source project", label: "workspace/renamed-product" });
    expect(await mapping!.handle.isSameEntry(target.handle())).toBe(true);
    expect([...target.children.values()].filter((file) => "writes" in file).every((file) => file.writes === 0)).toBe(true);
  });
});
