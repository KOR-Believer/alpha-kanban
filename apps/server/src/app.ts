import express, { type ErrorRequestHandler, type Express } from "express";
import { ZodError } from "zod";

import {
  appendTicketLogRequestSchema,
  createHealthResponse,
  codexPromptPreviewRequestSchema,
  createCodexRunRequestSchema,
  patchTicketRequestSchema,
  selectWorkspaceRequestSchema,
} from "@alpha-kanban/shared";

import { loadServerConfig, type LoadConfigOptions } from "./config";
import { CODEX_RUN_ERROR, CodexRunError, CodexRunner } from "./codexRunner";
import {
  createWorkspaceFileStore,
  FILE_ERROR,
  FileStoreError,
  MarkdownFileStore,
} from "./files";
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
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json());

  app.get("/api/health", (_request, response) => {
    response.json(createHealthResponse("server"));
  });

  app.get("/api/workspaces", async (_request, response, next) => {
    try {
      response.json(await workspaceService.listWorkspaces());
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

  app.get("/api/workspaces/:workspaceId/files", async (request, response, next) => {
    try {
      const scopedFileStore = await createScopedFileStore(request.params.workspaceId ?? "");
      response.json({ files: await scopedFileStore.listFiles() });
    } catch (error) {
      next(error);
    }
  });

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

  app.get("/api/files", async (_request, response, next) => {
    try {
      response.json({ files: await fileStore.listFiles() });
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

  app.get("/api/codex/runs/:runId", (request, response, next) => {
    try {
      response.json({ run: codexRunner.getRun(request.params.runId ?? "") });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/codex/runs/:runId/events", (request, response, next) => {
    try {
      response.writeHead(200, {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream",
      });

      const unsubscribe = codexRunner.subscribe(request.params.runId ?? "", (event) => {
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
      response.json({ run: await codexRunner.cancelRun(request.params.runId ?? "") });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/codex/runs/:runId/read", async (request, response, next) => {
    try {
      response.json({ run: await codexRunner.markRunRead(request.params.runId ?? "") });
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
    case WORKSPACE_ERROR.WORKSPACE_OUTSIDE_ALLOWLIST:
      return 403;
    case WORKSPACE_ERROR.WORKSPACE_UNAVAILABLE:
      return 410;
    default:
      return 500;
  }
}
