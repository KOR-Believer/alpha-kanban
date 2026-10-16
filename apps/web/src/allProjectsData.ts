import type { MarkdownFileSummary, TicketDocumentResponse, TicketItem, WorkspaceSummary } from "@alpha-kanban/shared";
import { buildAppRoute } from "./appRoute";

export type BoardDocument = { response: TicketDocumentResponse; workspace: WorkspaceSummary };
export type BoardData = { documents: BoardDocument[]; issues: string[] };
export type BoardTicket = TicketItem & {
  file: MarkdownFileSummary;
  projectId: string;
  projectLabel: string;
  projectRoot: string;
  href: string;
  key: string;
  workspaceId: string;
};
export type BoardFilters = { projectIds: string[]; hideDone: boolean; search: string };
export const BOARD_FILTERS_KEY = "alpha-kanban.allTickets.filters";

// Bound both listing and document reads; one inaccessible project must not hide the rest.
async function collect<T, R>(items: T[], read: (item: T) => Promise<R>) {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(6, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      try { results[index] = { status: "fulfilled", value: await read(items[index]!) }; }
      catch (reason) { results[index] = { status: "rejected", reason }; }
    }
  }));
  return results;
}

export async function loadBoard(api: {
  workspaces: () => Promise<{ workspaces: WorkspaceSummary[] }>;
  files: (workspaceId: string) => Promise<{ files: MarkdownFileSummary[] }>;
  document: (workspaceId: string, fileId: string) => Promise<TicketDocumentResponse>;
}): Promise<BoardData> {
  const available = (await api.workspaces()).workspaces.filter((workspace) => workspace.isAvailable)
    .sort((a, b) => b.root.length - a.root.length || a.root.localeCompare(b.root));
  const listed = await collect(available, async (workspace) => ({ workspace, files: (await api.files(workspace.id)).files }));
  const issues: string[] = [];
  const jobs = new Map<string, { file: MarkdownFileSummary; workspace: WorkspaceSummary }>();
  listed.forEach((result, index) => {
    if (result.status === "rejected") {
      issues.push(`${available[index]!.root}: ${errorMessage(result.reason)}`);
      return;
    }
    // Prefer the most specific workspace for duplicate physical documents, regardless of recency.
    for (const file of result.value.files) {
      if (file.type === "tickets" && !jobs.has(file.absolutePath)) jobs.set(file.absolutePath, { file, workspace: result.value.workspace });
    }
  });
  const entries = [...jobs.values()];
  const loaded = await collect(entries, async ({ file, workspace }) => ({ response: await api.document(workspace.id, file.id), workspace }));
  const documents: BoardDocument[] = [];
  loaded.forEach((result, index) => {
    if (result.status === "fulfilled") documents.push(result.value);
    else issues.push(`${entries[index]!.file.absolutePath}: ${errorMessage(result.reason)}`);
  });
  return { documents, issues };
}

export function boardTickets(data?: BoardData): BoardTicket[] {
  return (data?.documents ?? []).flatMap(({ response, workspace }) => response.document.tickets.map((ticket) => ({
    ...ticket,
    file: response.file,
    projectId: workspace.project?.id ?? workspace.id,
    projectLabel: workspace.project?.label ?? workspace.label,
    projectRoot: workspace.project?.root ?? workspace.root,
    workspaceId: workspace.id,
    key: `${response.file.absolutePath}#${ticket.id}`,
    href: buildAppRoute({ workspaceId: workspace.id, filePath: response.file.relativePath, ticketId: ticket.id }),
  })));
}

export function filterBoardTickets(tickets: BoardTicket[], filters: BoardFilters) {
  const search = filters.search.trim().toLocaleLowerCase();
  return tickets.filter((ticket) =>
    (!filters.hideDone || ticket.status !== "DONE") &&
    (!filters.projectIds.length || filters.projectIds.includes(ticket.projectId)) &&
    (!search || `${ticket.id} ${ticket.title} ${ticket.projectLabel} ${ticket.file.relativePath}`.toLocaleLowerCase().includes(search)),
  );
}

export function readBoardFilters(): BoardFilters {
  try {
    const value = JSON.parse(window.localStorage.getItem(BOARD_FILTERS_KEY) ?? "null");
    if (value && Array.isArray(value.projectIds) && value.projectIds.every((id: unknown) => typeof id === "string") &&
        typeof value.hideDone === "boolean" && typeof value.search === "string") return value;
  } catch { /* Invalid/unavailable storage falls back to an unfiltered board. */ }
  return { projectIds: [], hideDone: false, search: "" };
}

export function reorderedKeys(tickets: BoardTicket[], key: string, target: string, after: boolean, saved: string[]) {
  const keys = tickets.map((ticket) => ticket.key).filter((item) => item !== key);
  const index = keys.indexOf(target);
  if (index < 0 || !tickets.some((ticket) => ticket.key === key)) return undefined;
  keys.splice(index + Number(after), 0, key);
  // Preserve order entries belonging to temporarily inaccessible projects.
  return [...keys, ...saved.filter((item) => !keys.includes(item))];
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Could not read document";
}
