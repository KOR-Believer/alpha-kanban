// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { DocumentMaintenance } from "./DocumentMaintenance";
import { BrowserRepository, browserRepository, type BrowserMigration } from "./repository";
import { FakeDirectory, MemoryStorage, ledger, testLocks } from "./browserFixtures";
import { setLanguage, t } from "../i18n";
import type { MarkdownFileSummary } from "@alpha-kanban/shared";

const guides = `## 티켓 상태

- \`READY\`: 구현 준비
- \`WATCH\`: 관찰 중

## Progress 기준

- \`0%\`: 초안
- \`80%\`: 예전 단계

## Ticket Template

새 티켓을 추가할 때는 아래 형식을 따른다.

\`\`\`md
### EXAMPLE-00. Sample
Status: READY
Progress: 25%
사용자 지시:
- 2026-07-10: Sample direction, not actual ticket history.
진행 메모:
- 2026-07-10: Sample note.
\`\`\`

`;
const source = ledger.replace("## Ticket List", guides + "## Ticket List")
  .replace("Status: READY\nProgress: 25%\nRepository:", "Status: WATCH\nProgress: 80%\nRepository:");

describe("automatic document maintenance preview", () => {
  let root: Root, container: HTMLDivElement, client: QueryClient;
  let repository: BrowserRepository, project: FakeDirectory, file: ReturnType<FakeDirectory["file"]>, summary: MarkdownFileSummary;
  let preview: MockInstance<BrowserRepository["previewMigration"]>;
  let apply: MockInstance<BrowserRepository["applyMigration"]>;
  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    localStorage.clear(); await setLanguage("ko");
    repository = new BrowserRepository(new MemoryStorage(), testLocks());
    project = new FakeDirectory("project"); file = project.directory("docs").file("01_test_tickets.md", source);
    await repository.connect(project.handle(), "project");
    const workspaceId = (await repository.workspaces()).workspaces[0]!.id;
    summary = (await repository.files(workspaceId))[0]!;
    preview = vi.spyOn(browserRepository, "previewMigration").mockImplementation(repository.previewMigration.bind(repository));
    apply = vi.spyOn(browserRepository, "applyMigration").mockImplementation(repository.applyMigration.bind(repository));
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    await render(summary);
  });
  afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  async function render(file: MarkdownFileSummary) {
    await act(async () => root.render(<QueryClientProvider client={client}><DocumentMaintenance file={file} /></QueryClientProvider>));
  }
  function button(key: string) {
    const result = [...document.querySelectorAll<HTMLButtonElement>("button")].find((node) => node.textContent?.trim() === t(key));
    expect(result, key).toBeDefined(); return result!;
  }
  const dialog = () => document.querySelector('[role="dialog"]');
  async function click(key: string) { await act(async () => button(key).click()); }
  async function waitFor(predicate: () => boolean) {
    for (let i = 0; i < 80 && !predicate(); i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    expect(predicate(), dialog()?.textContent ?? "dialog closed").toBe(true);
  }
  async function openReady() {
    await click("Document maintenance");
    await waitFor(() => !button("Apply reviewed changes").disabled);
  }

  it("opens a combined preview without options, regeneration on language change, or writes on cancel", async () => {
    expect(preview).not.toHaveBeenCalled();
    await openReady();
    expect(preview).toHaveBeenCalledWith(summary.workspaceId, summary.id, { assignId: true, cleanupLegacy: true, reconcileOwner: true, allowPlainMarkdown: false }, undefined, expect.any(AbortSignal));
    const plan = await preview.mock.results[0]!.value as BrowserMigration;
    const id = plan.preview.generatedIds[summary.relativePath]!;
    expect(dialog()?.textContent).toContain(id);
    expect(dialog()?.textContent).toContain("Sample direction, not actual ticket history.");
    expect(document.querySelector('[role="checkbox"], input[type="checkbox"]')).toBeNull();
    expect(file.content).toBe(source); expect(file.writes).toBe(0); expect(apply).not.toHaveBeenCalled();
    await act(async () => { await setLanguage("en"); });
    expect(dialog()?.textContent).toContain(id); expect(preview).toHaveBeenCalledTimes(1);
    await click("Cancel");
    expect(dialog()).toBeNull(); expect(file.content).toBe(source); expect(file.writes).toBe(0);
  });

  it("writes only the reviewed result on Apply, preserves actual tickets, and reopens as a noop", async () => {
    await openReady();
    const plan = await preview.mock.results[0]!.value as BrowserMigration;
    await act(async () => { const target = button("Apply reviewed changes"); target.click(); target.click(); });
    await waitFor(() => dialog() === null);
    expect(apply).toHaveBeenCalledTimes(1); expect(apply).toHaveBeenCalledWith(plan);
    expect(file.writes).toBe(1); expect(file.content).toBe(plan.preview.changes[0]!.after);
    expect(file.content).not.toContain("## Ticket Template"); expect(file.content).not.toContain("Sample direction");
    expect(file.content.slice(file.content.indexOf("## Ticket List"))).toBe(source.slice(source.indexOf("## Ticket List")));
    expect(file.content).toContain("Status: WATCH\nProgress: 80%");
    await click("Document maintenance");
    await waitFor(() => Boolean(dialog()?.textContent?.includes(t("No document changes are needed."))));
    expect(button("Apply reviewed changes").disabled).toBe(true); expect(file.writes).toBe(1);
  });

  it("previews the nearest folder Owner and saves it only on Apply, leaving outer-owner documents and ticket bodies untouched", async () => {
    const docs = project.children.get("docs") as FakeDirectory, bob = docs.directory("@bob");
    const outer = bob.file("01_test_tickets.md", source);
    const original = source.replace(/\n/, "\nOwner: @previous-owner\n");
    const inner = bob.directory("archive").directory("@alice").file("01_test_tickets.md", original);
    summary = (await repository.files(summary.workspaceId, true)).find((entry) => entry.relativePath.includes("/@alice/"))!;
    expect(summary.pathOwner?.value).toBe("@alice");
    await render(summary); await openReady();
    expect(dialog()?.textContent).toContain("Owner: @previous-owner");
    expect(dialog()?.textContent).toContain("Owner: @alice");
    expect(inner.content).toBe(original); expect(inner.writes).toBe(0);
    await click("Cancel"); expect(inner.writes).toBe(0);
    await openReady(); await click("Apply reviewed changes"); await waitFor(() => dialog() === null);
    expect(inner.content).toContain("Owner: @alice\n"); expect(inner.content).not.toContain("@previous-owner");
    expect(inner.content.slice(inner.content.indexOf("## Ticket List"))).toBe(original.slice(original.indexOf("## Ticket List")));
    expect(inner.writes).toBe(1); expect(outer.writes).toBe(0); expect(file.writes).toBe(0);
    await click("Document maintenance");
    await waitFor(() => Boolean(dialog()?.textContent?.includes(t("No document changes are needed."))));
  });

  it("discards a cancelled pending preview and never reopens or saves from its late result", async () => {
    const plan = await repository.previewMigration(summary.workspaceId, summary.id, { assignId: true, cleanupLegacy: true });
    let finish!: (value: BrowserMigration) => void;
    preview.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await click("Document maintenance");
    expect(dialog()?.textContent).toContain(t("Preparing document preview…"));
    expect(button("Apply reviewed changes").disabled).toBe(true);
    await click("Cancel");
    expect(preview.mock.calls.at(-1)?.[4]?.aborted).toBe(true);
    await act(async () => { finish(plan); });
    expect(dialog()).toBeNull(); expect(apply).not.toHaveBeenCalled(); expect(file.writes).toBe(0);
    await openReady(); expect(dialog()?.textContent).not.toContain(t("Preparing document preview…"));
  });

  it("does not transfer a pending preview to a different document", async () => {
    const plan = await repository.previewMigration(summary.workspaceId, summary.id, { assignId: true, cleanupLegacy: true });
    let finish!: (value: BrowserMigration) => void;
    preview.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await click("Document maintenance");
    project.directory("docs").file("02_other_tickets.md", ledger);
    const other = (await repository.files(summary.workspaceId, true)).find((entry) => entry.filename === "02_other_tickets.md")!;
    await render(other);
    expect(preview.mock.calls.at(-1)?.[4]?.aborted).toBe(true);
    await act(async () => { finish(plan); });
    expect(dialog()).toBeNull(); expect(file.writes).toBe(0); expect(apply).not.toHaveBeenCalled();
    await openReady();
    expect(preview).toHaveBeenLastCalledWith(other.workspaceId, other.id, { assignId: true, cleanupLegacy: true, reconcileOwner: true, allowPlainMarkdown: false }, undefined, expect.any(AbortSignal));
    expect(dialog()?.textContent).toContain(other.relativePath);
  });

  it("shows a kept section and still applies the remaining cleanup and ID without a checkbox", async () => {
    const other = project.file("README.md", "# Index\n[Template](docs/01_test_tickets.md#ticket-template)\n[[unrelated]]\n[PC](file:///other/docs/report.md#unknown)\n");
    await openReady();
    expect(dialog()?.textContent).toContain(t("{{section}} will be kept to preserve an existing link.", { section: "Ticket Template" }));
    expect(dialog()?.textContent).not.toContain("WIKI_REFERENCE"); expect(dialog()?.textContent).not.toContain("ABSOLUTE_REFERENCE_UNVERIFIED");
    expect(document.querySelector('[role="checkbox"]')).toBeNull();
    expect(file.writes).toBe(0); expect(apply).not.toHaveBeenCalled();
    await click("Apply reviewed changes"); await waitFor(() => dialog() === null);
    expect(file.content).toContain("## Ticket Template"); expect(file.content).not.toContain("## 티켓 상태"); expect(file.content).not.toContain("## Progress 기준");
    expect(file.content).toContain("Document-ID:"); expect(other.writes).toBe(0);
    expect(file.content.slice(file.content.indexOf("## Ticket List"))).toBe(source.slice(source.indexOf("## Ticket List")));
  });

  it("rejects stale Apply and requires another preview instead of retrying the save", async () => {
    await openReady(); file.content += "\nExternal change\n"; file.mtime++;
    await click("Apply reviewed changes");
    await waitFor(() => Boolean(dialog()?.querySelector('[role="alert"]')));
    expect(file.writes).toBe(0); expect(file.content).toContain("External change");
    expect(apply).toHaveBeenCalledTimes(1); expect(button("Apply reviewed changes").disabled).toBe(true);
    expect(button("Refresh preview").disabled).toBe(false);
    await click("Refresh preview");
    await waitFor(() => !button("Apply reviewed changes").disabled);
    expect(apply).toHaveBeenCalledTimes(1); expect(file.writes).toBe(0);
  });
});
