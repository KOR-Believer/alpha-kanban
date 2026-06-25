import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import type {
  DocumentSetSummary,
  MarkdownFileChangeEvent,
  MarkdownDocumentResponse,
  MarkdownFileSummary,
  MarkdownFileType,
  MarkdownHeading,
  TicketDocumentResponse,
  WorkspaceSummary,
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

type MarkdownFileStoreOptions = {
  docRoots?: string[];
  workspaceId?: string;
  workspaceRoot?: string;
};

export class MarkdownFileStore {
  readonly config: ServerConfig;
  readonly docRoots: string[];
  readonly workspaceId: string;
  readonly workspaceRoot: string;

  constructor(config: ServerConfig, options: MarkdownFileStoreOptions = {}) {
    this.config = config;
    this.workspaceRoot = options.workspaceRoot ?? config.workspaceRoot;
    this.workspaceId = options.workspaceId ?? config.workspaceId;
    this.docRoots = options.docRoots ?? config.docRoots;
  }

  async listFiles(): Promise<MarkdownFileSummary[]> {
    const files: MarkdownFileSummary[] = [];

    for (const root of this.docRoots) {
      if (!(await exists(root))) {
        continue;
      }

      for (const filePath of await findMarkdownFiles(root)) {
        files.push(await this.createSummary(filePath));
      }
    }

    return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }

  async listDocumentSets(): Promise<DocumentSetSummary[]> {
    const sets = buildDocumentSets(await this.listFiles());

    return Promise.all(
      sets.map(async (documentSet) => this.withTicketProgress(documentSet)),
    );
  }

  async readMarkdownDocument(fileId: string): Promise<MarkdownDocumentResponse> {
    const filePath = this.resolveFileId(fileId);
    const [file, markdown] = await Promise.all([
      this.createSummary(filePath),
      fs.readFile(filePath, "utf8"),
    ]);

    return {
      file,
      markdown,
      outline: parseMarkdownOutline(markdown),
    };
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

  async describeFileChange(filePath: string): Promise<MarkdownFileChangeEvent | undefined> {
    const resolvedFile = path.resolve(filePath);
    if (path.extname(resolvedFile) !== ".md") {
      return undefined;
    }

    try {
      this.assertAllowedFile(resolvedFile);
    } catch (error) {
      if (
        error instanceof FileStoreError &&
        error.code === FILE_ERROR.FORBIDDEN_PATH
      ) {
        return undefined;
      }
      throw error;
    }

    try {
      const file = await this.createSummary(resolvedFile);
      return {
        eventType: "changed",
        workspaceId: this.workspaceId,
        fileId: file.id,
        relativePath: file.relativePath,
        workspaceRelativePath: file.workspaceRelativePath,
        absolutePath: file.absolutePath,
        observedAt: new Date().toISOString(),
        file,
      };
    } catch (error) {
      if (
        error instanceof FileStoreError &&
        error.code === FILE_ERROR.FILE_NOT_FOUND
      ) {
        const relativePath = normalizeRelativePath(
          path.relative(this.workspaceRoot, resolvedFile),
        );
        return {
          eventType: "removed",
          workspaceId: this.workspaceId,
          fileId: this.encodeFileId(resolvedFile),
          relativePath,
          workspaceRelativePath: relativePath,
          absolutePath: resolvedFile,
          observedAt: new Date().toISOString(),
        };
      }
      throw error;
    }
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
      path.relative(this.workspaceRoot, filePath),
    );
    return Buffer.from(
      JSON.stringify({
        workspaceId: this.workspaceId,
        path: relativePath,
      }),
      "utf8",
    ).toString("base64url");
  }

  resolveFileId(fileId: string): string {
    let relativePath: string;

    try {
      relativePath = Buffer.from(fileId, "base64url").toString("utf8");
    } catch {
      throw new FileStoreError(FILE_ERROR.FORBIDDEN_PATH, "Invalid file id.");
    }

    relativePath = this.decodeFileIdPayload(relativePath);

    if (
      !relativePath ||
      path.isAbsolute(relativePath) ||
      relativePath.split(/[\\/]/).includes("..")
    ) {
      throw new FileStoreError(FILE_ERROR.FORBIDDEN_PATH, "File id is outside the workspace.");
    }

    const filePath = path.resolve(this.workspaceRoot, relativePath);
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
      path.relative(this.workspaceRoot, filePath),
    );
    const directory = normalizeDirectory(path.dirname(relativePath));

    return {
      id: this.encodeFileId(filePath),
      workspaceId: this.workspaceId,
      type: inferMarkdownFileType(filePath),
      filename: path.basename(filePath),
      directory,
      relativePath,
      workspaceRelativePath: relativePath,
      absolutePath: filePath,
      mtimeMs: stat.mtimeMs,
      hash: createHash("sha256").update(markdown).digest("hex"),
      slug: inferSlug(filePath),
      sequenceNumber: inferSequenceNumber(filePath),
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
    const inDocRoot = this.docRoots.some((root) =>
      isPathInside(resolvedFile, root),
    );

    if (!inDocRoot || path.extname(resolvedFile) !== ".md") {
      throw new FileStoreError(FILE_ERROR.FORBIDDEN_PATH, "Path is outside configured docRoots.");
    }
  }

  private decodeFileIdPayload(payload: string): string {
    try {
      const decoded = JSON.parse(payload) as unknown;
      if (!isRecord(decoded)) {
        return payload;
      }

      if (decoded.workspaceId !== this.workspaceId) {
        throw new FileStoreError(FILE_ERROR.FORBIDDEN_PATH, "File id belongs to another workspace.");
      }

      return typeof decoded.path === "string" ? decoded.path : "";
    } catch (error) {
      if (error instanceof FileStoreError) {
        throw error;
      }
      return payload;
    }
  }

  private async withTicketProgress(
    documentSet: DocumentSetSummary,
  ): Promise<DocumentSetSummary> {
    const ticketsFile = documentSet.documents.find((file) => file.type === "tickets");
    if (!ticketsFile) {
      return documentSet;
    }

    try {
      const markdown = await fs.readFile(ticketsFile.absolutePath, "utf8");
      const parsed = parseTicketDocument(markdown);
      return {
        ...documentSet,
        ticketProgress: {
          doneTickets: parsed.status.doneTickets,
          totalTickets: parsed.status.totalTickets,
        },
      };
    } catch {
      return documentSet;
    }
  }
}

export function buildDocumentSets(files: MarkdownFileSummary[]): DocumentSetSummary[] {
  const groups = new Map<string, MarkdownFileSummary[]>();

  for (const file of files) {
    const key = `${file.workspaceId}::${file.directory}::${file.slug}`;
    groups.set(key, [...(groups.get(key) ?? []), file]);
  }

  return [...groups.values()]
    .map((documents) => {
      const sortedDocuments = [...documents].sort(compareDocumentFiles);
      const primaryFile = choosePrimaryFile(sortedDocuments);
      const sequenceNumber = minSequenceNumber(sortedDocuments);
      const types = uniqueTypes(sortedDocuments);

      return {
        id: encodeDocumentSetId({
          directory: primaryFile.directory,
          slug: primaryFile.slug,
          workspaceId: primaryFile.workspaceId,
        }),
        workspaceId: primaryFile.workspaceId,
        directory: primaryFile.directory,
        slug: primaryFile.slug,
        label: formatDocumentSetLabel(primaryFile.slug),
        sequenceNumber,
        documents: sortedDocuments,
        types,
        primaryFile,
      };
    })
    .sort(compareDocumentSets);
}

export function createWorkspaceFileStore(
  config: ServerConfig,
  workspace: Pick<WorkspaceSummary, "id" | "root">,
): MarkdownFileStore {
  return new MarkdownFileStore(config, {
    workspaceId: workspace.id,
    workspaceRoot: workspace.root,
    docRoots: config.defaultDocRootEntries.map((root) => resolveFromWorkspace(workspace.root, root)),
  });
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

function inferSequenceNumber(filePath: string): number | undefined {
  const match = /^(\d+)_/.exec(path.basename(filePath));
  if (!match?.[1]) {
    return undefined;
  }

  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

function normalizeDirectory(directory: string): string {
  return directory === "." ? "" : normalizeRelativePath(directory);
}

function parseMarkdownOutline(markdown: string): MarkdownHeading[] {
  return markdown.split(/\r?\n/).flatMap((line, index) => {
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match?.[1] || !match[2]?.trim()) {
      return [];
    }

    return [
      {
        level: match[1].length,
        title: match[2].trim(),
        line: index + 1,
      },
    ];
  });
}

function compareDocumentFiles(
  left: MarkdownFileSummary,
  right: MarkdownFileSummary,
): number {
  return (
    documentTypeSortOrder(left.type) - documentTypeSortOrder(right.type) ||
    (left.sequenceNumber ?? Number.MAX_SAFE_INTEGER) -
      (right.sequenceNumber ?? Number.MAX_SAFE_INTEGER) ||
    left.relativePath.localeCompare(right.relativePath)
  );
}

function compareDocumentSets(
  left: DocumentSetSummary,
  right: DocumentSetSummary,
): number {
  return (
    (left.sequenceNumber ?? Number.MAX_SAFE_INTEGER) -
      (right.sequenceNumber ?? Number.MAX_SAFE_INTEGER) ||
    left.directory.localeCompare(right.directory) ||
    left.label.localeCompare(right.label)
  );
}

function choosePrimaryFile(files: MarkdownFileSummary[]): MarkdownFileSummary {
  return (
    files.find((file) => file.type === "tickets") ??
    files.find((file) => file.type === "plan") ??
    files.find((file) => file.type === "inventory") ??
    files[0] ??
    unreachablePrimaryFile()
  );
}

function unreachablePrimaryFile(): never {
  throw new Error("Document set requires at least one file.");
}

function uniqueTypes(files: MarkdownFileSummary[]): MarkdownFileType[] {
  return [...new Set(files.map((file) => file.type))].sort(
    (left, right) => documentTypeSortOrder(left) - documentTypeSortOrder(right),
  );
}

function minSequenceNumber(files: MarkdownFileSummary[]): number | undefined {
  const values = files
    .map((file) => file.sequenceNumber)
    .filter((value): value is number => value !== undefined);
  return values.length > 0 ? Math.min(...values) : undefined;
}

function documentTypeSortOrder(type: MarkdownFileType): number {
  return {
    plan: 0,
    tickets: 1,
    inventory: 2,
    markdown: 3,
  }[type];
}

function encodeDocumentSetId(input: {
  directory: string;
  slug: string;
  workspaceId: string;
}): string {
  return Buffer.from(JSON.stringify(input), "utf8").toString("base64url");
}

function formatDocumentSetLabel(slug: string): string {
  return slug.replace(/[_-]+/g, " ");
}

function isPathInside(filePath: string, root: string): boolean {
  const relativePath = path.relative(root, filePath);
  return Boolean(relativePath) && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function resolveFromWorkspace(workspaceRoot: string, targetPath: string): string {
  return path.isAbsolute(targetPath)
    ? path.resolve(targetPath)
    : path.resolve(workspaceRoot, targetPath);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
