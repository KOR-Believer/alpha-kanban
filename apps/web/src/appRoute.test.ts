import { describe, expect, it } from "vitest";

import { buildAppRoute, parseAppRouteState } from "./appRoute";

describe("app route helpers", () => {
  it("parses the start route", () => {
    expect(parseAppRouteState({ pathname: "/" })).toEqual({});
  });

  it("round-trips full ticket view while preserving the ticket route", () => {
    const route = { workspaceId: "w_test", ticketId: "TEST-01", detailMode: "full" as const };
    const url = new URL(buildAppRoute(route), "http://localhost");
    expect(parseAppRouteState({ pathname: url.pathname, hash: url.hash })).toEqual(route);
  });

  it("parses workspace, file, ticket, and detail state", () => {
    expect(
      parseAppRouteState({
        hash: "ticket=AKW-07&detail=modal",
        pathname: "/w/w_e0de4c45b76dc637",
        searchStr:
          "?file=docs%2F04_alpha_kanban_multi_workspace_tickets.md&view=markdown",
      }),
    ).toEqual({
      detailMode: "modal",
      filePath: "docs/04_alpha_kanban_multi_workspace_tickets.md",
      ticketId: "AKW-07",
      ticketViewMode: "markdown",
      workspaceId: "w_e0de4c45b76dc637",
    });
  });

  it("builds the existing deep-link contract", () => {
    expect(
      buildAppRoute({
        detailMode: "side",
        filePath: "docs/04_alpha_kanban_multi_workspace_tickets.md",
        ticketId: "AKW-07",
        workspaceId: "w_e0de4c45b76dc637",
      }),
    ).toBe(
      "/w/w_e0de4c45b76dc637?file=docs%2F04_alpha_kanban_multi_workspace_tickets.md#ticket=AKW-07&detail=side",
    );
  });

  it("persists the ticket Markdown view without changing the default board URL", () => {
    expect(
      buildAppRoute({
        filePath: "docs/04_alpha_kanban_multi_workspace_tickets.md",
        ticketViewMode: "markdown",
        workspaceId: "w_e0de4c45b76dc637",
      }),
    ).toBe(
      "/w/w_e0de4c45b76dc637?file=docs%2F04_alpha_kanban_multi_workspace_tickets.md&view=markdown",
    );

    expect(
      buildAppRoute({
        filePath: "docs/04_alpha_kanban_multi_workspace_tickets.md",
        ticketViewMode: "board",
        workspaceId: "w_e0de4c45b76dc637",
      }),
    ).toBe(
      "/w/w_e0de4c45b76dc637?file=docs%2F04_alpha_kanban_multi_workspace_tickets.md",
    );
  });
});
