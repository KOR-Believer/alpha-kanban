// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { parseMarkdownOutline } from "@alpha-kanban/shared/documents";
import { MarkdownDocumentReader, type ReaderFile } from "./MarkdownDocumentReader";
import { FakeDirectory } from "../browser/browserFixtures";
import { setLanguage } from "../i18n";

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("uses the identical reading view, GFM rendering and heading navigation for ordinary and connected documents", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  await setLanguage("ko");
  const scroll = vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
  const markdown = "# 같은 문서\nOwner: @alice\nDocument-ID: a66c536c-107a-499b-a071-880d858aba67\n\n## 표와 코드\n\n| 이름 | 값 |\n| --- | --- |\n| 항목 | **강조** |\n\n```js\nconst value = 1;\n```\n\n> 인용\n\n- [x] 완료\n\n[섹션](#표와-코드)\n";
  const file: ReaderFile = { id: "d_same", workspaceId: "bw_source", type: "plan", filename: "01_same_plan.md", slug: "same", sequenceNumber: 1, workspaceRelativePath: "docs/01_same_plan.md", relativePath: "01_same_plan.md" };
  const doc = { markdown, outline: parseMarkdownOutline(markdown) };
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(<><div data-reader="ordinary"><MarkdownDocumentReader document={doc} file={file} onFileSelect={() => {}} /></div><div data-reader="linked" data-linked-document="ld_same"><MarkdownDocumentReader document={doc} file={file} headingPrefix="linked-ld_same" linkContext={{ scopeId: "linked:target", label: "target", root: new FakeDirectory("target").handle(), path: file.workspaceRelativePath, documentId: "ld_same" }} /></div></>));
    const ordinary = host.querySelector('[data-reader="ordinary"]')!; const linked = host.querySelector('[data-reader="linked"]')!;
    expect(linked.querySelector('.ak-markdown')!.innerHTML.replaceAll("linked-ld_same-", "md-heading-")).toBe(ordinary.querySelector('.ak-markdown')!.innerHTML);
    expect(linked.firstElementChild!.className).toBe(ordinary.firstElementChild!.className);
    expect(linked.querySelector('aside')!.textContent).toBe(ordinary.querySelector('aside')!.textContent);
    expect(ordinary.querySelector('dl')?.textContent).toContain("기록된 소유자@alice");
    expect(linked.querySelector('dl')?.textContent).toBe(ordinary.querySelector('dl')?.textContent);
    expect(ordinary.querySelector('.ak-markdown')?.textContent).not.toContain("Document-ID:");
    expect(ordinary.querySelector('.ak-markdown')?.textContent).not.toContain("Owner:");
    const button = [...linked.querySelectorAll('button')].find((item) => item.title === "표와 코드")!;
    await act(async () => button.click());
    expect(scroll.mock.instances.at(-1)).toBe(linked.querySelector('h2'));
  } finally { await act(async () => root.unmount()); host.remove(); }
});

it("locates source matches while preserving GFM text, blocks and document properties", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const scroll = vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
  const markdown = "# Search\nOwner: @alice\n\nİ header\n\n| Name | Value |\n| --- | --- |\n| target | 청록색 등대 |\n\n```txt\nCODE_NEEDLE\n```\n";
  const doc = { markdown, outline: parseMarkdownOutline(markdown) };
  const file: ReaderFile = { id: "d_match", workspaceId: "bw_source", type: "markdown", filename: "notes.md", slug: "notes", workspaceRelativePath: "notes.md", relativePath: "notes.md" };
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  try {
    const render = async (searchQuery = "") => { await act(async () => root.render(<MarkdownDocumentReader document={doc} file={file} searchQuery={searchQuery} />)); };
    await render();
    const original = host.querySelector(".ak-markdown")!.innerHTML;
    await render("청록색 등대");
    expect(host.querySelector("tr[data-search-hit]")?.textContent).toContain("청록색 등대");
    expect(scroll.mock.instances.at(-1)).toBe(host.querySelector("[data-search-hit]"));
    await render("code_needle");
    expect(host.querySelector("[data-search-hit]")?.textContent).toBe("CODE_NEEDLE\n");
    await render();
    expect(host.querySelector(".ak-markdown")!.innerHTML).toBe(original);
    expect(doc.markdown).toBe(markdown);
    expect(host.querySelector("dl")?.textContent).toContain("@alice");
  } finally { await act(async () => root.unmount()); host.remove(); }
});
