import { describe, expect, it } from "vitest";
import { analyzeReferences, inspectReferences, referenceTargets, absolutePath, within, relativePath, mappedPath, fileUrl } from "../src/documentReferences.mjs";

const doc = (path: string, markdown: string, writable = true) => ({ path, markdown, writable });
const run = (input: Record<string, unknown>) => analyzeReferences({ root: "/repo", documents: [], available: [], ...input });
const moving = [{ from: "docs/a.md", to: "docs/@alice/a.md" }];

describe("precise Markdown reference changes", () => {
  it("rewrites both directions and images without reformatting metadata, titles, queries or escaped/encoded text", () => {
    const source = '\uFEFF# A\r\n\r\n[other](b.md?q=x&amp;y=2#부분 "제목")\r\n![image](<사진%20하나.png> \'alt\')\r\n';
    const back = '# B\n\n[A](a.md#hello)\n';
    const result = run({ documents: [doc("docs/a.md", source), doc("docs/b.md", back)], moves: moving,
      available: ["/repo/docs/a.md", "/repo/docs/b.md", "/repo/docs/사진 하나.png"] });
    expect(result.decision).toBe("ready");
    expect(result.changes[0].after).toBe(source.replace("(b.md?", "(../b.md?").replace("<사진%20하나.png>", "<../사진%20하나.png>"));
    expect(result.changes[1].after).toBe(back.replace("a.md#", "@alice/a.md#"));
    expect(result.references.every((ref: any) => ref.beforeTarget === "/repo/docs/a.md" ? ref.afterTarget === "/repo/docs/@alice/a.md" : ref.beforeTarget === ref.afterTarget)).toBe(true);
  });
  it("handles reference definitions, balanced destinations and nested image labels once", () => {
    const source = '# A\n\n[one][ref] [two][ref]\n\n[ref]: b(1).md "kept"\n\n[![x](image.png)](b(1).md)\n';
    const result = run({ documents: [doc("docs/a.md", source)], moves: moving, available: ["/repo/docs/b(1).md", "/repo/docs/image.png"] });
    expect(result.decision).toBe("ready");
    expect(result.changes[0].after).toContain('[ref]: ../b%281%29.md "kept"');
    expect(result.changes[0].after).toContain('[![x](../image.png)](../b%281%29.md)');
  });
  it("does not rewrite code, front matter, arbitrary prose or external URLs", () => {
    const source = '---\nurl: "[x](a.md)"\n---\n# B\n\n`[x](a.md)`\n\n```md\n[x](a.md)\n```\n\nhttps://example.com/a.md and a.md\n[x](https://example.com/a.md)\n';
    expect(run({ documents: [doc("docs/b.md", source)], moves: moving, available: ["/repo/docs/a.md"] }).changes).toEqual([]);
  });
  it("preserves protocol-relative web URLs and does not reuse a file URL's scheme as a path component", () => {
    const source = '# A\n\n![web](//cdn.example.test/image.png)\n[x](file:///repo/deep/assets/name.md)\n';
    const result = run({ documents: [doc("docs/a.md", source)], moves: moving, available: ["/repo/deep/assets/name.md"] });
    expect(result.decision).toBe("ready");
    expect(result.changes[0].after).toBe('# A\n\n![web](//cdn.example.test/image.png)\n[x](../../deep/assets/name.md)\n');
  });
  it("distinguishes project-root ledger fields from explicit document-relative fields", () => {
    const source = '# B\n\n## Status\n\n- 기준 문서: `docs/a.md`\n';
    const relative = source.replace("docs/a.md", "./a.md");
    const result = run({ documents: [doc("docs/b.md", source), doc("docs/c.md", relative)], moves: moving, available: ["/repo/docs/a.md"] });
    expect(result.changes[0].after).toContain('`docs/@alice/a.md`');
    expect(result.changes[1].after).toContain('`./@alice/a.md`');
  });
  it("keeps intra-folder relations while changing inbound folder links", () => {
    const result = run({ documents: [doc("docs/set/a.md", "# A\n[x](b.md)\n"), doc("docs/index.md", "# I\n[x](set/)\n")],
      moves: [{ from: "docs/set", to: "docs/@alice/set" }], available: ["/repo/docs/set", "/repo/docs/set/b.md"] });
    expect(result.decision).toBe("ready");
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].after).toContain("@alice/set");
  });
  it("blocks read-only backlinks, missing moved targets, cycles and overlapping ranges", () => {
    expect(run({ documents: [doc("README.md", "# R\n[x](docs/a.md)\n", false)], moves: moving, available: ["/repo/docs/a.md"] }).issues[0].code).toBe("OUTSIDE_WRITE_SCOPE");
    expect(run({ documents: [doc("docs/a.md", "# A\n[x](missing.md)\n")], moves: moving }).issues[0].code).toBe("MISSING_TARGET");
    expect(run({ moves: [{ from: "docs/a", to: "docs/b" }, { from: "docs/b", to: "docs/a" }] }).decision).toBe("blocked");
    expect(run({ moves: [{ from: "docs/a", to: "docs/z" }, { from: "docs/a/b", to: "docs/y" }] }).decision).toBe("blocked");
  });
  it("reports unsupported syntax instead of silently approving it", () => {
    const result = run({ documents: [doc("docs/a.md", '# A\n<a href="b.md">b</a>\n\n[[other]]\n')] });
    expect(result.decision).toBe("review");
    expect(result.issues.map((i: any) => i.code)).toEqual(["HTML_REFERENCE", "WIKI_REFERENCE"]);
  });
  it("never edits guessed spans in complex labels or ledger-looking fields inside front matter", () => {
    const source = '---\n- 기준 문서: `docs/a.md`\n---\n# B\n[code `]` label](a.md)\n';
    const result = run({ documents: [doc("docs/b.md", source)], moves: moving, available: ["/repo/docs/a.md"] });
    expect(result.changes).toEqual([]);
    expect(result.issues.map((issue: any) => issue.code)).toContain("UNSUPPORTED_LINK_LOCATION");
  });
  it("rejects duplicate definitions and encoded path separators", () => {
    expect(run({ documents: [doc("docs/a.md", '# A\n[x][id]\n\n[id]: a.md\n[id]: b.md\n')] }).decision).toBe("blocked");
    expect(run({ documents: [doc("docs/a.md", '# A\n[x](foo%2Fbar.md)\n')], moves: moving }).issues[0].code).toBe("AMBIGUOUS_PATH");
  });
  it("reconstructs links in an already moved document using its explicitly verified old path", () => {
    const result = run({ documents: [{ ...doc("docs/@alice/a.md", '# A\n[x](b.md)\n'), previousPath: "docs/a.md" }, doc("docs/b.md", '# B\n[x](a.md)\n')],
      moves: moving, available: ["/repo/docs/a.md", "/repo/docs/b.md", "/repo/docs/@alice/a.md"] });
    expect(result.decision).toBe("ready");
    expect(result.changes[0].after).toContain("../b.md");
    expect(result.changes[1].after).toContain("@alice/a.md");
  });
});

describe("PC path remapping without moving files", () => {
  it.each(["/old/main", "C:/old/main"])("maps %s to the current repo and another verified repo, then is unchanged on reanalysis", (previousRoot) => {
    const windows = previousRoot.startsWith("C:");
    const oldOther = windows ? "C:/old/other" : "/old/other";
    const source = `# A\n\n[x](${oldOther}/src/a.ts?x=1#L2)\n[y](../../other/src/a.ts)\n`;
    const input = { root: "/new/deep/main", previousRoot, mappings: [{ oldRoot: previousRoot, currentRoot: "/new/deep/main" }, { oldRoot: oldOther, currentRoot: "/new/else/other" }],
      documents: [doc("docs/a.md", source)], available: ["/new/else/other/src/a.ts"] };
    const result = analyzeReferences(input);
    expect(result.decision).toBe("ready");
    expect(result.changes[0].after).toContain("../../../else/other/src/a.ts?x=1#L2");
    expect(analyzeReferences({ ...input, documents: [doc("docs/a.md", result.changes[0].after)] }).changes).toEqual([]);
  });
  it("holds cross-drive Windows output unless file URLs were explicitly requested", () => {
    const input = { root: "D:/main", previousRoot: "/old/main", documents: [doc("docs/a.md", "# A\n[x](/old/other/x.ts)\n")],
      mappings: [{ oldRoot: "/old/main", currentRoot: "D:/main" }, { oldRoot: "/old/other", currentRoot: "E:/renamed" }], available: ["E:/renamed/x.ts"] };
    expect(analyzeReferences(input).issues[0].code).toBe("CROSS_VOLUME");
    expect(analyzeReferences({ ...input, output: "file-url" }).changes[0].after).toContain("file:///E:/renamed/x.ts");
  });
  it("handles file URLs and UNC without using host path semantics", () => {
    const result = analyzeReferences({ root: "//server/share/main", previousRoot: "/old/main", output: "file-url",
      documents: [doc("docs/a.md", "# A\n[x](file:///old/other/%ED%95%9C%EA%B8%80%20x.md#part)\n")],
      mappings: [{ oldRoot: "/old/main", currentRoot: "//server/share/main" }, { oldRoot: "/old/other", currentRoot: "//different/share/repo" }], available: ["//different/share/repo/한글 x.md"] });
    expect(result.decision).toBe("ready");
    expect(result.changes[0].after).toContain("file://different/share/repo/%ED%95%9C%EA%B8%80%20x.md#part");
  });
  it("does not guess between an existing current relative target and a different valid old target", () => {
    const input = { root: "/now/main", previousRoot: "/old/main", documents: [doc("docs/a.md", "# A\n[x](../../other/x.ts)\n")],
      mappings: [{ oldRoot: "/old/other", currentRoot: "/different/other" }], available: ["/now/other/x.ts", "/different/other/x.ts"] };
    expect(analyzeReferences(input).issues[0].code).toBe("AMBIGUOUS_TARGET");
  });
  it("uses component boundaries and the most specific verified repo, without Unicode guessing", () => {
    expect(within("/work/repo", "/work/repository/x")).toBe(false);
    expect(within("/", "//host/share/x")).toBe(false);
    expect(within("C:/A", "c:/a/X")).toBe(true);
    expect(relativePath("C:/A", "D:/B")).toBeNull();
    expect(mappedPath("/old/repo/sub/x", [{ oldRoot: "/old/repo", currentRoot: "/new/main" }, { oldRoot: "/old/repo/sub", currentRoot: "/new/child" }])).toBe("/new/child/x");
    expect(mappedPath("/old/é/x", [{ oldRoot: "/old/e\u0301", currentRoot: "/new" }])).toBeNull();
    expect(() => absolutePath("C:relative")).toThrow();
    expect(fileUrl("/한글 x")).toBe("file:///%ED%95%9C%EA%B8%80%20x");
  });
});

describe("section anchor contract for the later migration tool", () => {
  const text = "# Title\n\n## Repeat\nold\n\n## Repeat\nkeep\n\n[inside](#repeat-1)\n";
  const removals = [{ path: "docs/a.md", start: text.indexOf("## Repeat"), end: text.lastIndexOf("## Repeat") }];
  it("preserves the surviving duplicate section and adjusts inbound and same-document anchors", () => {
    const result = run({ documents: [doc("docs/a.md", text), doc("docs/b.md", "# B\n[x](a.md?q=1#repeat-1)\n")], sectionRemovals: removals, available: ["/repo/docs/a.md"] });
    expect(result.decision).toBe("ready");
    expect(result.changes[0].after).toContain("[inside](#repeat)");
    expect(result.changes[1].after).toContain("a.md?q=1#repeat");
    expect(result.changes[0].after).not.toContain("old");
  });
  it("preserves escaped/entity fragment separators while updating a surviving anchor", () => {
    const result = run({ documents: [doc("docs/a.md", text), doc("docs/b.md", "# B\n[x](a.md?q=1&#35;repeat-1)\n")], sectionRemovals: removals, available: ["/repo/docs/a.md"] });
    expect(result.decision).toBe("ready");
    expect(result.changes[1].after).toBe("# B\n[x](a.md?q=1&#35;repeat)\n");
  });
  it("holds deletion for a removed anchor, a read-only backlink or unsupported heading syntax", () => {
    expect(run({ documents: [doc("docs/a.md", text), doc("README.md", "# R\n[x](docs/a.md#repeat)\n", false)], sectionRemovals: removals, available: ["/repo/docs/a.md"] }).issues.some((i: any) => i.code === "DELETED_OR_UNKNOWN_ANCHOR")).toBe(true);
    expect(run({ documents: [doc("docs/a.md", text), doc("README.md", "# R\n[x](docs/a.md#repeat-1)\n", false)], sectionRemovals: removals, available: ["/repo/docs/a.md"] }).issues.some((i: any) => i.code === "OUTSIDE_WRITE_SCOPE")).toBe(true);
    expect(run({ documents: [doc("docs/a.md", text.replace("# Title", "# *Tit*"))], sectionRemovals: removals }).decision).toBe("blocked");
  });
  it("exposes only exact reference candidates for native validation", () => {
    expect(referenceTargets({ root: "/repo", documents: [doc("docs/a.md", "# A\n[x](b.md) [web](https://x.invalid)\n")] })).toEqual(["/repo/docs/b.md"]);
    expect(inspectReferences("# A\n`[x](fake)`\n").references).toEqual([]);
  });
});
