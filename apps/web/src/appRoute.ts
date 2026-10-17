import type { MarkdownFileSummary } from "@alpha-kanban/shared";
import { IS_BROWSER_LOCAL } from "./storageMode";

export type TicketDetailMode = "side" | "modal" | "full";
export type TicketDocumentViewMode = "board" | "markdown";

export type AppRouteState = {
  detailMode?: TicketDetailMode;
  filePath?: string;
  showGuide?: boolean;
  ticketId?: string;
  ticketViewMode?: TicketDocumentViewMode;
  workspaceId?: string;
};

export type AppRouteLocation = {
  hash?: string;
  pathname: string;
  searchStr?: string;
};

const WORKSPACE_ROUTE_PREFIX = "/w/";

export function parseAppRouteState(location: AppRouteLocation): AppRouteState {
  const route: AppRouteState = {};

  if (location.pathname.startsWith(WORKSPACE_ROUTE_PREFIX)) {
    const encodedWorkspaceId = location.pathname
      .slice(WORKSPACE_ROUTE_PREFIX.length)
      .split("/")[0];
    if (encodedWorkspaceId) {
      route.workspaceId = decodeURIComponent(encodedWorkspaceId);
    }
  }

  const searchParams = new URLSearchParams(location.searchStr ?? "");
  if (IS_BROWSER_LOCAL && route.workspaceId && searchParams.get("view") === "guide") {
    route.showGuide = true;
    return route;
  }
  const filePath = IS_BROWSER_LOCAL
    ? searchParams.get("doc") ?? (searchParams.has("file") ? "unavailable" : null)
    : searchParams.get("file");
  if (filePath) {
    route.filePath = filePath;
  }

  const ticketViewMode = searchParams.get("view");
  if (ticketViewMode === "board" || ticketViewMode === "markdown") {
    route.ticketViewMode = ticketViewMode;
  }

  const hashParams = new URLSearchParams((location.hash ?? "").replace(/^#/, ""));
  const ticketId = hashParams.get("ticket");
  if (ticketId) {
    route.ticketId = ticketId;
  }

  const detailMode = hashParams.get("detail");
  if (detailMode === "modal" || detailMode === "side" || detailMode === "full") {
    route.detailMode = detailMode;
  }

  return route;
}

export function buildAppRoute(state: AppRouteState): string {
  const pathname = state.workspaceId
    ? `${WORKSPACE_ROUTE_PREFIX}${encodeURIComponent(state.workspaceId)}`
    : "/";
  if (IS_BROWSER_LOCAL && state.workspaceId && state.showGuide) return `${pathname}?view=guide`;
  const searchParams = new URLSearchParams();
  if (state.filePath) {
    searchParams.set(IS_BROWSER_LOCAL ? "doc" : "file", IS_BROWSER_LOCAL && !/^d_[a-zA-Z0-9-]+$/.test(state.filePath) ? "unavailable" : state.filePath);
  }
  if (state.ticketViewMode === "markdown") {
    searchParams.set("view", state.ticketViewMode);
  }

  const hashParams = new URLSearchParams();
  if (state.ticketId) {
    hashParams.set("ticket", state.ticketId);
    hashParams.set("detail", state.detailMode ?? "side");
  }

  const search = searchParams.toString();
  const hash = hashParams.toString();
  return `${pathname}${search ? `?${search}` : ""}${hash ? `#${hash}` : ""}`;
}
export const documentRouteId = (file: MarkdownFileSummary) => IS_BROWSER_LOCAL ? file.id : file.relativePath;
export const documentIdentity = (file: MarkdownFileSummary) => file.absolutePath ?? file.id;
