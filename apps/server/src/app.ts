import express, { type ErrorRequestHandler, type Express } from "express";
import { ZodError } from "zod";

import {
  appendTicketLogRequestSchema,
  appendWorkspaceChatMessageRequestSchema,
  createWorkspaceRequestSchema,
  createHealthResponse,
  codexPromptPreviewRequestSchema,
  codexWorkspacePromptPreviewRequestSchema,
  createCodexRunRequestSchema,
  createWorkspaceCodexRunRequestSchema,
  patchTicketRequestSchema,
  selectWorkspaceRequestSchema,
  updateWorkspaceRootsSettingsRequestSchema,
  updateCodexRunDefaultsRequestSchema,
  workspaceDirectoriesRequestSchema,
} from "@alpha-kanban/shared";

import { loadServerConfig, type LoadConfigOptions } from "./config";
import { CODEX_RUN_ERROR, CodexRunError, CodexRunner } from "./codexRunner";
import {
  createWorkspaceFileStore,
  FILE_ERROR,
  FileStoreError,
  MarkdownFileStore,
} from "./files";
import { MarkdownFileEventHub } from "./markdownFileEvents";
import { TicketMarkdownWriteError } from "./markdown/ticketMarkdown";
import { WORKSPACE_ERROR, WorkspaceError, WorkspaceService } from "./workspaces";

export type CreateServerAppOptions = LoadConfigOptions;
export type ServerApp = {
  app: Express;
  config: ReturnType<typeof loadServerConfig>;
  codexRunner: CodexRunner;
  fileStore: MarkdownFileStore;
  workspaceService: WorkspaceService;
};

export function createServerApp(options: CreateServerAppOptions = {}): ServerApp {
  const config = loadServerConfig(options);
  const workspaceService = new WorkspaceService(config);
  const fileStore = new MarkdownFileStore(config);
  const codexRunner = new CodexRunner(config, fileStore);
  const markdownFileEvents = new MarkdownFileEventHub();
  const scopedCodexRunners = new Map<string, CodexRunner>([
    [fileStore.workspaceId, codexRunner],
  ]);
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json());

  app.get("/api/health", (_request, response) => {
    response.json(createHealthResponse("server"));
  });

  app.get("/api/codex/models", async (_request, response, next) => {
    try {
      response.json(await codexRunner.listModels());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/codex/run-defaults", async (_request, response, next) => {
    try {
      response.json(await codexRunner.getRunDefaults());
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/codex/run-defaults", async (request, response, next) => {
    try {
      const body = updateCodexRunDefaultsRequestSchema.parse(request.body);
      response.json(await codexRunner.setRunDefaults(body));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/settings/workspace-roots", async (_request, response, next) => {
    try {
      response.json(await workspaceService.getWorkspaceRootSettings());
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/settings/workspace-roots", async (request, response, next) => {
    try {
      const body = updateWorkspaceRootsSettingsRequestSchema.parse(request.body);
      response.json(await workspaceService.updateWorkspaceRoots(body.roots));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/settings/workspace-root-browser", async (request, response, next) => {
    try {
      const query = workspaceDirectoriesRequestSchema.parse(request.query);
      response.json(await workspaceService.listWorkspaceRootBrowserDirectories(query.root));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/workspaces", async (_request, response, next) => {
    try {
      response.json(await workspaceService.listWorkspaces());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/workspace-directories", async (request, response, next) => {
    try {
      const query = workspaceDirectoriesRequestSchema.parse(request.query);
      response.json(await workspaceService.listWorkspaceDirectories(query.root));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/workspaces/select", async (request, response, next) => {
    try {
      const body = selectWorkspaceRequestSchema.parse(request.body);
      response.json({ workspace: await workspaceService.selectWorkspace(body) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/workspaces/create", async (request, response, next) => {
    try {
      const body = createWorkspaceRequestSchema.parse(request.body);
      response.status(201).json(await workspaceService.createWorkspace(body));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/workspaces/:workspaceId/files", async (request, response, next) => {
    try {
      const scopedFileStore = await createScopedFileStore(request.params.workspaceId ?? "");
      response.json({ files: await scopedFileStore.listFiles() });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/workspaces/:workspaceId/document-sets", async (request, response, next) => {
    try {
      const scopedFileStore = await createScopedFileStore(request.params.workspaceId ?? "");
      response.json({ sets: await scopedFileStore.listDocumentSets() });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/workspaces/:workspaceId/files/events", async (request, response, next) => {
    try {
      const scopedFileStore = await createScopedFileStore(request.params.workspaceId ?? "");
      const unsubscribe = await markdownFileEvents.subscribe(scopedFileStore, (event) => {
        response.write("event: markdown-file\n");
        response.write(`data: ${JSON.stringify(event)}\n\n`);
      });

      response.writeHead(200, {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream",
      });
      response.write(": connected\n\n");

      request.on("close", unsubscribe);
    } catch (error) {
      next(error);
    }
  });

  app.get(
    "/api/workspaces/:workspaceId/files/:fileId/markdown",
    async (request, response, next) => {
      try {
        const scopedFileStore = await createScopedFileStore(request.params.workspaceId ?? "");
        response.json(await scopedFileStore.readMarkdownDocument(request.params.fileId ?? ""));
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/workspaces/:workspaceId/files/:fileId/tickets",
    async (request, response, next) => {
      try {
        const scopedFileStore = await createScopedFileStore(request.params.workspaceId ?? "");
        response.json(await scopedFileStore.readTicketDocument(request.params.fileId ?? ""));
      } catch (error) {
        next(error);
      }
    },
  );

  app.patch(
    "/api/workspaces/:workspaceId/files/:fileId/tickets/:ticketId",
    async (request, response, next) => {
      try {
        const body = patchTicketRequestSchema.parse(request.body);
        const scopedFileStore = await createScopedFileStore(request.params.workspaceId ?? "");
        response.json(
          await scopedFileStore.patchTicket(
            request.params.fileId ?? "",
            request.params.ticketId ?? "",
            {
              status: body.status,
              progress: body.progress,
              expectedHash: body.expectedHash,
              expectedMtimeMs: body.expectedMtimeMs,
            },
          ),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/files/:fileId/tickets/:ticketId/instructions",
    async (request, response, next) => {
      try {
        const body = appendTicketLogRequestSchema.parse(request.body);
        const scopedFileStore = await createScopedFileStore(request.params.workspaceId ?? "");
        response.json(
          await scopedFileStore.appendInstruction(
            request.params.fileId ?? "",
            request.params.ticketId ?? "",
            {
              text: body.text,
              date: body.date,
              expectedHash: body.expectedHash,
              expectedMtimeMs: body.expectedMtimeMs,
            },
          ),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/files/:fileId/tickets/:ticketId/progress-notes",
    async (request, response, next) => {
      try {
        const body = appendTicketLogRequestSchema.parse(request.body);
        const scopedFileStore = await createScopedFileStore(request.params.workspaceId ?? "");
        response.json(
          await scopedFileStore.appendProgressNote(
            request.params.fileId ?? "",
            request.params.ticketId ?? "",
            {
              text: body.text,
              date: body.date,
              expectedHash: body.expectedHash,
              expectedMtimeMs: body.expectedMtimeMs,
            },
          ),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/workspaces/:workspaceId/files/:fileId/tickets/:ticketId/chat",
    async (request, response, next) => {
      try {
        const runner = await createScopedCodexRunner(request.params.workspaceId ?? "");
        response.json(
          await runner.getTicketChat(
            request.params.fileId ?? "",
            request.params.ticketId ?? "",
          ),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  app.delete(
    "/api/workspaces/:workspaceId/files/:fileId/tickets/:ticketId/chat/:messageId",
    async (request, response, next) => {
      try {
        const runner = await createScopedCodexRunner(request.params.workspaceId ?? "");
        response.json(
          await runner.deleteTicketChatMessage(
            request.params.fileId ?? "",
            request.params.ticketId ?? "",
            request.params.messageId ?? "",
          ),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  app.get("/api/workspaces/:workspaceId/workspace-chat", async (request, response, next) => {
    try {
      const runner = await createScopedCodexRunner(request.params.workspaceId ?? "");
      response.json(await runner.getWorkspaceChat());
    } catch (error) {
      next(error);
    }
  });

  app.post(
    "/api/workspaces/:workspaceId/workspace-chat/messages",
    async (request, response, next) => {
      try {
        const body = appendWorkspaceChatMessageRequestSchema.parse(request.body);
        const runner = await createScopedCodexRunner(request.params.workspaceId ?? "");
        response.json(
          await runner.appendWorkspaceUserMessage({
            instructionDraft: body.content,
          }),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/workspace-chat/prompt-preview",
    async (request, response, next) => {
      try {
        const body = codexWorkspacePromptPreviewRequestSchema.parse(request.body);
        const runner = await createScopedCodexRunner(request.params.workspaceId ?? "");
        response.json(await runner.previewWorkspacePrompt(body));
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/workspace-chat/runs",
    async (request, response, next) => {
      try {
        const body = createWorkspaceCodexRunRequestSchema.parse(request.body);
        const runner = await createScopedCodexRunner(request.params.workspaceId ?? "");
        response.status(202).json({ run: await runner.startWorkspaceRun(body) });
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/codex/prompt-preview",
    async (request, response, next) => {
      try {
        const body = codexPromptPreviewRequestSchema.parse(request.body);
        const runner = await createScopedCodexRunner(request.params.workspaceId ?? "");
        response.json(await runner.previewPrompt(body));
      } catch (error) {
        next(error);
      }
    },
  );

  app.post("/api/workspaces/:workspaceId/codex/runs", async (request, response, next) => {
    try {
      const body = createCodexRunRequestSchema.parse(request.body);
      const runner = await createScopedCodexRunner(request.params.workspaceId ?? "");
      response.status(202).json({ run: await runner.startRun(body) });
    } catch (error) {
      next(error);
    }
  });

  app.get(
    "/api/workspaces/:workspaceId/files/:fileId/codex-run-summary",
    async (request, response, next) => {
      try {
        const runner = await createScopedCodexRunner(request.params.workspaceId ?? "");
        const scopedFileStore = await createScopedFileStore(request.params.workspaceId ?? "");
        const fileId = request.params.fileId ?? "";
        scopedFileStore.resolveFileId(fileId);
        response.json(await runner.getDocumentRunSummary(fileId));
      } catch (error) {
        next(error);
      }
    },
  );

  app.get("/api/files", async (_request, response, next) => {
    try {
      response.json({ files: await fileStore.listFiles() });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/document-sets", async (_request, response, next) => {
    try {
      response.json({ sets: await fileStore.listDocumentSets() });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/files/:fileId/markdown", async (request, response, next) => {
    try {
      response.json(await fileStore.readMarkdownDocument(request.params.fileId ?? ""));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/files/:fileId/tickets", async (request, response, next) => {
    try {
      response.json(await fileStore.readTicketDocument(request.params.fileId ?? ""));
    } catch (error) {
      next(error);
    }
  });

  app.patch(
    "/api/files/:fileId/tickets/:ticketId",
    async (request, response, next) => {
      try {
        const body = patchTicketRequestSchema.parse(request.body);
        response.json(
          await fileStore.patchTicket(request.params.fileId ?? "", request.params.ticketId ?? "", {
            status: body.status,
            progress: body.progress,
            expectedHash: body.expectedHash,
            expectedMtimeMs: body.expectedMtimeMs,
          }),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/files/:fileId/tickets/:ticketId/instructions",
    async (request, response, next) => {
      try {
        const body = appendTicketLogRequestSchema.parse(request.body);
        response.json(
          await fileStore.appendInstruction(
            request.params.fileId ?? "",
            request.params.ticketId ?? "",
            {
              text: body.text,
              date: body.date,
              expectedHash: body.expectedHash,
              expectedMtimeMs: body.expectedMtimeMs,
            },
          ),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/files/:fileId/tickets/:ticketId/progress-notes",
    async (request, response, next) => {
      try {
        const body = appendTicketLogRequestSchema.parse(request.body);
        response.json(
          await fileStore.appendProgressNote(
            request.params.fileId ?? "",
            request.params.ticketId ?? "",
            {
              text: body.text,
              date: body.date,
              expectedHash: body.expectedHash,
              expectedMtimeMs: body.expectedMtimeMs,
            },
          ),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  app.get("/api/files/:fileId/tickets/:ticketId/chat", async (request, response, next) => {
    try {
      response.json(
        await codexRunner.getTicketChat(
          request.params.fileId ?? "",
          request.params.ticketId ?? "",
        ),
      );
    } catch (error) {
      next(error);
    }
  });

  app.delete(
    "/api/files/:fileId/tickets/:ticketId/chat/:messageId",
    async (request, response, next) => {
      try {
        response.json(
          await codexRunner.deleteTicketChatMessage(
            request.params.fileId ?? "",
            request.params.ticketId ?? "",
            request.params.messageId ?? "",
          ),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  app.post("/api/codex/prompt-preview", async (request, response, next) => {
    try {
      const body = codexPromptPreviewRequestSchema.parse(request.body);
      response.json(await codexRunner.previewPrompt(body));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/codex/runs", async (request, response, next) => {
    try {
      const body = createCodexRunRequestSchema.parse(request.body);
      response.status(202).json({ run: await codexRunner.startRun(body) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/files/:fileId/codex-run-summary", async (request, response, next) => {
    try {
      const fileId = request.params.fileId ?? "";
      fileStore.resolveFileId(fileId);
      response.json(await codexRunner.getDocumentRunSummary(fileId));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/codex/runs/:runId", async (request, response, next) => {
    try {
      const runId = request.params.runId ?? "";
      try {
        const runner = findCodexRunnerByRunId(runId);
        response.json({ run: runner.getRun(runId) });
      } catch (error) {
        if (!(error instanceof CodexRunError) || error.code !== CODEX_RUN_ERROR.RUN_NOT_FOUND) {
          throw error;
        }
        response.json({ run: await codexRunner.getArchivedRun(runId) });
      }
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/codex/runs/:runId/events", (request, response, next) => {
    try {
      const runId = request.params.runId ?? "";
      const runner = findCodexRunnerByRunId(runId);

      response.writeHead(200, {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream",
      });

      const unsubscribe = runner.subscribe(runId, (event) => {
        response.write(`id: ${event.id}\n`);
        response.write("event: codex\n");
        response.write(`data: ${JSON.stringify(event)}\n\n`);
      });

      request.on("close", unsubscribe);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/codex/runs/:runId/cancel", async (request, response, next) => {
    try {
      const runId = request.params.runId ?? "";
      const runner = findCodexRunnerByRunId(runId);
      response.json({ run: await runner.cancelRun(runId) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/codex/runs/:runId/read", async (request, response, next) => {
    try {
      const runId = request.params.runId ?? "";
      const runner = findCodexRunnerByRunId(runId);
      response.json({ run: await runner.markRunRead(runId) });
    } catch (error) {
      next(error);
    }
  });

  app.use(errorHandler);

  return { app, config, codexRunner, fileStore, workspaceService };

  async function createScopedFileStore(workspaceId: string): Promise<MarkdownFileStore> {
    const workspace = await workspaceService.getAvailableWorkspace(workspaceId);
    return createWorkspaceFileStore(config, workspace);
  }

  async function createScopedCodexRunner(workspaceId: string): Promise<CodexRunner> {
    const scopedFileStore = await createScopedFileStore(workspaceId);
    const existing = scopedCodexRunners.get(scopedFileStore.workspaceId);
    if (existing) {
      return existing;
    }

    const runner = new CodexRunner(config, scopedFileStore);
    scopedCodexRunners.set(scopedFileStore.workspaceId, runner);
    return runner;
  }

  function findCodexRunnerByRunId(runId: string): CodexRunner {
    for (const runner of scopedCodexRunners.values()) {
      try {
        runner.getRun(runId);
        return runner;
      } catch (error) {
        if (!(error instanceof CodexRunError) || error.code !== CODEX_RUN_ERROR.RUN_NOT_FOUND) {
          throw error;
        }
      }
    }

    throw new CodexRunError(CODEX_RUN_ERROR.RUN_NOT_FOUND, "Codex run was not found.");
  }
}

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  const apiError = normalizeError(error);
  response.status(apiError.status).json({
    error: {
      code: apiError.code,
      message: apiError.message,
    },
  });
};

function normalizeError(error: unknown): {
  code: string;
  message: string;
  status: number;
} {
  if (error instanceof ZodError) {
    return {
      code: "BAD_REQUEST",
      message: error.issues.map((issue) => issue.message).join("; "),
      status: 400,
    };
  }

  if (error instanceof FileStoreError) {
    return {
      code: error.code,
      message: error.message,
      status: fileErrorStatus(error.code),
    };
  }

  if (error instanceof WorkspaceError) {
    return {
      code: error.code,
      message: error.message,
      status: workspaceErrorStatus(error.code),
    };
  }

  if (error instanceof TicketMarkdownWriteError) {
    return {
      code: error.code,
      message: error.message,
      status: 409,
    };
  }

  if (error instanceof CodexRunError) {
    return {
      code: error.code,
      message: error.message,
      status: codexRunErrorStatus(error.code),
    };
  }

  return {
    code: "INTERNAL_ERROR",
    message: error instanceof Error ? error.message : "Unknown error",
    status: 500,
  };
}

function codexRunErrorStatus(code: string): number {
  switch (code) {
    case CODEX_RUN_ERROR.DOCUMENT_RUN_ACTIVE:
      return 409;
    case CODEX_RUN_ERROR.CHAT_MESSAGE_NOT_FOUND:
      return 404;
    case CODEX_RUN_ERROR.SCOPE_NOT_ALLOWED:
      return 409;
    case CODEX_RUN_ERROR.RUN_NOT_FOUND:
      return 404;
    case CODEX_RUN_ERROR.NOT_RUNNING:
      return 409;
    default:
      return 500;
  }
}

function fileErrorStatus(code: string): number {
  switch (code) {
    case FILE_ERROR.FILE_NOT_FOUND:
      return 404;
    case FILE_ERROR.FORBIDDEN_PATH:
      return 403;
    case FILE_ERROR.STALE_FILE:
      return 409;
    default:
      return 500;
  }
}

function workspaceErrorStatus(code: string): number {
  switch (code) {
    case WORKSPACE_ERROR.WORKSPACE_NOT_FOUND:
      return 404;
    case WORKSPACE_ERROR.WORKSPACE_ROOT_INVALID:
      return 400;
    case WORKSPACE_ERROR.WORKSPACE_ALREADY_EXISTS:
      return 409;
    case WORKSPACE_ERROR.WORKSPACE_OUTSIDE_ALLOWLIST:
      return 403;
    case WORKSPACE_ERROR.WORKSPACE_CREATE_FAILED:
      return 500;
    case WORKSPACE_ERROR.WORKSPACE_UNAVAILABLE:
      return 410;
    default:
      return 500;
  }
}
