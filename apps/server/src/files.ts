import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import type {
  MarkdownFileSummary,
  MarkdownFileType,
  TicketDocumentResponse,
} from "@alpha-kanban/shared";

import type { ServerConfig } from "./config";
import {
  appendProgressNote,
  appendUserInstruction,
  parseTicketDocument,
  updateTicketStatusAndProgress,
} from "./markdown/ticketMarkdown";

export const FILE_ERROR = {
  FILE_NOT_FOUND: "FILE_NOT_FOUND",
  FORBIDDEN_PATH: "FORBIDDEN_PATH",
  STALE_FILE: "STALE_FILE",
} as const;

export type FileErrorCode = (typeof FILE_ERROR)[keyof typeof FILE_ERROR];

export class FileStoreError extends Error {
  readonly code: FileErrorCode;

  constructor(code: FileErrorCode, message: string) {
    super(message);
    this.name = "FileStoreError";
    this.code = code;
  }
}

export type WriteGuard = {
  expectedHash?: string;
  expectedMtimeMs?: number;
};

export type PatchTicketOptions = WriteGuard & {
  status?: Parameters<typeof updateTicketStatusAndProgress>[2]["status"];
  progress?: Parameters<typeof updateTicketStatusAndProgress>[2]["progress"];
};

export type AppendLogOptions = WriteGuard & {
  text: string;
  date?: string;
};

export class MarkdownFileStore {
  readonly config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
  }

  async listFiles(): Promise<MarkdownFileSummary[]> {
    const files: MarkdownFileSummary[] = [];

    for (const root of this.config.docRoots) {
      if (!(await exists(root))) {
        continue;
      }

      for (const filePath of await findMarkdownFiles(root)) {
        files.push(await this.createSummary(filePath));
      }
    }

    return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }

  async readTicketDocument(fileId: string): Promise<TicketDocumentResponse> {
    const filePath = this.resolveFileId(fileId);
    const file = await this.createSummary(filePath);
    const markdown = await fs.readFile(filePath, "utf8");

    return {
      file,
      document: parseTicketDocument(markdown),
    };
  }

  async patchTicket(
    fileId: string,
    ticketId: string,
    options: PatchTicketOptions,
  ): Promise<TicketDocumentResponse> {
    return this.updateTicketFile(fileId, options, (markdown) =>
      updateTicketStatusAndProgress(markdown, ticketId, {
        status: options.status,
        progress: options.progress,
      }),
    );
  }

  async appendInstruction(
    fileId: string,
    ticketId: string,
    options: AppendLogOptions,
  ): Promise<TicketDocumentResponse> {
    return this.updateTicketFile(fileId, options, (markdown) =>
      appendUserInstruction(markdown, ticketId, options.text, {
        date: options.date,
      }),
    );
  }

  async appendProgressNote(
    fileId: string,
    ticketId: string,
    options: AppendLogOptions,
  ): Promise<TicketDocumentResponse> {
    return this.updateTicketFile(fileId, options, (markdown) =>
      appendProgressNote(markdown, ticketId, options.text, {
        date: options.date,
      }),
    );
  }

  encodeFileId(filePath: string): string {
    const relativePath = normalizeRelativePath(
      path.relative(this.config.workspaceRoot, filePath),
    );
    return Buffer.from(relativePath, "utf8").toString("base64url");
  }

  resolveFileId(fileId: string): string {
    let relativePath: string;

    try {
      relativePath = Buffer.from(fileId, "base64url").toString("utf8");
    } catch {
      throw new FileStoreError(FILE_ERROR.FORBIDDEN_PATH, "Invalid file id.");
    }

    if (
      !relativePath ||
      path.isAbsolute(relativePath) ||
      relativePath.split(/[\\/]/).includes("..")
    ) {
      throw new FileStoreError(FILE_ERROR.FORBIDDEN_PATH, "File id is outside the workspace.");
    }

    const filePath = path.resolve(this.config.workspaceRoot, relativePath);
    this.assertAllowedFile(filePath);

    return filePath;
  }

  private async updateTicketFile(
    fileId: string,
    guard: WriteGuard,
    updater: (markdown: string) => string,
  ): Promise<TicketDocumentResponse> {
    const filePath = this.resolveFileId(fileId);
    const before = await this.readWithMetadata(filePath);
    assertFresh(before.summary, guard);
    const nextMarkdown = updater(before.markdown);

    if (nextMarkdown !== before.markdown) {
      await atomicWrite(filePath, nextMarkdown);
    }

    return this.readTicketDocument(fileId);
  }

  private async createSummary(filePath: string): Promise<MarkdownFileSummary> {
    this.assertAllowedFile(filePath);

    const [stat, markdown] = await Promise.all([
      fs.stat(filePath).catch((error: unknown) => {
        if (isNodeError(error, "ENOENT")) {
          throw new FileStoreError(FILE_ERROR.FILE_NOT_FOUND, "Markdown file was not found.");
        }
        throw error;
      }),
      fs.readFile(filePath, "utf8"),
    ]);

    const relativePath = normalizeRelativePath(
      path.relative(this.config.workspaceRoot, filePath),
    );

    return {
      id: this.encodeFileId(filePath),
      type: inferMarkdownFileType(filePath),
      filename: path.basename(filePath),
      relativePath,
      absolutePath: filePath,
      mtimeMs: stat.mtimeMs,
      hash: createHash("sha256").update(markdown).digest("hex"),
      slug: inferSlug(filePath),
    };
  }

  private async readWithMetadata(
    filePath: string,
  ): Promise<{ markdown: string; summary: MarkdownFileSummary }> {
    const [markdown, summary] = await Promise.all([
      fs.readFile(filePath, "utf8"),
      this.createSummary(filePath),
    ]);

    return { markdown, summary };
  }

  private assertAllowedFile(filePath: string): void {
    const resolvedFile = path.resolve(filePath);
    const inDocRoot = this.config.docRoots.some((root) =>
      isPathInside(resolvedFile, root),
    );

    if (!inDocRoot || path.extname(resolvedFile) !== ".md") {
      throw new FileStoreError(FILE_ERROR.FORBIDDEN_PATH, "Path is outside configured docRoots.");
    }
  }
}

function assertFresh(summary: MarkdownFileSummary, guard: WriteGuard): void {
  if (guard.expectedHash && guard.expectedHash !== summary.hash) {
    throw new FileStoreError(FILE_ERROR.STALE_FILE, "Markdown file hash changed.");
  }

  if (
    guard.expectedMtimeMs !== undefined &&
    Math.abs(guard.expectedMtimeMs - summary.mtimeMs) > 0.001
  ) {
    throw new FileStoreError(FILE_ERROR.STALE_FILE, "Markdown file mtime changed.");
  }
}

async function findMarkdownFiles(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(root, entry.name);

      if (entry.isDirectory()) {
        return findMarkdownFiles(entryPath);
      }

      if (entry.isFile() && entry.name.endsWith(".md")) {
        return [entryPath];
      }

      return [];
    }),
  );

  return files.flat();
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function atomicWrite(filePath: string, contents: string): Promise<void> {
  const directory = path.dirname(filePath);
  const tempPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  );

  await fs.writeFile(tempPath, contents, "utf8");
  await fs.rename(tempPath, filePath);
}

function inferMarkdownFileType(filePath: string): MarkdownFileType {
  const basename = path.basename(filePath);

  if (basename.endsWith("_tickets.md")) {
    return "tickets";
  }
  if (basename.endsWith("_plan.md")) {
    return "plan";
  }
  if (basename.endsWith("_inventory.md")) {
    return "inventory";
  }
  return "markdown";
}

function inferSlug(filePath: string): string {
  return path
    .basename(filePath, ".md")
    .replace(/^\d+_/, "")
    .replace(/_(tickets|plan|inventory)$/, "");
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

function isPathInside(filePath: string, root: string): boolean {
  const relativePath = path.relative(root, filePath);
  return Boolean(relativePath) && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
