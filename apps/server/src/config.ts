import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

const rawConfigSchema = z.object({
  docRoots: z.array(z.string()).optional(),
  workspaceRoots: z.array(z.string()).optional(),
  codexCommand: z.string().optional(),
});

export type ServerConfig = {
  workspaceRoot: string;
  docRoots: string[];
  workspaceRoots: string[];
  codexCommand: string;
};

export type LoadConfigOptions = {
  workspaceRoot?: string;
  docRoots?: string[];
  workspaceRoots?: string[];
  codexCommand?: string;
};

export function loadServerConfig(options: LoadConfigOptions = {}): ServerConfig {
  const workspaceRoot = path.resolve(options.workspaceRoot ?? findWorkspaceRoot(process.cwd()));
  const configPath = path.join(workspaceRoot, "alpha-kanban.config.json");
  const fileConfig = loadConfigFile(configPath);
  const docRoots = options.docRoots ?? fileConfig.docRoots ?? ["docs"];
  const workspaceRoots = options.workspaceRoots ?? fileConfig.workspaceRoots ?? ["."];
  const codexCommand = options.codexCommand ?? fileConfig.codexCommand ?? "codex";

  return {
    workspaceRoot,
    docRoots: docRoots.map((root) => path.resolve(workspaceRoot, root)),
    workspaceRoots: workspaceRoots.map((root) => path.resolve(workspaceRoot, root)),
    codexCommand,
  };
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

function loadConfigFile(configPath: string): z.infer<typeof rawConfigSchema> {
  if (!existsSync(configPath)) {
    return {};
  }

  return rawConfigSchema.parse(JSON.parse(readFileSync(configPath, "utf8")));
}
