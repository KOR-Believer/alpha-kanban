// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { CodeDiff, codeDiff } from "./CodeDiff";
import { setLanguage } from "../i18n";

describe("document cleanup diff", () => {
  it.each([
    ["# Doc\nOwner: @alice\n\nold\nkeep\n", "# Doc\nDocument-ID: id\nOwner: @alice\n\nkeep\n"],
    ["one\r\ntwo\r\n", "one\r\nthree\r\n"],
    ["a\nb", "a\nb\n"], ["", "new\n"], ["old\n", ""],
  ])("retains every original and resulting line including line endings", (before, after) => {
    const rows = codeDiff(before, after).groups.flatMap((group) => group.rows);
    for (const [side, source] of [["before", before], ["after", after]] as const) {
      const lines = rows.flatMap((row) => row[side] ? [row[side]!] : []);
      expect(lines.map((line) => line.text + (line.ending === "CRLF" ? "\r\n" : line.ending === "LF" ? "\n" : "")).join("")).toBe(source);
      expect(lines.map((line) => line.number)).toEqual(lines.map((_, index) => index + 1));
    }
  });
  it("keeps separate deletions aligned and expands unchanged context without interpreting HTML", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); await setLanguage("ko");
    const common = Array.from({ length: 30 }, (_, i) => `keep ${i}`).join("\n") + "\n";
    const before = "old\n" + common + '<script>alert("old")</script>\n';
    const after = "new\n" + common + "done\n";
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    try {
      await act(async () => root.render(<CodeDiff before={before} after={after} />));
      expect(host.querySelector('[data-change="removed"] code')?.textContent).toBe("old");
      expect(host.querySelector('[data-change="added"] code')?.textContent).toBe("new");
      expect(host.querySelector("script")).toBeNull();
      expect(host.textContent).not.toContain("keep 15");
      await act(async () => host.querySelector<HTMLButtonElement>('.ak-diff-expand')!.click());
      expect(host.textContent).toContain("keep 15");
      await act(async () => setLanguage("en"));
      expect(host.textContent).toContain("Before"); expect(host.textContent).toContain("keep 15");
    } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
  });
});
