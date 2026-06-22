import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";

import {
  alphaKanbanConfigFileSchema,
  type AlphaKanbanConfigFile,
} from "@alpha-kanban/shared";

export type ServerConfig = {
  workspaceRoot: string;
  workspaceId: string;
  defaultDocRootEntries: string[];
  defaultDocRoots: string[];
  docRoots: string[];
  workspaceRoots: string[];
  codexCommand: string;
};

export type LoadConfigOptions = {
  workspaceRoot?: string;
  defaultDocRoots?: string[];
  docRoots?: string[];
  workspaceRoots?: string[];
  codexCommand?: string;
};

export function loadServerConfig(options: LoadConfigOptions = {}): ServerConfig {
  const workspaceRoot = path.resolve(options.workspaceRoot ?? findWorkspaceRoot(process.cwd()));
  const configPath = path.join(workspaceRoot, "alpha-kanban.config.json");
  const fileConfig = loadConfigFile(configPath);
  const defaultDocRoots =
    options.defaultDocRoots ??
    options.docRoots ??
    fileConfig.defaultDocRoots ??
    fileConfig.docRoots ??
    ["docs"];
  const workspaceRoots = options.workspaceRoots ?? fileConfig.workspaceRoots ?? ["."];
  const codexCommand = options.codexCommand ?? fileConfig.codexCommand ?? "codex";
  const resolvedDefaultDocRoots = defaultDocRoots.map((root) =>
    resolveFromWorkspace(workspaceRoot, root),
  );

  return {
    workspaceRoot,
    workspaceId: createWorkspaceId(workspaceRoot),
    defaultDocRootEntries: defaultDocRoots,
    defaultDocRoots: resolvedDefaultDocRoots,
    docRoots: resolvedDefaultDocRoots,
    workspaceRoots: workspaceRoots.map((root) => resolveFromWorkspace(workspaceRoot, root)),
    codexCommand,
  };
}

export function createWorkspaceId(workspaceRoot: string): string {
  const normalizedRoot = normalizeRealPath(workspaceRoot);
  const hash = createHash("sha256").update(normalizedRoot).digest("hex").slice(0, 16);
  return `w_${hash}`;
}

function findWorkspaceRoot(startPath: string): string {
  let currentPath = path.resolve(startPath);

  while (true) {
    if (
      existsSync(path.join(currentPath, "alpha-kanban.config.json")) ||
      existsSync(path.join(currentPath, "pnpm-workspace.yaml"))
    ) {
      return currentPath;
    }

    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      return path.resolve(startPath);
    }
    currentPath = parentPath;
  }
}

function loadConfigFile(configPath: string): AlphaKanbanConfigFile {
  if (!existsSync(configPath)) {
    return {};
  }

  return alphaKanbanConfigFileSchema.parse(JSON.parse(readFileSync(configPath, "utf8")));
}

function resolveFromWorkspace(workspaceRoot: string, targetPath: string): string {
  return path.isAbsolute(targetPath)
    ? path.resolve(targetPath)
    : path.resolve(workspaceRoot, targetPath);
}

function normalizeRealPath(workspaceRoot: string): string {
  const resolvedRoot = path.resolve(workspaceRoot);
  const realRoot = existsSync(resolvedRoot) ? realpathSync.native(resolvedRoot) : resolvedRoot;
  return path.normalize(realRoot).split(path.sep).join("/");
}
