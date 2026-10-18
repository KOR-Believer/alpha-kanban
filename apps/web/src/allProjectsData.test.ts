import { describe, expect, it } from "vitest";
import { boardTickets, filterBoardTickets, loadBoard, reorderedKeys } from "./allProjectsData";
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
});
