import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import type {
  CreateWorkspaceRequest,
  SelectWorkspaceRequest,
  WorkspaceDirectoriesResponse,
  WorkspaceDirectory,
  WorkspaceDirectoryEntry,
  WorkspaceDirectoryRoot,
  WorkspaceRootsSettingsResponse,
  WorkspaceSummary,
  WorkspacesResponse,
} from "@alpha-kanban/shared";

import { createWorkspaceId, type ServerConfig } from "./config";
import { CodexStateStore } from "./codexState";

export const WORKSPACE_ERROR = {
  WORKSPACE_ALREADY_EXISTS: "WORKSPACE_ALREADY_EXISTS",
  WORKSPACE_CREATE_FAILED: "WORKSPACE_CREATE_FAILED",
  WORKSPACE_ROOT_INVALID: "WORKSPACE_ROOT_INVALID",
  WORKSPACE_NOT_FOUND: "WORKSPACE_NOT_FOUND",
  WORKSPACE_OUTSIDE_ALLOWLIST: "WORKSPACE_OUTSIDE_ALLOWLIST",
  WORKSPACE_UNAVAILABLE: "WORKSPACE_UNAVAILABLE",
} as const;

export type WorkspaceErrorCode = (typeof WORKSPACE_ERROR)[keyof typeof WORKSPACE_ERROR];

const HIDDEN_DIRECTORY_NAMES = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
]);
const execFileAsync = promisify(execFile);

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
    const [configuredRoots, recentWorkspaces, lastWorkspaceId] = await Promise.all([
      this.configuredWorkspaceRoots(),
      this.stateStore.getRecentWorkspaces(),
      this.stateStore.getLastWorkspaceId(),
    ]);
    const allowlistRoots = await this.allowlistRootsFrom(configuredRoots);
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

      if (!isConfiguredPathInsideRoots(recent.root, configuredRoots)) {
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

  async getWorkspaceRootSettings(): Promise<WorkspaceRootsSettingsResponse> {
    const settings = await this.stateStore.getRuntimeSettings();
    const currentRoots = await this.allowlistRootsFrom(
      settings.workspaceRoots ?? this.config.workspaceRoots,
    );

    return {
      roots: currentRoots.map(createDirectoryRoot).sort(compareDirectoryRoots),
      defaultRoots: (await this.allowlistRootsFrom(this.config.workspaceRoots))
        .map(createDirectoryRoot)
        .sort(compareDirectoryRoots),
      hasOverride: Boolean(settings.workspaceRoots),
    };
  }

  async updateWorkspaceRoots(roots: string[]): Promise<WorkspaceRootsSettingsResponse> {
    const normalizedRoots = await normalizeWorkspaceRootSettings(roots);
    const defaultRoots = await this.allowlistRootsFrom(this.config.workspaceRoots);
    await this.stateStore.setWorkspaceRootsOverride(
      areSameRootSet(normalizedRoots, defaultRoots) ? undefined : normalizedRoots,
    );
    return this.getWorkspaceRootSettings();
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

  async createWorkspace(
    request: CreateWorkspaceRequest,
  ): Promise<{ createdPath: string; gitInitialized: boolean; workspace: WorkspaceSummary }> {
    const allowlistRoots = await this.allowlistRoots();
    const parentRoot = await this.resolveDirectory(request.parentRoot, allowlistRoots);
    const targetRoot = path.resolve(parentRoot, request.projectName);

    if (!isPathInsideAnyRoot(targetRoot, allowlistRoots)) {
      throw new WorkspaceError(
        WORKSPACE_ERROR.WORKSPACE_OUTSIDE_ALLOWLIST,
        "New workspace path is outside configured workspaceRoots.",
      );
    }

    if (await exists(targetRoot)) {
      throw new WorkspaceError(
        WORKSPACE_ERROR.WORKSPACE_ALREADY_EXISTS,
        "Workspace folder already exists.",
      );
    }

    try {
      await fs.mkdir(targetRoot);
    } catch (error) {
      throw new WorkspaceError(
        WORKSPACE_ERROR.WORKSPACE_CREATE_FAILED,
        error instanceof Error ? error.message : "Could not create workspace folder.",
      );
    }

    let gitInitialized = false;
    if (request.gitInit ?? true) {
      try {
        await execFileAsync("git", ["init", "-b", "main"], {
          cwd: targetRoot,
          timeout: 30_000,
        });
        gitInitialized = true;
      } catch (error) {
        throw new WorkspaceError(
          WORKSPACE_ERROR.WORKSPACE_CREATE_FAILED,
          error instanceof Error ? error.message : "Could not initialize git repository.",
        );
      }
    }

    const workspace = await this.createAvailableSummary(targetRoot);
    await this.stateStore.recordRecentWorkspace({
      id: workspace.id,
      label: workspace.label,
      root: workspace.root,
    });

    return {
      createdPath: workspace.root,
      gitInitialized,
      workspace,
    };
  }

  async listWorkspaceDirectories(root?: string): Promise<WorkspaceDirectoriesResponse> {
    const allowlistRoots = await this.allowlistRoots();
    const roots = allowlistRoots.map(createDirectoryRoot).sort(compareDirectoryRoots);
    const selectedRoot = root ?? allowlistRoots[0];

    if (!selectedRoot) {
      return { roots };
    }

    const directory = await this.resolveDirectory(selectedRoot, allowlistRoots);
    return {
      roots,
      directory: await this.createDirectory(directory, allowlistRoots),
    };
  }

  async listWorkspaceRootBrowserDirectories(root?: string): Promise<WorkspaceDirectoriesResponse> {
    const currentRoots = await this.allowlistRoots();
    const defaultRoots = await this.allowlistRootsFrom(this.config.workspaceRoots);
    const shortcutRoots = unique([
      ...currentRoots,
      ...defaultRoots,
      this.config.workspaceRoot,
      homedir(),
    ]);
    const selectedRoot = root ?? currentRoots[0] ?? defaultRoots[0] ?? this.config.workspaceRoot;
    const directory = await this.resolveExistingDirectory(selectedRoot);

    return {
      roots: shortcutRoots.map(createDirectoryRoot).sort(compareDirectoryRoots),
      directory: await this.createRootBrowserDirectory(directory),
    };
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

  async getAvailableWorkspace(workspaceId: string): Promise<WorkspaceSummary> {
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

    return workspace;
  }

  private async selectWorkspaceById(workspaceId: string): Promise<WorkspaceSummary> {
    const workspace = await this.getAvailableWorkspace(workspaceId);

    await this.stateStore.recordRecentWorkspace({
      id: workspace.id,
      label: workspace.label,
      root: workspace.root,
    });

    return workspace;
  }

  private async allowlistRoots(): Promise<string[]> {
    return this.allowlistRootsFrom(await this.configuredWorkspaceRoots());
  }

  private async configuredWorkspaceRoots(): Promise<string[]> {
    const settings = await this.stateStore.getRuntimeSettings();
    return settings.workspaceRoots ?? this.config.workspaceRoots;
  }

  private async allowlistRootsFrom(configuredRoots: string[]): Promise<string[]> {
    const roots = await Promise.all(configuredRoots.map((root) => realpathDirectory(root)));
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

  private async resolveDirectory(root: string, allowlistRoots: string[]): Promise<string> {
    const realRoot = await realpathDirectory(root);
    if (!realRoot) {
      throw new WorkspaceError(
        WORKSPACE_ERROR.WORKSPACE_NOT_FOUND,
        "Workspace directory was not found.",
      );
    }

    if (!isPathInsideAnyRoot(realRoot, allowlistRoots)) {
      throw new WorkspaceError(
        WORKSPACE_ERROR.WORKSPACE_OUTSIDE_ALLOWLIST,
        "Workspace directory is outside configured workspaceRoots.",
      );
    }

    return realRoot;
  }

  private async resolveExistingDirectory(root: string): Promise<string> {
    const realRoot = await realpathDirectory(root);
    if (!realRoot) {
      throw new WorkspaceError(
        WORKSPACE_ERROR.WORKSPACE_NOT_FOUND,
        "Workspace directory was not found.",
      );
    }

    return realRoot;
  }

  private async createDirectory(
    root: string,
    allowlistRoots: string[],
  ): Promise<WorkspaceDirectory> {
    return {
      path: root,
      label: path.basename(root) || root,
      parentPath: await this.resolveParentPath(root, allowlistRoots),
      isWorkspaceCandidate: await isProjectCandidate(root),
      hasDocs: await hasDocs(root),
      children: await this.listChildDirectories(root, allowlistRoots),
    };
  }

  private async resolveParentPath(
    root: string,
    allowlistRoots: string[],
  ): Promise<string | undefined> {
    const parentPath = path.dirname(root);
    if (parentPath === root) {
      return undefined;
    }

    const realParent = await realpathDirectory(parentPath);
    if (!realParent || realParent === root || !isPathInsideAnyRoot(realParent, allowlistRoots)) {
      return undefined;
    }

    return realParent;
  }

  private async listChildDirectories(
    root: string,
    allowlistRoots: string[],
  ): Promise<WorkspaceDirectoryEntry[]> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(root, { withFileTypes: true });
    } catch {
      return [];
    }

    const children = await Promise.all(
      entries
        .filter((entry) => !shouldHideDirectory(entry.name))
        .map(async (entry): Promise<WorkspaceDirectoryEntry | undefined> => {
          const childPath = path.join(root, entry.name);
          const realChild = await realpathDirectory(childPath);
          if (!realChild || !isPathInsideAnyRoot(realChild, allowlistRoots)) {
            return undefined;
          }

          return {
            name: entry.name,
            path: realChild,
            isWorkspaceCandidate: await isProjectCandidate(realChild),
            hasDocs: await hasDocs(realChild),
          };
        }),
    );

    return children
      .filter((entry): entry is WorkspaceDirectoryEntry => Boolean(entry))
      .sort(compareDirectoryEntries);
  }

  private async createRootBrowserDirectory(root: string): Promise<WorkspaceDirectory> {
    return {
      path: root,
      label: path.basename(root) || root,
      parentPath: await this.resolveRootBrowserParentPath(root),
      isWorkspaceCandidate: await isProjectCandidate(root),
      hasDocs: await hasDocs(root),
      children: await this.listRootBrowserChildDirectories(root),
    };
  }

  private async resolveRootBrowserParentPath(root: string): Promise<string | undefined> {
    const parentPath = path.dirname(root);
    if (parentPath === root) {
      return undefined;
    }

    const realParent = await realpathDirectory(parentPath);
    return realParent && realParent !== root ? realParent : undefined;
  }

  private async listRootBrowserChildDirectories(root: string): Promise<WorkspaceDirectoryEntry[]> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(root, { withFileTypes: true });
    } catch {
      return [];
    }

    const children = await Promise.all(
      entries
        .filter((entry) => !shouldHideDirectory(entry.name))
        .map(async (entry): Promise<WorkspaceDirectoryEntry | undefined> => {
          const childPath = path.join(root, entry.name);
          const realChild = await realpathDirectory(childPath);
          if (!realChild) {
            return undefined;
          }

          return {
            name: entry.name,
            path: realChild,
            isWorkspaceCandidate: await isProjectCandidate(realChild),
            hasDocs: await hasDocs(realChild),
          };
        }),
    );

    return children
      .filter((entry): entry is WorkspaceDirectoryEntry => Boolean(entry))
      .sort(compareDirectoryEntries);
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

async function normalizeWorkspaceRootSettings(roots: string[]): Promise<string[]> {
  const normalizedRoots: string[] = [];

  for (const root of roots) {
    const realRoot = await realpathDirectory(root);
    if (!realRoot) {
      throw new WorkspaceError(
        WORKSPACE_ERROR.WORKSPACE_ROOT_INVALID,
        `Workspace root does not exist or is not a directory: ${root}`,
      );
    }

    normalizedRoots.push(realRoot);
  }

  return unique(normalizedRoots);
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

function createDirectoryRoot(root: string): WorkspaceDirectoryRoot {
  return {
    path: root,
    label: path.basename(root) || root,
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function areSameRootSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const rightSet = new Set(right);
  return left.every((root) => rightSet.has(root));
}

function compareDirectoryRoots(
  a: WorkspaceDirectoryRoot,
  b: WorkspaceDirectoryRoot,
): number {
  return a.label.localeCompare(b.label);
}

function compareDirectoryEntries(
  a: WorkspaceDirectoryEntry,
  b: WorkspaceDirectoryEntry,
): number {
  if (a.isWorkspaceCandidate !== b.isWorkspaceCandidate) {
    return a.isWorkspaceCandidate ? -1 : 1;
  }

  if (a.hasDocs !== b.hasDocs) {
    return a.hasDocs ? -1 : 1;
  }

  return a.name.localeCompare(b.name);
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

function shouldHideDirectory(name: string): boolean {
  return name.startsWith(".") || HIDDEN_DIRECTORY_NAMES.has(name);
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
