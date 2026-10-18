import type { TicketDocumentResponse, TicketItem, WorkspaceSummary } from "@alpha-kanban/shared";

export function projectFixture(root: string, id: string): WorkspaceSummary {
  return { id, root, label: root.split("/").at(-1)!, isAvailable: true, hasDocs: true,
    project: { id: `project-${id}`, root, label: "project", workspaceRoot: root.slice(0, root.lastIndexOf("/")) } };
}
export function documentFixture(workspace: WorkspaceSummary, fileId = workspace.id): TicketDocumentResponse {
  const ticket: TicketItem = {
    id: "TEST-01", title: `Fixture ${workspace.id}`, status: "DONE", progress: 100, priority: "P1", type: "Feature",
    completedAt: "2026-10-16T12:00:00+09:00", repository: [], dependsOn: [], goal: [], currentProblem: [],
    implementationScope: [], outOfScope: [], completionCriteria: [], completionCriteriaItems: [], validation: [], validationItems: [],
    userInstructions: [], progressNotes: [], hasUserInstructionsSection: true,
    unknownBlocks: [], range: { startLine: 10, endLine: 40 }, missingFields: [],
  };
  return {
    file: { id: fileId, workspaceId: workspace.id, type: "tickets", filename: "01_test_tickets.md", directory: "docs",
      relativePath: "docs/01_test_tickets.md", workspaceRelativePath: "docs/01_test_tickets.md",
      absolutePath: `${workspace.root}/docs/01_test_tickets.md`, mtimeMs: 1, hash: `hash-${fileId}`, slug: "test" },
    document: { title: "Fixture", tickets: [ticket], status: { doneTickets: 1, totalTickets: 1 }, lineCount: 40, missingSections: [] },
  };
}
