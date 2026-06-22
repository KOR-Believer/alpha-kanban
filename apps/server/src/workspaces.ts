import { promises as fs } from "node:fs";
import path from "node:path";

import type {
  SelectWorkspaceRequest,
  WorkspaceSummary,
  WorkspacesResponse,
} from "@alpha-kanban/shared";

import { createWorkspaceId, type ServerConfig } from "./config";
import { CodexStateStore } from "./codexState";

export const WORKSPACE_ERROR = {
  WORKSPACE_NOT_FOUND: "WORKSPACE_NOT_FOUND",
  WORKSPACE_OUTSIDE_ALLOWLIST: "WORKSPACE_OUTSIDE_ALLOWLIST",
  WORKSPACE_UNAVAILABLE: "WORKSPACE_UNAVAILABLE",
} as const;

export type WorkspaceErrorCode = (typeof WORKSPACE_ERROR)[keyof typeof WORKSPACE_ERROR];

export class WorkspaceError extends Error {
  readonly code: WorkspaceErrorCode;

  constructor(code: WorkspaceErrorCode, message: string) {
    super(message);
    this.name = "WorkspaceError";
    this.code = code;
  }
}

export class WorkspaceService {
  private readonly stateStore: CodexStateStore;

  constructor(private readonly config: ServerConfig) {
    this.stateStore = new CodexStateStore(config);
  }

  async listWorkspaces(): Promise<WorkspacesResponse> {
    const [allowlistRoots, recentWorkspaces, lastWorkspaceId] = await Promise.all([
      this.allowlistRoots(),
      this.stateStore.getRecentWorkspaces(),
      this.stateStore.getLastWorkspaceId(),
    ]);
    const discovered = new Map<string, WorkspaceSummary>();

    for (const allowlistRoot of allowlistRoots) {
      for (const candidateRoot of await this.discoverCandidateRoots(allowlistRoot)) {
        const workspace = await this.createAvailableSummary(candidateRoot);
        discovered.set(workspace.id, workspace);
      }
    }

    for (const recent of recentWorkspaces) {
      const current = discovered.get(recent.id);
      if (current) {
        discovered.set(recent.id, {
          ...current,
          lastOpenedAt: recent.lastOpenedAt,
        });
        continue;
      }

      if (!isConfiguredPathInsideRoots(recent.root, this.config.workspaceRoots)) {
        continue;
      }

      const realRoot = await realpathDirectory(recent.root);
      if (!realRoot) {
        discovered.set(recent.id, {
          id: recent.id,
          label: recent.label,
          root: normalizeAbsolutePath(recent.root),
          isAvailable: false,
          hasDocs: false,
          lastOpenedAt: recent.lastOpenedAt,
        });
        continue;
      }

      if (!isPathInsideAnyRoot(realRoot, allowlistRoots)) {
        continue;
      }

      discovered.set(recent.id, {
        ...(await this.createAvailableSummary(realRoot)),
        lastOpenedAt: recent.lastOpenedAt,
      });
    }

    return {
      workspaces: [...discovered.values()].sort(compareWorkspaces),
      lastWorkspaceId,
    };
  }

  async selectWorkspace(request: SelectWorkspaceRequest): Promise<WorkspaceSummary> {
    if (request.workspaceId) {
      return this.selectWorkspaceById(request.workspaceId);
    }

    const root = request.root;
    if (!root) {
      throw new WorkspaceError(
        WORKSPACE_ERROR.WORKSPACE_NOT_FOUND,
        "Workspace root was not provided.",
      );
    }

    const workspace = await this.resolveWorkspaceRoot(root);
    await this.stateStore.recordRecentWorkspace({
      id: workspace.id,
      label: workspace.label,
      root: workspace.root,
    });

    return workspace;
  }

  async resolveWorkspaceRoot(root: string): Promise<WorkspaceSummary> {
    const realRoot = await realpathDirectory(root);
    if (!realRoot) {
      throw new WorkspaceError(
        WORKSPACE_ERROR.WORKSPACE_NOT_FOUND,
        "Workspace root was not found.",
      );
    }

    const allowlistRoots = await this.allowlistRoots();
    if (!isPathInsideAnyRoot(realRoot, allowlistRoots)) {
      throw new WorkspaceError(
        WORKSPACE_ERROR.WORKSPACE_OUTSIDE_ALLOWLIST,
        "Workspace root is outside configured workspaceRoots.",
      );
    }

    return this.createAvailableSummary(realRoot);
  }

  private async selectWorkspaceById(workspaceId: string): Promise<WorkspaceSummary> {
    const listed = await this.listWorkspaces();
    const workspace = listed.workspaces.find((item) => item.id === workspaceId);

    if (!workspace) {
      throw new WorkspaceError(
        WORKSPACE_ERROR.WORKSPACE_NOT_FOUND,
        "Workspace was not found.",
      );
    }

    if (!workspace.isAvailable) {
      throw new WorkspaceError(
        WORKSPACE_ERROR.WORKSPACE_UNAVAILABLE,
        "Workspace is unavailable.",
      );
    }

    await this.stateStore.recordRecentWorkspace({
      id: workspace.id,
      label: workspace.label,
      root: workspace.root,
    });

    return workspace;
  }

  private async allowlistRoots(): Promise<string[]> {
    const roots = await Promise.all(
      this.config.workspaceRoots.map((root) => realpathDirectory(root)),
    );
    return unique(roots.filter((root): root is string => Boolean(root)));
  }

  private async discoverCandidateRoots(allowlistRoot: string): Promise<string[]> {
    const roots = new Set<string>();

    if (await isProjectCandidate(allowlistRoot)) {
      roots.add(allowlistRoot);
    }

    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(allowlistRoot, { withFileTypes: true });
    } catch {
      return [...roots];
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const candidateRoot = path.join(allowlistRoot, entry.name);
      if (await isProjectCandidate(candidateRoot)) {
        roots.add(normalizeAbsolutePath(candidateRoot));
      }
    }

    return [...roots];
  }

  private async createAvailableSummary(root: string): Promise<WorkspaceSummary> {
    const normalizedRoot = normalizeAbsolutePath(root);
    return {
      id: createWorkspaceId(normalizedRoot),
      label: path.basename(normalizedRoot) || normalizedRoot,
      root: normalizedRoot,
      isAvailable: true,
      hasDocs: await hasDocs(normalizedRoot),
    };
  }
}

async function isProjectCandidate(root: string): Promise<boolean> {
  return (
    (await exists(path.join(root, ".git"))) ||
    (await exists(path.join(root, "docs"))) ||
    (await hasPlanTicketingDocument(root))
  );
}

async function hasDocs(root: string): Promise<boolean> {
  return (await exists(path.join(root, "docs"))) || (await hasPlanTicketingDocument(root));
}

async function hasPlanTicketingDocument(root: string): Promise<boolean> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return false;
  }

  return entries.some(
    (entry) =>
      entry.isFile() &&
      (entry.name.endsWith("_tickets.md") ||
        entry.name.endsWith("_plan.md") ||
        entry.name.endsWith("_inventory.md")),
  );
}

async function realpathDirectory(root: string): Promise<string | undefined> {
  try {
    const realRoot = await fs.realpath(path.resolve(root));
    const stat = await fs.stat(realRoot);
    return stat.isDirectory() ? normalizeAbsolutePath(realRoot) : undefined;
  } catch (error) {
    if (isNodeError(error, "ENOENT") || isNodeError(error, "ENOTDIR")) {
      return undefined;
    }
    throw error;
  }
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function isConfiguredPathInsideRoots(targetPath: string, roots: string[]): boolean {
  const resolvedTarget = normalizeAbsolutePath(targetPath);
  return roots.some((root) =>
    isPathInsideOrSame(resolvedTarget, normalizeAbsolutePath(root)),
  );
}

function isPathInsideAnyRoot(targetPath: string, roots: string[]): boolean {
  return roots.some((root) => isPathInsideOrSame(targetPath, root));
}

function isPathInsideOrSame(targetPath: string, root: string): boolean {
  const relativePath = path.relative(root, targetPath);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

function normalizeAbsolutePath(targetPath: string): string {
  return path.normalize(path.resolve(targetPath));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function compareWorkspaces(a: WorkspaceSummary, b: WorkspaceSummary): number {
  if (a.isAvailable !== b.isAvailable) {
    return a.isAvailable ? -1 : 1;
  }

  if (a.lastOpenedAt && b.lastOpenedAt && a.lastOpenedAt !== b.lastOpenedAt) {
    return b.lastOpenedAt.localeCompare(a.lastOpenedAt);
  }

  if (a.lastOpenedAt !== b.lastOpenedAt) {
    return a.lastOpenedAt ? -1 : 1;
  }

  return a.label.localeCompare(b.label);
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
