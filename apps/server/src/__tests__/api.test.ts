import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  apiErrorResponseSchema,
  codexDocumentRunSummaryResponseSchema,
  codexPromptPreviewResponseSchema,
  codexRunResponseSchema,
  codexRunSummarySchema,
  createCodexRunResponseSchema,
  filesResponseSchema,
  ticketDocumentResponseSchema,
} from "@alpha-kanban/shared";

import { createServerApp } from "../app";

const realTicketDocument = readFileSync(
  new URL("../../../../docs/02_alpha_kanban_tickets.md", import.meta.url),
  "utf8",
);

describe("API", () => {
  let workspaceRoot: string;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    workspaceRoot = mkdtempSync(path.join(tmpdir(), "alpha-kanban-api-"));
    const docsDir = path.join(workspaceRoot, "docs");
    await import("node:fs/promises").then(({ mkdir }) => mkdir(docsDir));
    writeFileSync(path.join(docsDir, "02_alpha_kanban_tickets.md"), realTicketDocument);
    writeFileSync(path.join(workspaceRoot, "outside.md"), "# outside\n");
    const fakeCodexPath = path.join(workspaceRoot, "fake-codex.mjs");
    writeFileSync(
      fakeCodexPath,
      [
        "#!/usr/bin/env node",
        "let stdin = '';",
        "for await (const chunk of process.stdin) { stdin += chunk; }",
        "if (stdin) {",
        "  console.error('unexpected stdin input');",
        "  process.exit(9);",
        "}",
        "console.log(JSON.stringify({ type: 'session', thread_id: 'fake-thread-id' }));",
        "if (process.argv.join(' ').includes('auth-fail')) {",
        "  console.error('not logged in');",
        "  process.exit(1);",
        "}",
        "if (process.argv.join(' ').includes('slow-cancel')) {",
        "  setTimeout(() => process.exit(0), 10000);",
        "} else {",
        "console.log(JSON.stringify({ type: 'message', message: 'fake final message' }));",
        "}",
        "",
      ].join("\n"),
    );
    chmodSync(fakeCodexPath, 0o755);

    const { app } = createServerApp({
      workspaceRoot,
      docRoots: ["docs"],
      codexCommand: fakeCodexPath,
    });

    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    rmSync(workspaceRoot, { force: true, recursive: true });
  });

  it("lists and reads ticket documents", async () => {
    const files = filesResponseSchema.parse(await getJson("/api/files"));
    expect(files.files).toHaveLength(1);
    expect(files.files[0]?.type).toBe("tickets");

    const document = ticketDocumentResponseSchema.parse(
      await getJson(`/api/files/${files.files[0]?.id}/tickets`),
    );
    expect(document.document.tickets.some((ticket) => ticket.id === "AKB-03")).toBe(true);
  });

  it("patches status/progress and protects stale writes", async () => {
    const files = filesResponseSchema.parse(await getJson("/api/files"));
    const file = files.files[0];
    expect(file).toBeDefined();

    const patched = ticketDocumentResponseSchema.parse(
      await patchJson(`/api/files/${file?.id}/tickets/AKB-07`, {
        expectedHash: file?.hash,
        status: "IN_PROGRESS",
        progress: 50,
      }),
    );

    const ticket = patched.document.tickets.find((item) => item.id === "AKB-07");
    expect(ticket?.status).toBe("IN_PROGRESS");
    expect(ticket?.progress).toBe(50);
    expect(patched.document.status.doneTickets).toBe(7);

    const staleResponse = await fetch(`${baseUrl}/api/files/${file?.id}/tickets/AKB-07`, {
      body: JSON.stringify({
        expectedHash: file?.hash,
        status: "READY",
        progress: 25,
      }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    });

    expect(staleResponse.status).toBe(409);
    const staleError = apiErrorResponseSchema.parse(await staleResponse.json());
    expect(staleError.error.code).toBe("STALE_FILE");
  });

  it("appends user instructions and progress notes separately", async () => {
    const files = filesResponseSchema.parse(await getJson("/api/files"));
    const fileId = files.files[0]?.id;

    const instructed = ticketDocumentResponseSchema.parse(
      await postJson(`/api/files/${fileId}/tickets/AKB-03/instructions`, {
        date: "2026-06-22",
        text: "API integration test instruction",
      }),
    );
    const instructedTicket = instructed.document.tickets.find((item) => item.id === "AKB-03");
    expect(instructedTicket?.userInstructions.at(-1)?.text).toBe(
      "API integration test instruction",
    );

    const noted = ticketDocumentResponseSchema.parse(
      await postJson(`/api/files/${fileId}/tickets/AKB-03/progress-notes`, {
        date: "2026-06-22",
        text: "API integration test progress note",
      }),
    );
    const notedTicket = noted.document.tickets.find((item) => item.id === "AKB-03");
    expect(notedTicket?.progressNotes.at(-1)?.text).toBe(
      "API integration test progress note",
    );
  });

  it("rejects file ids outside docRoots", async () => {
    const outsideId = Buffer.from("outside.md", "utf8").toString("base64url");
    const response = await fetch(`${baseUrl}/api/files/${outsideId}/tickets`);
    expect(response.status).toBe(403);

    const body = apiErrorResponseSchema.parse(await response.json());
    expect(body.error.code).toBe("FORBIDDEN_PATH");
  });

  it("previews and runs Codex with file-level session state", async () => {
    const files = filesResponseSchema.parse(await getJson("/api/files"));
    const file = files.files[0];
    expect(file).toBeDefined();

    const preview = codexPromptPreviewResponseSchema.parse(
      await postJson("/api/codex/prompt-preview", {
        fileId: file?.id,
        ticketId: "AKB-05",
        instructionDraft: "fake instruction",
      }),
    );
    expect(preview.prompt).toContain("Selected ticket: AKB-05");
    expect(preview.instructionSummary).toBe("Codex 실행 지시: fake instruction");
    expect(preview.prompt).toContain("이번 실행 지시 요약:");
    expect(preview.args[0]).toBe("exec");
    expect(preview.resumeSessionId).toBeUndefined();

    const created = createCodexRunResponseSchema.parse(
      await postJson("/api/codex/runs", {
        fileId: file?.id,
        ticketId: "AKB-05",
        instructionDraft: "fake instruction",
      }),
    );
    const finished = await waitForRun(created.run.id);

    expect(finished.run.status).toBe("succeeded");
    expect(finished.run.capturedSessionId).toBe("fake-thread-id");
    expect(finished.run.events.some((event) => event.type === "json")).toBe(true);

    const state = JSON.parse(
      readFileSync(path.join(workspaceRoot, ".alpha-kanban", "state.json"), "utf8"),
    ) as {
      documents: Record<string, { codexSessionId?: string }>;
    };
    expect(state.documents["docs/02_alpha_kanban_tickets.md"]?.codexSessionId).toBe(
      "fake-thread-id",
    );

    const noted = ticketDocumentResponseSchema.parse(
      await getJson(`/api/files/${file?.id}/tickets`),
    );
    const ticket = noted.document.tickets.find((item) => item.id === "AKB-05");
    expect(ticket?.userInstructions.at(-1)?.text).toBe("Codex 실행 지시: fake instruction");
    expect(ticket?.progressNotes.at(-1)?.text).toContain("Codex run succeeded");

    const resumedPreview = codexPromptPreviewResponseSchema.parse(
      await postJson("/api/codex/prompt-preview", {
        fileId: file?.id,
        ticketId: "AKB-06",
      }),
    );
    expect(resumedPreview.resumeSessionId).toBe("fake-thread-id");
    expect(resumedPreview.args.slice(0, 3)).toEqual(["exec", "resume", "--json"]);

    writeFileSync(path.join(workspaceRoot, "docs", "03_other_tickets.md"), realTicketDocument);
    const filesAfterSecondDocument = filesResponseSchema.parse(await getJson("/api/files"));
    const otherFile = filesAfterSecondDocument.files.find(
      (item) => item.relativePath === "docs/03_other_tickets.md",
    );
    expect(otherFile).toBeDefined();

    const otherPreview = codexPromptPreviewResponseSchema.parse(
      await postJson("/api/codex/prompt-preview", {
        fileId: otherFile?.id,
        ticketId: "AKB-06",
      }),
    );
    expect(otherPreview.resumeSessionId).toBeUndefined();
    expect(otherPreview.args.slice(0, 2)).toEqual(["exec", "--json"]);
  });

  it("cancels a running Codex process", async () => {
    const files = filesResponseSchema.parse(await getJson("/api/files"));
    const file = files.files[0];
    expect(file).toBeDefined();

    const created = createCodexRunResponseSchema.parse(
      await postJson("/api/codex/runs", {
        fileId: file?.id,
        ticketId: "AKB-05",
        instructionDraft: "slow-cancel",
      }),
    );
    expect(created.run.status).toBe("running");

    const cancelled = codexRunResponseSchema.parse(
      await postJson(`/api/codex/runs/${created.run.id}/cancel`, {}),
    );
    expect(cancelled.run.status).toBe("cancelled");
    expect(cancelled.run.events.some((event) => event.message === "Cancel requested.")).toBe(true);

    const finished = await waitForRun(created.run.id);
    expect(finished.run.status).toBe("cancelled");
  });

  it("summarizes document run state and blocks a second active run", async () => {
    const files = filesResponseSchema.parse(await getJson("/api/files"));
    const file = files.files[0];
    expect(file).toBeDefined();

    const created = createCodexRunResponseSchema.parse(
      await postJson("/api/codex/runs", {
        fileId: file?.id,
        ticketId: "AKB-05",
        instructionDraft: "slow-cancel",
      }),
    );

    const summary = codexDocumentRunSummaryResponseSchema.parse(
      await getJson(`/api/files/${file?.id}/codex-run-summary`),
    );
    expect(summary.status).toBe("running");
    expect(summary.canStartRun).toBe(false);
    expect(summary.activeRun?.id).toBe(created.run.id);
    expect(summary.activeRun?.ticketId).toBe("AKB-05");

    const duplicateResponse = await fetch(`${baseUrl}/api/codex/runs`, {
      body: JSON.stringify({
        fileId: file?.id,
        ticketId: "AKB-06",
        instructionDraft: "duplicate active run",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(duplicateResponse.status).toBe(409);
    const duplicateError = apiErrorResponseSchema.parse(await duplicateResponse.json());
    expect(duplicateError.error.code).toBe("CODEX_DOCUMENT_RUN_ACTIVE");

    await postJson(`/api/codex/runs/${created.run.id}/cancel`, {});
    const finished = await waitForRun(created.run.id);
    expect(finished.run.status).toBe("cancelled");

    const afterCancel = codexDocumentRunSummaryResponseSchema.parse(
      await getJson(`/api/files/${file?.id}/codex-run-summary`),
    );
    expect(afterCancel.canStartRun).toBe(true);
    expect(afterCancel.activeRun).toBeUndefined();
    expect(afterCancel.latestRun?.status).toBe("cancelled");
    expect(afterCancel.latestRun?.isUnread).toBe(true);

    const read = codexRunSummarySchema.parse(
      (await postJson(`/api/codex/runs/${created.run.id}/read`, {})).run,
    );
    expect(read.readAt).toBeDefined();
    expect(read.isUnread).toBe(false);

    const stateAfterRead = JSON.parse(
      readFileSync(path.join(workspaceRoot, ".alpha-kanban", "state.json"), "utf8"),
    ) as {
      runResults?: Record<string, { readAt?: string }>;
    };
    expect(stateAfterRead.runResults?.[created.run.id]?.readAt).toBe(read.readAt);

    const afterRead = codexDocumentRunSummaryResponseSchema.parse(
      await getJson(`/api/files/${file?.id}/codex-run-summary`),
    );
    expect(afterRead.latestRun?.readAt).toBe(read.readAt);
    expect(afterRead.latestRun?.isUnread).toBe(false);
  });

  it("maps Codex authentication failures to a needs_auth run signal", async () => {
    const files = filesResponseSchema.parse(await getJson("/api/files"));
    const file = files.files[0];
    expect(file).toBeDefined();

    const created = createCodexRunResponseSchema.parse(
      await postJson("/api/codex/runs", {
        fileId: file?.id,
        ticketId: "AKB-05",
        instructionDraft: "auth-fail",
      }),
    );
    const finished = await waitForRun(created.run.id);
    expect(finished.run.status).toBe("failed");

    const summary = codexDocumentRunSummaryResponseSchema.parse(
      await getJson(`/api/files/${file?.id}/codex-run-summary`),
    );
    expect(summary.status).toBe("needs_auth");
    expect(summary.latestRun?.status).toBe("needs_auth");
    expect(summary.latestRun?.rawStatus).toBe("failed");
  });

  it("creates a Codex dry run without spawning the CLI", async () => {
    const files = filesResponseSchema.parse(await getJson("/api/files"));
    const file = files.files[0];
    expect(file).toBeDefined();

    const created = createCodexRunResponseSchema.parse(
      await postJson("/api/codex/runs", {
        dryRun: true,
        fileId: file?.id,
        ticketId: "AKB-05",
        instructionDraft: "dry-run instruction",
      }),
    );

    expect(created.run.status).toBe("succeeded");
    expect(created.run.dryRun).toBe(true);
    expect(created.run.instructionSummary).toBe("Codex 실행 지시: dry-run instruction");
    expect(created.run.events.some((event) => event.message.includes("Dry run"))).toBe(true);

    const afterDryRun = ticketDocumentResponseSchema.parse(
      await getJson(`/api/files/${file?.id}/tickets`),
    );
    const ticket = afterDryRun.document.tickets.find((item) => item.id === "AKB-05");
    expect(ticket?.userInstructions.some((entry) => entry.text.includes("dry-run instruction"))).toBe(
      false,
    );
  });

  async function getJson(route: string): Promise<unknown> {
    const response = await fetch(`${baseUrl}${route}`);
    expect(response.ok).toBe(true);
    return response.json();
  }

  async function patchJson(route: string, body: unknown): Promise<unknown> {
    const response = await fetch(`${baseUrl}${route}`, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    });
    expect(response.ok).toBe(true);
    return response.json();
  }

  async function postJson(route: string, body: unknown): Promise<unknown> {
    const response = await fetch(`${baseUrl}${route}`, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(response.ok).toBe(true);
    return response.json();
  }

  async function waitForRun(runId: string) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const snapshot = codexRunResponseSchema.parse(
        await getJson(`/api/codex/runs/${runId}`),
      );
      if (snapshot.run.finishedAt) {
        return snapshot;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    throw new Error(`Codex run ${runId} did not finish.`);
  }
});
