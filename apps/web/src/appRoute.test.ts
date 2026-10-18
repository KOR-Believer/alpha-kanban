import { describe, expect, it } from "vitest";

import { buildAppRoute, parseAppRouteState } from "./appRoute";

describe("app route helpers", () => {
  it("parses the start route", () => {
    expect(parseAppRouteState({ pathname: "/" })).toEqual({});
  });

  it("opens the guide independently of a selected document or ticket", () => {
    expect(buildAppRoute({ workspaceId: "w_test", showGuide: true })).toBe("/w/w_test?view=guide");
    expect(parseAppRouteState({ pathname: "/w/w_test", searchStr: "?view=guide&doc=d_notes", hash: "ticket=T-01" })).toEqual({ workspaceId: "w_test", showGuide: true });
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
          "?doc=d_tickets&view=markdown",
      }),
    ).toEqual({
      detailMode: "modal",
      filePath: "d_tickets",
      ticketId: "AKW-07",
      ticketViewMode: "markdown",
      workspaceId: "w_e0de4c45b76dc637",
    });
  });

  it("builds an opaque-document deep link", () => {
    expect(
      buildAppRoute({
        detailMode: "side",
        filePath: "d_tickets",
        ticketId: "AKW-07",
        workspaceId: "w_e0de4c45b76dc637",
      }),
    ).toBe(
      "/w/w_e0de4c45b76dc637?doc=d_tickets#ticket=AKW-07&detail=side",
    );
  });

  it("persists the ticket Markdown view without changing the default board URL", () => {
    expect(
      buildAppRoute({
        filePath: "d_tickets",
        ticketViewMode: "markdown",
        workspaceId: "w_e0de4c45b76dc637",
      }),
    ).toBe(
      "/w/w_e0de4c45b76dc637?doc=d_tickets&view=markdown",
    );

    expect(
      buildAppRoute({
        filePath: "d_tickets",
        ticketViewMode: "board",
        workspaceId: "w_e0de4c45b76dc637",
      }),
    ).toBe(
      "/w/w_e0de4c45b76dc637?doc=d_tickets",
    );
  });
});
