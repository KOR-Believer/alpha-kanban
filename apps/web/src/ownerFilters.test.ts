import { describe, expect, it } from "vitest";
import { buildDocumentSets } from "@alpha-kanban/shared/documents";
import { documentFixture, projectFixture } from "./allProjectsFixtures";
import { boardTickets, filterBoardTickets } from "./allProjectsData";
import { DEFAULT_DOCUMENT_FILTERS, filterDocumentSets } from "./documentSetFiltering";
import { matchesOwnerFilter, ownerFilterFor, ownersInFiles, parseOwnerFilters } from "./ownerFilters";
import { parseBoardOwnerSelection } from "./allBoardOwnerFilters";

const first = projectFixture("workspace/first", "bw_first");
const second = projectFixture("workspace/second", "bw_second");
const docs = [
  [first, "d_alice", "docs/@alice"], [first, "d_bob", "docs/@bob"],
  [first, "d_plain", "docs"], [second, "d_other", "docs/@alice"],
] as const;
const data = { issues: [], documents: docs.map(([workspace, id, directory]) => {
  const response = documentFixture(workspace, id);
  response.file = { ...response.file, absolutePath: undefined, filename: "01_test_tickets.md", directory, relativePath: `${directory}/01_test_tickets.md`, workspaceRelativePath: `${directory}/01_test_tickets.md` };
  return { workspace, response };
}) };

describe("owner display filters", () => {
  it("filters equal ticket IDs by project and document identity without changing records", () => {
    const before = structuredClone(data);
    const tickets = boardTickets(data);
    expect(new Set(tickets.map((ticket) => ticket.key)).size).toBe(4);
    const filters = { projectIds: [], hideDone: false, search: "" };
    expect(filterBoardTickets(tickets, filters).map((ticket) => ticket.file.id)).toEqual(["d_alice", "d_bob", "d_plain", "d_other"]);
    expect(filterBoardTickets(tickets, filters, ["@alice"]).map((ticket) => ticket.file.id)).toEqual(["d_alice", "d_other"]);
    expect(filterBoardTickets(tickets, filters, ["@alice", "@bob"]).map((ticket) => ticket.file.id)).toEqual(["d_alice", "d_bob", "d_other"]);
    expect(filterBoardTickets(tickets, filters, ["@bob", "unassigned"]).map((ticket) => ticket.file.id)).toEqual(["d_bob", "d_plain"]);
    expect(filterBoardTickets(tickets, { ...filters, projectIds: [first.project!.id] }, ["@alice", "@bob"]).map((ticket) => ticket.file.id)).toEqual(["d_alice", "d_bob"]);
    expect(filterBoardTickets(tickets, filters, ["unassigned"]).map((ticket) => ticket.file.id)).toEqual(["d_plain"]);
    expect(data).toEqual(before);
  });

  it("narrows only sidebar results and keeps the original selection data available", () => {
    const files = data.documents.filter((item) => item.workspace.id === first.id).map((item) => item.response.file);
    const sets = buildDocumentSets(files);
    const before = structuredClone(sets);
    expect(ownersInFiles(files)).toEqual(["@alice", "@bob"]);
    expect(filterDocumentSets(sets, "test", DEFAULT_DOCUMENT_FILTERS, "@bob").flatMap((set) => set.documents.map((file) => file.id))).toEqual(["d_bob"]);
    expect(filterDocumentSets(sets, "", DEFAULT_DOCUMENT_FILTERS, "unassigned").flatMap((set) => set.documents.map((file) => file.id))).toEqual(["d_plain"]);
    expect(filterDocumentSets(sets, "", DEFAULT_DOCUMENT_FILTERS, "@gone")).toEqual([]);
    expect(sets).toEqual(before);
  });

  it("treats invalid owner folders and direct docs connections as unassigned without adopting header data", () => {
    const file = data.documents[0]!.response.file;
    for (const relativePath of ["@alice/01_test_tickets.md", "01_test_tickets.md", "docs/@@bad/01_test_tickets.md", "docs/@alice/archive/@/test.md"]) {
      const changed = { ...file, relativePath, pathOwner: { status: "owned" as const, value: "@alice" } };
      expect(matchesOwnerFilter(changed, "unassigned")).toBe(true);
      expect(matchesOwnerFilter(changed, "@alice")).toBe(false);
    }
  });

  it("uses the nearest owner in both the sidebar and all-project board, excluding nested colleagues from the outer owner", () => {
    const nested = structuredClone(data);
    const file = nested.documents[0]!.response.file;
    file.directory = "docs/@bob/research/@alice";
    file.relativePath = `${file.directory}/${file.filename}`;
    file.workspaceRelativePath = file.relativePath;
    // Even stale cached ownership cannot turn an inner owner's work into Bob's.
    file.pathOwner = { status: "owned", value: "@bob" };
    const files = nested.documents.filter(({ workspace }) => workspace.id === first.id).map(({ response }) => response.file);
    const sets = buildDocumentSets(files);
    expect(filterDocumentSets(sets, "", DEFAULT_DOCUMENT_FILTERS, "@bob").flatMap((set) => set.documents.map(({ id }) => id))).toEqual(["d_bob"]);
    expect(filterDocumentSets(sets, "", DEFAULT_DOCUMENT_FILTERS, "@alice").flatMap((set) => set.documents.map(({ id }) => id))).toEqual(["d_alice"]);
    const tickets = boardTickets(nested), filters = { projectIds: [], hideDone: false, search: "" };
    expect(filterBoardTickets(tickets, filters, ["@bob"]).map(({ file }) => file.id)).toEqual(["d_bob"]);
    expect(filterBoardTickets(tickets, filters, ["@alice"]).map(({ file }) => file.id)).toEqual(["d_alice", "d_other"]);
  });

  it("restores only valid per-project preferences without guessing a current user", () => {
    expect(parseOwnerFilters(null)).toEqual({});
    expect(parseOwnerFilters("broken")).toEqual({});
    expect(parseOwnerFilters("[]")).toEqual({});
    const restored = parseOwnerFilters(JSON.stringify({ first: "@alice", second: "unassigned", old: "all", bad: "@@team", invalid: true, unicode: "@홍길동".normalize("NFD") }));
    expect(restored).toEqual({ first: "@alice", second: "unassigned", unicode: "@홍길동" });
    expect(ownerFilterFor(restored, "first")).toBe("@alice");
    expect(ownerFilterFor(restored, "new-project")).toBe("all");
    expect(ownerFilterFor(restored, "toString")).toBe("all");
  });

  it("restores a separate all-board OR list without importing per-project preferences", () => {
    for (const invalid of [null, "broken", "{}", JSON.stringify({ project: "@alice" })]) expect(parseBoardOwnerSelection(invalid)).toEqual([]);
    expect(parseBoardOwnerSelection(JSON.stringify(["@alice", "@bob", "@alice", "unassigned", "all", "@@bad", null, 1, "@홍길동".normalize("NFD"), "@홍길동"])))
      .toEqual(["@alice", "@bob", "unassigned", "@홍길동"]);
  });
});
