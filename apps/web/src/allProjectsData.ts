import type { MarkdownFileSummary, TicketDocumentResponse, TicketItem, WorkspaceSummary } from "@alpha-kanban/shared";
import { buildAppRoute, documentIdentity, documentRouteId } from "./appRoute";

export type BoardDocument = { response: TicketDocumentResponse; workspace: WorkspaceSummary };
export type BoardData = { documents: BoardDocument[]; issues: string[] };
export type BoardLoadProgress = { data: BoardData; completedProjects: number; totalProjects: number };
export type BoardLoadOptions = { signal?: AbortSignal; onProgress?: (progress: BoardLoadProgress) => void };
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

function limitConcurrency(limit: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  return async <T>(read: () => Promise<T>): Promise<T> => {
    await new Promise<void>((resolve) => {
      if (active < limit) { active++; resolve(); }
      else waiting.push(resolve);
    });
    try { return await read(); }
    finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}

export async function loadBoard(api: {
  workspaces: () => Promise<{ workspaces: WorkspaceSummary[] }>;
  files: (workspaceId: string) => Promise<{ files: MarkdownFileSummary[] }>;
  document: (workspaceId: string, fileId: string) => Promise<TicketDocumentResponse>;
}, options: BoardLoadOptions = {}): Promise<BoardData> {
  const available = (await api.workspaces()).workspaces.filter((workspace) => workspace.isAvailable)
    .sort((a, b) => b.root.length - a.root.length || a.root.localeCompare(b.root));
  options.signal?.throwIfAborted();
  const issues: string[] = [];
  const owners = new Map<string, number>();
  const documents = new Map<string, BoardDocument>();
  const rank = new Map(available.map((workspace, index) => [workspace.id, index]));
  const readDocument = limitConcurrency(6);
  let completedProjects = 0;
  const snapshot = (): BoardData => ({
    documents: [...documents.values()].sort((a, b) => rank.get(a.workspace.id)! - rank.get(b.workspace.id)! ||
      a.response.file.relativePath.localeCompare(b.response.file.relativePath)),
    issues: [...issues],
  });
  const publish = () => {
    if (!options.signal?.aborted) options.onProgress?.({ data: snapshot(), completedProjects, totalProjects: available.length });
  };
  publish();
  await collect(available, async (workspace) => {
    try {
      options.signal?.throwIfAborted();
      const { files } = await api.files(workspace.id);
      options.signal?.throwIfAborted();
      await Promise.all(files.filter((file) => file.type === "tickets").map(async (file) => {
        const key = documentIdentity(file);
        const priority = rank.get(workspace.id)!;
        // Listings may finish out of order; the most specific owner still wins.
        if ((owners.get(key) ?? Infinity) <= priority) return;
        owners.set(key, priority);
        documents.delete(key);
        try {
          const response = await readDocument(async () => {
            options.signal?.throwIfAborted();
            return api.document(workspace.id, file.id);
          });
          if (owners.get(key) === priority) documents.set(key, { response, workspace });
        } catch (error) {
          if (!options.signal?.aborted && owners.get(key) === priority) issues.push(`${file.workspaceRelativePath}: ${errorMessage(error)}`);
        }
        publish();
      }));
    } catch (error) {
      if (!options.signal?.aborted) issues.push(`${workspace.root}: ${errorMessage(error)}`);
    }
    completedProjects++;
    publish();
  });
  options.signal?.throwIfAborted();
  return snapshot();
}

export function boardTickets(data?: BoardData): BoardTicket[] {
  return (data?.documents ?? []).flatMap(({ response, workspace }) => response.document.tickets.map((ticket) => ({
    ...ticket,
    file: response.file,
    projectId: workspace.project?.id ?? workspace.id,
    projectLabel: workspace.project?.label ?? workspace.label,
    projectRoot: workspace.project?.root ?? workspace.root,
    workspaceId: workspace.id,
    key: `${documentIdentity(response.file)}#${ticket.id}`,
    href: buildAppRoute({ workspaceId: workspace.id, filePath: documentRouteId(response.file), ticketId: ticket.id }),
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
