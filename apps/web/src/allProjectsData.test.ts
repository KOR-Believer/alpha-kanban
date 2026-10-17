import { describe, expect, it } from "vitest";
import { boardTickets, filterBoardTickets, loadBoard, reorderedKeys, type BoardLoadProgress } from "./allProjectsData";
import { documentFixture, projectFixture } from "./allProjectsFixtures";

describe("all-projects board data", () => {
  const first = projectFixture("/work/project", "w_first");
  const second = projectFixture("/personal/project", "w_second");
  const documents = [first, second].map((workspace) => ({ workspace, response: documentFixture(workspace) }));

  it("uses server project identity, not folder labels or the current workspace list", () => {
    const tickets = boardTickets({ documents, issues: [] });
    expect(tickets[0]?.projectLabel).toBe(tickets[1]?.projectLabel);
    expect(tickets[0]?.projectId).not.toBe(tickets[1]?.projectId);
    expect(filterBoardTickets(tickets, { projectIds: [first.project!.id], hideDone: false, search: "" })).toHaveLength(1);
    expect(filterBoardTickets(tickets, { projectIds: [], hideDone: true, search: "" })).toHaveLength(0);
    expect(filterBoardTickets(tickets, { projectIds: [], hideDone: false, search: "W_SECOND" })).toHaveLength(1);
    expect(tickets[0]?.projectId).toBe(boardTickets({ documents: [documents[0]!], issues: [] })[0]?.projectId);
  });
  it("keeps successful projects when listing or parsing another document fails", async () => {
    const third = projectFixture("/third/project", "w_third");
    const result = await loadBoard({
      workspaces: async () => ({ workspaces: [first, second, third] }),
      files: async (id) => {
        if (id === third.id) throw new Error("permission denied");
        return { files: [documentFixture(id === first.id ? first : second).file] };
      },
      document: async (id) => { if (id === second.id) throw new Error("missing file"); return documentFixture(first); },
    });
    expect(boardTickets(result)).toHaveLength(1);
    expect(result.issues).toHaveLength(2);
    expect(result.issues.join(" ")).toContain("permission denied");
    expect(result.issues.join(" ")).toContain("missing file");
  });
  it("deduplicates a physical document using the most specific workspace regardless of list order", async () => {
    const nested = { ...projectFixture(`${first.root}/docs`, "w_docs"), project: first.project };
    const response = documentFixture(first);
    const nestedResponse = { ...response, file: { ...response.file, id: "nested-file", workspaceId: nested.id, relativePath: response.file.filename } };
    for (const workspaces of [[first, nested], [nested, first]]) {
      const result = await loadBoard({ workspaces: async () => ({ workspaces }),
        files: async (id) => ({ files: [id === first.id ? response.file : nestedResponse.file] }),
        document: async (id) => id === first.id ? response : nestedResponse,
      });
      expect(result.documents).toHaveLength(1);
      expect(boardTickets(result)[0]).toMatchObject({ projectId: first.project!.id, workspaceId: nested.id });
    }
  });
  it("bounds document reads instead of launching every file simultaneously", async () => {
    let active = 0;
    let maximum = 0;
    const files = Array.from({ length: 20 }, (_, i) => ({ ...documentFixture(first, String(i)).file, absolutePath: `/work/project/docs/${i}_tickets.md` }));
    await loadBoard({ workspaces: async () => ({ workspaces: [first] }), files: async () => ({ files }),
      document: async (_, fileId) => {
        active++; maximum = Math.max(maximum, active);
        await new Promise((resolve) => setTimeout(resolve, 1)); active--;
        return documentFixture(first, fileId);
      },
    });
    expect(maximum).toBeLessThanOrEqual(6);
    expect(maximum).toBeGreaterThan(1);
  });
  it("reorders known tickets without dropping inaccessible project order entries", () => {
    const tickets = boardTickets({ documents, issues: [] });
    const [a, b] = tickets;
    expect(reorderedKeys(tickets, a!.key, b!.key, true, ["unavailable", a!.key])).toEqual([b!.key, a!.key, "unavailable"]);
  });
  it("publishes a ready project before a slow project's listing finishes", async () => {
    let release!: () => void;
    const slow = new Promise<void>((resolve) => { release = resolve; });
    let ready!: () => void;
    const visible = new Promise<void>((resolve) => { ready = resolve; });
    const updates: BoardLoadProgress[] = [];
    const pending = loadBoard({
      workspaces: async () => ({ workspaces: [first, second] }),
      files: async (id) => { if (id === second.id) await slow; return { files: [documentFixture(id === first.id ? first : second).file] }; },
      document: async (id) => documentFixture(id === first.id ? first : second),
    }, { onProgress: (progress) => { updates.push(progress); if (progress.data.documents.length) ready(); } });
    await visible;
    expect(updates.at(-1)!.data.documents.map((item) => item.workspace.id)).toEqual([first.id]);
    expect(updates.at(-1)!.totalProjects).toBe(2);
    release();
    expect((await pending).documents).toHaveLength(2);
    expect(updates.at(-1)!.completedProjects).toBe(2);
  });
  it("stops publishing after cancellation and rejects the interrupted load", async () => {
    const controller = new AbortController();
    let release!: () => void;
    const slow = new Promise<void>((resolve) => { release = resolve; });
    let ready!: () => void;
    const visible = new Promise<void>((resolve) => { ready = resolve; });
    let updates = 0;
    const pending = loadBoard({
      workspaces: async () => ({ workspaces: [first, second] }),
      files: async (id) => { if (id === second.id) await slow; return { files: [documentFixture(id === first.id ? first : second).file] }; },
      document: async (id) => documentFixture(id === first.id ? first : second),
    }, { signal: controller.signal, onProgress: (progress) => { updates++; if (progress.data.documents.length) ready(); } });
    await visible;
    controller.abort();
    const before = updates;
    release();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(updates).toBe(before);
  });
  it("bounds document reads across projects, not just within one project", async () => {
    let active = 0;
    let maximum = 0;
    await loadBoard({
      workspaces: async () => ({ workspaces: [first, second] }),
      files: async (id) => ({ files: Array.from({ length: 12 }, (_, i) => ({ ...documentFixture(first, `${id}-${i}`).file, absolutePath: `/${id}/${i}_tickets.md` })) }),
      document: async (_, fileId) => {
        active++; maximum = Math.max(maximum, active);
        await new Promise((resolve) => setTimeout(resolve, 1)); active--;
        return documentFixture(first, fileId);
      },
    });
    expect(maximum).toBe(6);
  });
});
