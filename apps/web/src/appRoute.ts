export type TicketDetailMode = "side" | "modal" | "full";
export type TicketDocumentViewMode = "board" | "markdown";

export type AppRouteState = {
  detailMode?: TicketDetailMode;
  filePath?: string;
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
  const filePath = searchParams.get("file");
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
  const searchParams = new URLSearchParams();
  if (state.filePath) {
    searchParams.set("file", state.filePath);
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
