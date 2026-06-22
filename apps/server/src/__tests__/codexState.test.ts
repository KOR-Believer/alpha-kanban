import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadServerConfig } from "../config";
import { CodexStateStore } from "../codexState";

describe("CodexStateStore", () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(path.join(tmpdir(), "alpha-kanban-state-"));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { force: true, recursive: true });
  });

  it("migrates legacy document session keys to workspace-scoped keys on write", async () => {
    const config = loadServerConfig({ workspaceRoot });
    const store = new CodexStateStore(config);
    mkdirSync(path.dirname(store.statePath), { recursive: true });
    writeFileSync(
      store.statePath,
      JSON.stringify(
        {
          version: 1,
          documents: {
            "docs/02_tickets.md": {
              codexSessionId: "legacy-thread",
              parentTicketId: "OLD-01",
              relatedDocuments: ["docs/02_tickets.md"],
              updatedAt: "2026-06-22T00:00:00.000Z",
            },
          },
          runResults: {
            "run-1": {
              readAt: "2026-06-22T01:00:00.000Z",
            },
          },
        },
        null,
        2,
      ),
    );

    const legacyState = await store.getDocumentState("docs/02_tickets.md");
    expect(legacyState?.codexSessionId).toBe("legacy-thread");

    await store.setDocumentSession("docs/02_tickets.md", "next-thread", {
      parentTicketId: "AKW-01",
    });

    const state = JSON.parse(readFileSync(store.statePath, "utf8")) as {
      version: number;
      documents: Record<string, { codexSessionId?: string; lastTicketId?: string }>;
      runResults: Record<string, { readAt?: string; updatedAt?: string }>;
    };
    const scopedKey = `${config.workspaceId}::docs/02_tickets.md`;

    expect(state.version).toBe(2);
    expect(state.documents["docs/02_tickets.md"]).toBeUndefined();
    expect(state.documents[scopedKey]?.codexSessionId).toBe("next-thread");
    expect(state.documents[scopedKey]?.lastTicketId).toBe("AKW-01");
    expect(state.runResults["run-1"]?.readAt).toBe("2026-06-22T01:00:00.000Z");
    expect(state.runResults["run-1"]?.updatedAt).toBe("2026-06-22T01:00:00.000Z");
  });

  it("stores recent workspaces only in the control app state file", async () => {
    const config = loadServerConfig({ workspaceRoot });
    const store = new CodexStateStore(config);
    const targetWorkspaceRoot = path.join(workspaceRoot, "target-project");
    mkdirSync(targetWorkspaceRoot);

    const recent = await store.recordRecentWorkspace({
      id: "w_target",
      label: "target-project",
      root: targetWorkspaceRoot,
      lastOpenedAt: "2026-06-22T02:00:00.000Z",
    });

    expect(await store.getLastWorkspaceId()).toBe("w_target");
    expect(await store.getRecentWorkspaces()).toEqual([recent]);
    expect(existsSync(store.statePath)).toBe(true);
    expect(existsSync(path.join(targetWorkspaceRoot, ".alpha-kanban", "state.json"))).toBe(
      false,
    );
  });
});
