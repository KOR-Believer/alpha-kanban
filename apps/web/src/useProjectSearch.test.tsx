// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useProjectSearch } from "./useProjectSearch";
import { createDocumentSearchEntry } from "./documentSearch";
import { projectFixture, documentFixture } from "./allProjectsFixtures";
import { browserRepository } from "./browser/repository";

it("ignores a delayed old query and cancelled results without repeating source preparation", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const file = documentFixture(projectFixture("fixture", "bw_search"), "d_search").file;
  const entry = createDocumentSearchEntry(file, "old needle\nnew needle");
  let resolveOld!: (value: typeof entry) => void;
  const old = new Promise<typeof entry>((resolve) => { resolveOld = resolve; });
  const get = vi.spyOn(browserRepository.documentSearch, "get").mockReturnValue(old);
  const prepare = vi.spyOn(browserRepository, "prepareDocumentSearch").mockResolvedValue();
  const host = document.createElement("div"); const root = createRoot(host);
  function Search({ query, enabled = true }: { query: string; enabled?: boolean }) {
    const result = useProjectSearch([file], query, enabled);
    return <div data-busy={result.busy}>{[...result.matches.values()].map((match) => match.excerpt).join("|")}</div>;
  }
  try {
    await act(async () => root.render(<Search query="old" />));
    get.mockResolvedValue(entry);
    await act(async () => root.render(<Search query="new" />));
    expect(host.textContent).toBe("new needle");
    await act(async () => resolveOld(entry));
    expect(host.textContent).toBe("new needle");
    expect(prepare).toHaveBeenCalledTimes(1);
    await act(async () => root.render(<Search query="" />));
    expect(host.textContent).toBe("");
    expect(host.querySelector("div")?.getAttribute("data-busy")).toBe("false");
    const reads = get.mock.calls.length;
    await act(async () => root.render(<Search query="new" enabled={false} />));
    expect(host.textContent).toBe("");
    expect(get).toHaveBeenCalledTimes(reads);
  } finally {
    await act(async () => root.unmount());
    vi.restoreAllMocks(); vi.unstubAllGlobals();
  }
});
