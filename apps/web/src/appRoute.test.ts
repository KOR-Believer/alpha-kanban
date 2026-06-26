import { describe, expect, it } from "vitest";

import { buildAppRoute, parseAppRouteState } from "./appRoute";

describe("app route helpers", () => {
  it("parses the start route", () => {
    expect(parseAppRouteState({ pathname: "/" })).toEqual({});
  });

  it("parses workspace, file, ticket, and detail state", () => {
    expect(
      parseAppRouteState({
        hash: "ticket=AKW-07&detail=modal",
        pathname: "/w/w_e0de4c45b76dc637",
        searchStr: "?file=docs%2F04_alpha_kanban_multi_workspace_tickets.md",
      }),
    ).toEqual({
      detailMode: "modal",
      filePath: "docs/04_alpha_kanban_multi_workspace_tickets.md",
      ticketId: "AKW-07",
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
});
