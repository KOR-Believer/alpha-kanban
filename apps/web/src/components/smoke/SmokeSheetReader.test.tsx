// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildSmokeIndex, parseSmokeDocument, type SmokeIndexEntry } from "@alpha-kanban/shared/smokeMarkdown";
import { SmokeSheetReader } from "./SmokeSheetReader";
import { snapshotPath, smokeSheetTabs } from "./smokeSheets";
import { buildAppRoute } from "../../appRoute";
import { setLanguage } from "../../i18n";
import { browserLinkMappings } from "../../browser/repository";
import { FakeDirectory } from "../../browser/browserFixtures";
import type { LinkContext } from "../../browser/linkMappings";

vi.mock("@tanstack/react-router", async original => ({ ...await original<object>(), useNavigate: () => vi.fn() }));
const texts = [...readFileSync(resolve(process.cwd(), "../../docs/31_alpha_kanban_smoke_inventory.md"), "utf8").matchAll(/^```md\n([\s\S]*?)^```$/gm)].map(match => match[1]!);
const models = texts.map((text, index) => parseSmokeDocument(text, index ? "smoke-run" : "smoke"));
const entries: SmokeIndexEntry[] = models.map((document, index) => ({ projectId: "bw_sheets", localId: `d_sheet-${index}`, path: `docs/${index ? "@alice" : "basic"}/${index + 1}_notes_${index ? "smoke_run" : "smoke"}.md`, documentId: document.documentId, document }));
const index = buildSmokeIndex(entries);
const file = (number: number) => ({ id: entries[number]!.localId, workspaceId: "bw_sheets", type: models[number]!.kind, filename: entries[number]!.path.split("/").at(-1)!, slug: "notes", sequenceNumber: number + 1, workspaceRelativePath: entries[number]!.path, relativePath: entries[number]!.path });

describe("smoke sheet reading", () => {
  let container: HTMLDivElement; let root: Root;
  beforeEach(async () => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); await setLanguage("en"); container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  const href = (id: string) => buildAppRoute({ workspaceId: "bw_sheets", filePath: id });
  async function show(number: number, extra: Partial<Parameters<typeof SmokeSheetReader>[0]> = {}) {
    await act(async () => root.render(<SmokeSheetReader document={models[number]!} file={file(number)} tabs={smokeSheetTabs(file(number).id, index, entries)} fileHref={href} {...extra} />));
  }
  async function expand() { await act(async () => container.querySelector<HTMLButtonElement>('button[aria-controls^="smoke-case-"]')!.click()); }

  it("shows definitions without results and frozen runs with their own revisions and retired cases", async () => {
    await show(0);
    expect(container.querySelectorAll("thead th")).toHaveLength(3);
    expect(container.textContent).toContain("Revision 2"); expect(container.textContent).toContain("Retired");
    await show(1);
    expect(container.querySelectorAll("thead th")).toHaveLength(5);
    expect(container.textContent).toContain("Revision 1"); expect(container.textContent).not.toContain("Revision 2");
    expect(container.querySelector('[data-smoke-case="TC-002"]')).not.toBeNull();
    expect(container.querySelector('[data-smoke-case="TC-003"]')).toBeNull();
    expect(container.textContent).not.toContain("Retired");
  });

  it("keeps closed status with unrun rows and preserves the original observation plus later user correction", async () => {
    await show(2); await expand();
    expect(container.textContent).toContain("Run closed"); expect(container.textContent).toContain("Not run 1");
    expect(container.querySelectorAll(".ak-smoke-history article")).toHaveLength(2);
    expect(container.textContent).toContain("@bob correction"); expect(container.textContent).not.toContain("@alice correction");
    expect(container.textContent).toContain("Browser Use"); expect(container.textContent).toContain("Correction reason");
    expect(container.textContent).toContain("Fail"); expect(container.textContent).toContain("Pass");
    expect(container.querySelector('button[type="submit"]')).toBeNull();
    await act(async () => setLanguage("ko"));
    expect(container.textContent).toContain("@bob 수정"); expect(container.textContent).toContain("수행·수정 이력");
  });

  it("uses real per-document URLs and intercepts only unmodified primary navigation", async () => {
    const navigate = vi.fn(); await show(0, { onFileSelect: navigate });
    const links = container.querySelectorAll<HTMLAnchorElement>(".ak-smoke-tabs a");
    expect([...links].map(link => link.getAttribute("href"))).toEqual(entries.map(entry => href(entry.localId)));
    for (const options of [{ button: 1 }, { ctrlKey: true }, { metaKey: true }]) {
      const event = new MouseEvent("click", { ...options, bubbles: true, cancelable: true });
      await act(async () => { links[1]!.dispatchEvent(event); });
      expect(event.defaultPrevented).toBe(false);
    }
    expect(navigate).not.toHaveBeenCalled();
    await act(async () => links[1]!.click()); expect(navigate).toHaveBeenCalledWith("d_sheet-1");
  });

  it("restores scroll and expanded rows across round navigation", async () => {
    await show(0); await expand();
    const element = container.querySelector<HTMLDivElement>(".ak-smoke-scroll")!;
    element.scrollTop = 420; element.scrollLeft = 130;
    element.dispatchEvent(new Event("scroll"));
    await show(1); await show(0);
    expect(container.querySelector<HTMLDivElement>(".ak-smoke-scroll")!.scrollTop).toBe(420);
    expect(container.querySelector<HTMLDivElement>(".ak-smoke-scroll")!.scrollLeft).toBe(130);
    expect(container.querySelector(".ak-smoke-detail")).not.toBeNull();
  });

  it.each([0, 1])("keeps short or empty sheet notes readable without a redundant toggle (%s)", async number => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(40);
    const edit = vi.fn();
    await show(number, { onEditMemo: edit });
    expect(container.querySelector(".ak-smoke-memo [aria-expanded]")).toBeNull();
    expect(container.querySelector(".ak-smoke-memo-collapsed")).toBeNull();
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Edit sheet notes"]')!.click());
    expect(edit).toHaveBeenCalledOnce();

    await show(number, { document: { ...models[number]!, memo: { ...models[number]!.memo!, content: "" } }, onEditMemo: edit });
    expect(container.querySelector(".ak-smoke-memo [aria-expanded]")).toBeNull();
    expect(container.querySelector('button[aria-label="Edit sheet notes"]')).not.toBeNull();
  });

  it("rechecks note overflow on resize and content changes without losing each note's expansion", async () => {
    let contentHeight = 240;
    const observers = new Set<() => void>();
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("ak-smoke-memo-content") ? contentHeight : 0;
    });
    vi.stubGlobal("ResizeObserver", class {
      constructor(private callback: () => void) {}
      observe() { observers.add(this.callback); }
      disconnect() { observers.delete(this.callback); }
    });
    const runFile = { ...file(1), id: "d_memo-overflow" };
    await show(1, { file: runFile });
    const notes = () => [...container.querySelectorAll<HTMLElement>(".ak-smoke-memo")];
    const toggle = (number: number) => notes()[number]!.querySelector<HTMLButtonElement>("[aria-expanded]");
    expect(toggle(0)?.getAttribute("aria-expanded")).toBe("false");
    await act(async () => toggle(0)!.click());
    expect(toggle(0)?.getAttribute("aria-expanded")).toBe("true");
    expect(notes()[0]!.querySelector(".ak-smoke-memo-collapsed")).toBeNull();
    expect(toggle(1)?.getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById(toggle(0)!.getAttribute("aria-controls")!)).not.toBeNull();

    contentHeight = 40;
    await act(async () => observers.forEach(measure => measure()));
    expect(container.querySelector(".ak-smoke-memo [aria-expanded]")).toBeNull();
    expect(container.querySelector(".ak-smoke-memo-collapsed")).toBeNull();
    contentHeight = 240;
    await act(async () => observers.forEach(measure => measure()));
    expect(toggle(0)?.getAttribute("aria-expanded")).toBe("true");
    expect(toggle(1)?.getAttribute("aria-expanded")).toBe("false");

    contentHeight = 40;
    await show(1, { file: runFile, document: { ...models[1]!, memo: { ...models[1]!.memo!, content: "Short edited note." } } });
    expect(toggle(0)).toBeNull();
    expect(notes()[0]!.textContent).toContain("Short edited note.");
    await show(0);
    await show(1, { file: runFile });
    contentHeight = 240;
    await act(async () => observers.forEach(measure => measure()));
    expect(toggle(0)?.getAttribute("aria-expanded")).toBe("true");
    await act(async () => toggle(0)!.click());
    expect(notes()[0]!.querySelector(".ak-smoke-memo-collapsed")).not.toBeNull();
  });

  it("resolves frozen criteria at Smoke-Path and execution evidence at the run path", async () => {
    const run = parseSmokeDocument(texts[1]!.replace("#### 기대 결과", "#### 기대 결과\n\n[frozen](criteria.md)").replace("###### 증거", "###### 증거\n\n[observed](evidence.md)"), "smoke-run");
    const rootFolder = new FakeDirectory("project");
    const context: LinkContext = { root: rootFolder.handle(), scopeId: "bw_sheets", documentId: "d_sheet-1", label: "Project", path: file(1).relativePath };
    const attempt = vi.spyOn(browserLinkMappings, "attempt").mockRejectedValue(new Error("synthetic missing link"));
    await show(1, { document: run, linkContext: context, snapshotContext: { ...context, path: run.run!.sourcePath! } }); await expand();
    const frozen = [...container.querySelectorAll<HTMLAnchorElement>("a")].find(a => a.textContent === "frozen")!;
    const observed = [...container.querySelectorAll<HTMLAnchorElement>("a")].find(a => a.textContent === "observed")!;
    await act(async () => frozen.click());
    expect(attempt.mock.calls[0]![0].path).toBe("docs/basic/01_notes_smoke.md");
    await act(async () => observed.click());
    expect(attempt.mock.calls[1]![0].path).toBe(file(1).relativePath);
  });

  it("keeps malformed records visible without inventing results or navigation targets", async () => {
    const malformed = parseSmokeDocument(texts[2]!.replace("Result: PASS", "Result: MAYBE"), "smoke-run");
    await show(2, { document: malformed, tabs: [], fileHref: undefined });
    expect(container.textContent).toContain("Unknown result"); expect(container.textContent).toContain("Open Markdown");
    expect(container.querySelectorAll(".ak-smoke-tabs a")).toHaveLength(0);
    expect(container.querySelectorAll(".ak-smoke-tabs [aria-current]")).toHaveLength(1);
    expect(container.querySelectorAll("tbody > tr[data-smoke-case]")).toHaveLength(2);
  });
});

describe("smoke sheet relationships", () => {
  it("never attaches a wrong-type/duplicate source and keeps orphan rounds together by UUID", () => {
    const orphanEntries = entries.slice(1);
    expect(smokeSheetTabs("d_sheet-1", buildSmokeIndex(orphanEntries), orphanEntries).map(tab => tab.id)).toEqual(["d_sheet-1", "d_sheet-2"]);
    const duplicate = [...entries, { ...entries[0]!, localId: "d_duplicate", document: undefined }];
    expect(smokeSheetTabs("d_sheet-1", buildSmokeIndex(duplicate), duplicate).map(tab => tab.id)).toEqual(["d_sheet-1"]);
    const other = entries.map(entry => ({ ...entry, projectId: "bw_other", localId: "other-" + entry.localId }));
    expect(smokeSheetTabs("d_sheet-0", buildSmokeIndex([...entries, ...other]), [...entries, ...other]).map(tab => tab.id)).toEqual(entries.map(entry => entry.localId));
    const orphans = [...orphanEntries, ...other.slice(1)];
    expect(smokeSheetTabs("d_sheet-1", buildSmokeIndex(orphans), orphans).map(tab => tab.id)).toEqual(["d_sheet-1", "d_sheet-2"]);
  });
  it("never uses an unsafe or unknown snapshot path as a link base", () => {
    for (const path of ["/private/a.md", "C:/docs/a.md", "docs/../a.md", "docs\\a.md", "docs//a.md"]) expect(snapshotPath({ ...models[1]!, run: { ...models[1]!.run!, sourcePath: path } })).toBeUndefined();
    expect(snapshotPath(models[1]!)).toBe("docs/basic/01_notes_smoke.md");
  });
});
