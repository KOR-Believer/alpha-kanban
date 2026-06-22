import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createWorkspaceId, loadServerConfig } from "../config";

describe("loadServerConfig", () => {
  let workspaceRoot: string;

  afterEach(() => {
    rmSync(workspaceRoot, { force: true, recursive: true });
  });

  it("separates workspace roots from default document roots", () => {
    workspaceRoot = mkdtempSync(path.join(tmpdir(), "alpha-kanban-config-"));
    writeFileSync(
      path.join(workspaceRoot, "alpha-kanban.config.json"),
      JSON.stringify(
        {
          codexCommand: "codex-test",
          defaultDocRoots: ["docs", "plans"],
          docRoots: ["legacy-docs"],
          workspaceRoots: [".."],
        },
        null,
        2,
      ),
    );

    const config = loadServerConfig({ workspaceRoot });

    expect(config.workspaceRoot).toBe(path.resolve(workspaceRoot));
    expect(config.workspaceId).toBe(createWorkspaceId(workspaceRoot));
    expect(config.defaultDocRoots).toEqual([
      path.resolve(workspaceRoot, "docs"),
      path.resolve(workspaceRoot, "plans"),
    ]);
    expect(config.docRoots).toEqual(config.defaultDocRoots);
    expect(config.workspaceRoots).toEqual([path.resolve(workspaceRoot, "..")]);
    expect(config.codexCommand).toBe("codex-test");
  });

  it("uses legacy docRoots as default document roots when defaultDocRoots is absent", () => {
    workspaceRoot = mkdtempSync(path.join(tmpdir(), "alpha-kanban-config-"));
    writeFileSync(
      path.join(workspaceRoot, "alpha-kanban.config.json"),
      JSON.stringify({ docRoots: ["docs", "examples"], workspaceRoots: ["."] }, null, 2),
    );

    const config = loadServerConfig({ workspaceRoot });

    expect(config.defaultDocRoots).toEqual([
      path.resolve(workspaceRoot, "docs"),
      path.resolve(workspaceRoot, "examples"),
    ]);
    expect(config.docRoots).toEqual(config.defaultDocRoots);
  });
});
