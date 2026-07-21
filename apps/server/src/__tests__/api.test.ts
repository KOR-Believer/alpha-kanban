import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  apiErrorResponseSchema,
  codexDocumentRunSummaryResponseSchema,
  codexModelsResponseSchema,
  codexPromptPreviewResponseSchema,
  codexRunDefaultsResponseSchema,
  codexRunResponseSchema,
  codexRunSummarySchema,
  codexTicketChatResponseSchema,
  codexWorkspaceChatResponseSchema,
  codexWorkspacePromptPreviewResponseSchema,
  createCodexRunResponseSchema,
  createWorkspaceResponseSchema,
  documentSetsResponseSchema,
  filesResponseSchema,
  markdownFileChangeEventSchema,
  selectWorkspaceResponseSchema,
  markdownDocumentResponseSchema,
  ticketDocumentResponseSchema,
  type MarkdownFileSummary,
  type WorkspaceSummary,
  workspaceDirectoriesResponseSchema,
  workspaceRootsSettingsResponseSchema,
  workspacesResponseSchema,
} from "@alpha-kanban/shared";

import { createServerApp } from "../app";

const realTicketDocument = readFileSync(
  new URL("../../../../docs/02_alpha_kanban_tickets.md", import.meta.url),
  "utf8",
);

describe("API", () => {
  let workspaceRoot: string;
  let projectsRoot: string;
  let projectOneRoot: string;
  let realProjectOneRoot: string;
  let projectTwoRoot: string;
  let realProjectTwoRoot: string;
  let outsideProjectRoot: string;
  let realOutsideProjectRoot: string;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    workspaceRoot = mkdtempSync(path.join(tmpdir(), "alpha-kanban-api-"));
    const docsDir = path.join(workspaceRoot, "docs");
    await import("node:fs/promises").then(({ mkdir }) => mkdir(docsDir));
    writeFileSync(path.join(docsDir, "02_alpha_kanban_tickets.md"), realTicketDocument);
    writeFileSync(path.join(workspaceRoot, "outside.md"), "# outside\n");

    projectsRoot = path.join(workspaceRoot, "projects");
    projectOneRoot = path.join(projectsRoot, "project-one");
    projectTwoRoot = path.join(projectsRoot, "project-two");
    outsideProjectRoot = path.join(workspaceRoot, "outside-project");
    mkdirSync(path.join(projectOneRoot, "docs"), { recursive: true });
    mkdirSync(path.join(projectTwoRoot, "docs"), { recursive: true });
    mkdirSync(path.join(projectTwoRoot, ".git"), { recursive: true });
    mkdirSync(outsideProjectRoot, { recursive: true });
    writeFileSync(path.join(projectOneRoot, "docs", "01_plan.md"), "# Project one\n");
    writeFileSync(path.join(projectOneRoot, "docs", "02_alpha_kanban_tickets.md"), realTicketDocument);
    writeFileSync(
      path.join(projectOneRoot, "docs", "18_feature_plan.md"),
      [
        "# Feature Plan",
        "",
        "## 목표",
        "",
        "- Link tickets: `19_feature_tickets.md`",
      ].join("\n"),
    );
    writeFileSync(path.join(projectOneRoot, "docs", "19_feature_tickets.md"), realTicketDocument);
    writeFileSync(
      path.join(projectOneRoot, "docs", "31_feature_inventory.md"),
      "# Feature Inventory\n\n## Matrix\n\n- observed\n",
    );
    writeFileSync(
      path.join(projectOneRoot, "docs", "70_lone_inventory.md"),
      "# Lone Inventory\n",
    );
    writeFileSync(path.join(projectTwoRoot, "docs", "02_alpha_kanban_tickets.md"), realTicketDocument);
    realProjectOneRoot = realpathSync.native(projectOneRoot);
    realProjectTwoRoot = realpathSync.native(projectTwoRoot);
    realOutsideProjectRoot = realpathSync.native(outsideProjectRoot);

    const fakeCodexPath = path.join(workspaceRoot, "fake-codex.mjs");
    writeFileSync(
      fakeCodexPath,
      [
        "#!/usr/bin/env node",
        "const argv = process.argv.slice(2);",
        "if (argv[0] === 'debug' && argv[1] === 'models') {",
        "  console.log(JSON.stringify({ models: [{ slug: 'gpt-5.5', display_name: 'GPT-5.5', default_reasoning_level: 'high', supported_reasoning_levels: [{ effort: 'low' }, { effort: 'high' }, { effort: 'xhigh' }], additional_speed_tiers: ['fast'], service_tiers: [{ id: 'priority', name: 'Fast' }], visibility: 'default', supported_in_api: true }, { slug: 'gpt-5.4-mini', display_name: 'GPT-5.4 mini', supported_reasoning_levels: [{ effort: 'minimal' }, { effort: 'medium' }], additional_speed_tiers: [], service_tiers: [], visibility: 'default' }] }));",
        "  process.exit(0);",
        "}",
        "let stdin = '';",
        "for await (const chunk of process.stdin) { stdin += chunk; }",
        "if (stdin) {",
        "  console.error('unexpected stdin input');",
        "  process.exit(9);",
        "}",
        "const argvString = process.argv.join(' ');",
        "if (argvString.includes('preflight-fail')) {",
        "  console.error('Not inside a trusted directory and --skip-git-repo-check was not specified.');",
        "  process.exit(1);",
        "}",
        "console.log(JSON.stringify({ type: 'cwd', cwd: process.cwd(), argv: process.argv.slice(2) }));",
        "console.log(JSON.stringify({ type: 'session', thread_id: 'fake-thread-id' }));",
        "if (argvString.includes('auth-fail')) {",
        "  console.error('not logged in');",
        "  process.exit(1);",
        "}",
        "if (argvString.includes('slow-cancel')) {",
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
      workspaceRoots: ["projects"],
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

  it("lists available workspace candidates and unavailable recent workspaces", async () => {
    const missingRoot = path.join(projectsRoot, "missing-project");
    mkdirSync(path.join(workspaceRoot, ".alpha-kanban"), { recursive: true });
    writeFileSync(
      path.join(workspaceRoot, ".alpha-kanban", "state.json"),
      JSON.stringify(
        {
          version: 2,
          recentWorkspaces: [
            {
              id: "w_missing",
              root: missingRoot,
              label: "missing-project",
              lastOpenedAt: "2026-06-22T00:00:00.000Z",
            },
          ],
          lastWorkspaceId: "w_missing",
          documents: {},
          runResults: {},
        },
        null,
        2,
      ),
    );

    const listed = workspacesResponseSchema.parse(await getJson("/api/workspaces"));
    const projectOne = listed.workspaces.find(
      (workspace) => workspace.root === realProjectOneRoot,
    );
    const projectTwo = listed.workspaces.find((workspace) =>
      workspace.root.endsWith("/project-two"),
    );
    const missing = listed.workspaces.find((workspace) => workspace.id === "w_missing");

    expect(listed.lastWorkspaceId).toBe("w_missing");
    expect(projectOne?.isAvailable).toBe(true);
    expect(projectOne?.hasDocs).toBe(true);
    expect(projectTwo?.isAvailable).toBe(true);
    expect(projectTwo?.hasDocs).toBe(true);
    expect(missing).toEqual({
      id: "w_missing",
      root: missingRoot,
      label: "missing-project",
      isAvailable: false,
      hasDocs: false,
      lastOpenedAt: "2026-06-22T00:00:00.000Z",
    });
    expect(listed.workspaces.some((workspace) => workspace.root === realOutsideProjectRoot)).toBe(
      false,
    );
  });

  it("selects an allowlisted workspace and records it as recent state", async () => {
    const selected = selectWorkspaceResponseSchema.parse(
      await postJson("/api/workspaces/select", { root: projectOneRoot }),
    );

    expect(selected.workspace.root).toBe(realProjectOneRoot);
    expect(selected.workspace.isAvailable).toBe(true);
    expect(selected.workspace.hasDocs).toBe(true);

    const state = JSON.parse(
      readFileSync(path.join(workspaceRoot, ".alpha-kanban", "state.json"), "utf8"),
    ) as {
      lastWorkspaceId?: string;
      recentWorkspaces?: Array<{ id: string; root: string }>;
    };

    expect(state.lastWorkspaceId).toBe(selected.workspace.id);
    expect(state.recentWorkspaces?.[0]).toMatchObject({
      id: selected.workspace.id,
      root: realProjectOneRoot,
    });
  });

  it("creates a project folder under an allowlisted root and initializes git", async () => {
    const created = createWorkspaceResponseSchema.parse(
      await postJson("/api/workspaces/create", {
        parentRoot: projectsRoot,
        projectName: "new-scaffold",
        gitInit: true,
      }),
    );
    const realNewProjectRoot = realpathSync.native(path.join(projectsRoot, "new-scaffold"));

    expect(created.createdPath).toBe(realNewProjectRoot);
    expect(created.workspace).toMatchObject({
      root: realNewProjectRoot,
      label: "new-scaffold",
      isAvailable: true,
      hasDocs: false,
    });
    expect(created.gitInitialized).toBe(true);
    expect(existsSync(path.join(realNewProjectRoot, ".git"))).toBe(true);

    const state = JSON.parse(
      readFileSync(path.join(workspaceRoot, ".alpha-kanban", "state.json"), "utf8"),
    ) as {
      lastWorkspaceId?: string;
      recentWorkspaces?: Array<{ id: string; root: string }>;
    };
    expect(state.lastWorkspaceId).toBe(created.workspace.id);
    expect(state.recentWorkspaces?.[0]).toMatchObject({
      id: created.workspace.id,
      root: realNewProjectRoot,
    });
  });

  it("lists allowlisted workspace directories for the folder picker", async () => {
    const realProjectsRoot = realpathSync.native(projectsRoot);

    const listed = workspaceDirectoriesResponseSchema.parse(
      await getJson("/api/workspace-directories"),
    );
    expect(listed.roots).toContainEqual({
      label: "projects",
      path: realProjectsRoot,
    });
    expect(listed.directory).toMatchObject({
      path: realProjectsRoot,
      label: "projects",
      isWorkspaceCandidate: false,
      hasDocs: false,
    });

    const projectOne = listed.directory?.children.find(
      (child) => child.path === realProjectOneRoot,
    );
    const projectTwo = listed.directory?.children.find(
      (child) => child.path === realProjectTwoRoot,
    );
    expect(projectOne).toMatchObject({
      name: "project-one",
      isWorkspaceCandidate: true,
      hasDocs: true,
    });
    expect(projectTwo).toMatchObject({
      name: "project-two",
      isWorkspaceCandidate: true,
      hasDocs: true,
    });
    expect(
      listed.directory?.children.some((child) => child.path === realOutsideProjectRoot),
    ).toBe(false);

    const selected = workspaceDirectoriesResponseSchema.parse(
      await getJson(`/api/workspace-directories?root=${encodeURIComponent(projectOneRoot)}`),
    );
    expect(selected.directory).toMatchObject({
      path: realProjectOneRoot,
      parentPath: realProjectsRoot,
      isWorkspaceCandidate: true,
      hasDocs: true,
    });
  });

  it("updates workspaceRoots at runtime for discovery, folder picker, and project creation", async () => {
    const alternateRoot = path.join(workspaceRoot, "alternate-projects");
    const alternateProjectRoot = path.join(alternateRoot, "alternate-project");
    mkdirSync(path.join(alternateProjectRoot, "docs"), { recursive: true });
    const realProjectsRoot = realpathSync.native(projectsRoot);
    const realAlternateRoot = realpathSync.native(alternateRoot);
    const realAlternateProjectRoot = realpathSync.native(alternateProjectRoot);

    const rootBrowser = workspaceDirectoriesResponseSchema.parse(
      await getJson(
        `/api/settings/workspace-root-browser?root=${encodeURIComponent(workspaceRoot)}`,
      ),
    );
    expect(rootBrowser.directory).toMatchObject({
      path: realpathSync.native(workspaceRoot),
    });
    expect(
      rootBrowser.directory?.children.some((child) => child.path === realOutsideProjectRoot),
    ).toBe(true);

    const initialSettings = workspaceRootsSettingsResponseSchema.parse(
      await getJson("/api/settings/workspace-roots"),
    );
    expect(initialSettings).toEqual({
      roots: [{ label: "projects", path: realProjectsRoot }],
      defaultRoots: [{ label: "projects", path: realProjectsRoot }],
      hasOverride: false,
    });

    const updatedSettings = workspaceRootsSettingsResponseSchema.parse(
      await putJson("/api/settings/workspace-roots", { roots: [alternateRoot] }),
    );
    expect(updatedSettings).toEqual({
      roots: [{ label: "alternate-projects", path: realAlternateRoot }],
      defaultRoots: [{ label: "projects", path: realProjectsRoot }],
      hasOverride: true,
    });

    const listed = workspacesResponseSchema.parse(await getJson("/api/workspaces"));
    expect(listed.workspaces.some((workspace) => workspace.root === realProjectOneRoot)).toBe(
      false,
    );
    expect(
      listed.workspaces.some((workspace) => workspace.root === realAlternateProjectRoot),
    ).toBe(true);

    const directories = workspaceDirectoriesResponseSchema.parse(
      await getJson("/api/workspace-directories"),
    );
    expect(directories.roots).toEqual([
      { label: "alternate-projects", path: realAlternateRoot },
    ]);

    const created = createWorkspaceResponseSchema.parse(
      await postJson("/api/workspaces/create", {
        parentRoot: alternateRoot,
        projectName: "runtime-created",
        gitInit: false,
      }),
    );
    expect(created.createdPath).toBe(
      realpathSync.native(path.join(alternateRoot, "runtime-created")),
    );

    const oldRootResponse = await fetch(`${baseUrl}/api/workspaces/select`, {
      body: JSON.stringify({ root: projectOneRoot }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(oldRootResponse.status).toBe(403);

    const state = JSON.parse(
      readFileSync(path.join(workspaceRoot, ".alpha-kanban", "state.json"), "utf8"),
    ) as {
      runtimeSettings?: { workspaceRoots?: string[] };
    };
    expect(state.runtimeSettings?.workspaceRoots).toEqual([realAlternateRoot]);

    const resetSettings = workspaceRootsSettingsResponseSchema.parse(
      await putJson("/api/settings/workspace-roots", { roots: [projectsRoot] }),
    );
    expect(resetSettings.hasOverride).toBe(false);
    const resetListed = workspacesResponseSchema.parse(await getJson("/api/workspaces"));
    expect(resetListed.workspaces.some((workspace) => workspace.root === realProjectOneRoot)).toBe(
      true,
    );
  });

  it("rejects folder picker traversal and symlink escapes outside the allowlist", async () => {
    const traversalResponse = await fetch(
      `${baseUrl}/api/workspace-directories?root=${encodeURIComponent(
        path.join(projectsRoot, "..", "outside-project"),
      )}`,
    );

    expect(traversalResponse.status).toBe(403);
    const traversalError = apiErrorResponseSchema.parse(await traversalResponse.json());
    expect(traversalError.error.code).toBe("WORKSPACE_OUTSIDE_ALLOWLIST");

    const symlinkRoot = path.join(projectsRoot, "escaped-link");
    symlinkSync(outsideProjectRoot, symlinkRoot, "dir");
    const listed = workspaceDirectoriesResponseSchema.parse(
      await getJson("/api/workspace-directories"),
    );
    expect(listed.directory?.children.some((child) => child.name === "escaped-link")).toBe(
      false,
    );

    const symlinkResponse = await fetch(
      `${baseUrl}/api/workspace-directories?root=${encodeURIComponent(symlinkRoot)}`,
    );
    expect(symlinkResponse.status).toBe(403);
    const symlinkError = apiErrorResponseSchema.parse(await symlinkResponse.json());
    expect(symlinkError.error.code).toBe("WORKSPACE_OUTSIDE_ALLOWLIST");
  });

  it("rejects workspace path traversal and symlink escapes outside the allowlist", async () => {
    const traversalResponse = await fetch(`${baseUrl}/api/workspaces/select`, {
      body: JSON.stringify({ root: path.join(projectsRoot, "..", "outside-project") }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(traversalResponse.status).toBe(403);
    const traversalError = apiErrorResponseSchema.parse(await traversalResponse.json());
    expect(traversalError.error.code).toBe("WORKSPACE_OUTSIDE_ALLOWLIST");

    const symlinkRoot = path.join(projectsRoot, "escaped-link");
    symlinkSync(outsideProjectRoot, symlinkRoot, "dir");
    const symlinkResponse = await fetch(`${baseUrl}/api/workspaces/select`, {
      body: JSON.stringify({ root: symlinkRoot }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(symlinkResponse.status).toBe(403);
    const symlinkError = apiErrorResponseSchema.parse(await symlinkResponse.json());
    expect(symlinkError.error.code).toBe("WORKSPACE_OUTSIDE_ALLOWLIST");
  });

  it("rejects selecting an unavailable recent workspace", async () => {
    mkdirSync(path.join(workspaceRoot, ".alpha-kanban"), { recursive: true });
    writeFileSync(
      path.join(workspaceRoot, ".alpha-kanban", "state.json"),
      JSON.stringify(
        {
          version: 2,
          recentWorkspaces: [
            {
              id: "w_missing",
              root: path.join(projectsRoot, "missing-project"),
              label: "missing-project",
              lastOpenedAt: "2026-06-22T00:00:00.000Z",
            },
          ],
          lastWorkspaceId: "w_missing",
          documents: {},
          runResults: {},
        },
        null,
        2,
      ),
    );

    const response = await fetch(`${baseUrl}/api/workspaces/select`, {
      body: JSON.stringify({ workspaceId: "w_missing" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(410);
    const body = apiErrorResponseSchema.parse(await response.json());
    expect(body.error.code).toBe("WORKSPACE_UNAVAILABLE");
  });

  it("lists workspace-scoped files with collision-free file ids", async () => {
    const listed = workspacesResponseSchema.parse(await getJson("/api/workspaces"));
    const projectOne = requireWorkspaceByRoot(listed.workspaces, realProjectOneRoot);
    const projectTwo = requireWorkspaceByRoot(listed.workspaces, realProjectTwoRoot);
    const projectOneFile = await requireWorkspaceTicketFile(projectOne.id);

    const projectOneFiles = filesResponseSchema.parse(
      await getJson(`/api/workspaces/${projectOne.id}/files`),
    );
    const projectTwoFiles = filesResponseSchema.parse(
      await getJson(`/api/workspaces/${projectTwo.id}/files`),
    );
    const projectOneTicketFile = projectOneFiles.files.find(
      (file) => file.workspaceRelativePath === "docs/02_alpha_kanban_tickets.md",
    );
    const projectTwoTicketFile = projectTwoFiles.files.find(
      (file) => file.workspaceRelativePath === "docs/02_alpha_kanban_tickets.md",
    );

    expect(projectOneFiles.files.some((file) => file.filename === "01_plan.md")).toBe(true);
    expect(projectTwoFiles.files.some((file) => file.filename === "01_plan.md")).toBe(false);
    expect(projectOneTicketFile?.workspaceId).toBe(projectOne.id);
    expect(projectTwoTicketFile?.workspaceId).toBe(projectTwo.id);
    expect(projectOneTicketFile?.id).toBeDefined();
    expect(projectTwoTicketFile?.id).toBeDefined();
    expect(projectOneTicketFile?.id).not.toBe(projectTwoTicketFile?.id);
    expect(projectOneTicketFile?.relativePath).toBe("docs/02_alpha_kanban_tickets.md");
    expect(projectTwoTicketFile?.relativePath).toBe("docs/02_alpha_kanban_tickets.md");
  });

  it("groups workspace markdown files into document sets by directory and slug", async () => {
    const listed = workspacesResponseSchema.parse(await getJson("/api/workspaces"));
    const projectOne = requireWorkspaceByRoot(listed.workspaces, realProjectOneRoot);

    const response = documentSetsResponseSchema.parse(
      await getJson(`/api/workspaces/${projectOne.id}/document-sets`),
    );
    const featureSet = response.sets.find((documentSet) => documentSet.slug === "feature");
    const loneInventorySet = response.sets.find(
      (documentSet) => documentSet.slug === "lone",
    );

    expect(featureSet).toBeDefined();
    expect(featureSet?.directory).toBe("docs");
    expect(featureSet?.sequenceNumber).toBe(18);
    expect(featureSet?.types).toEqual(["plan", "tickets", "inventory"]);
    expect(featureSet?.documents.map((file) => file.workspaceRelativePath)).toEqual([
      "docs/18_feature_plan.md",
      "docs/19_feature_tickets.md",
      "docs/31_feature_inventory.md",
    ]);
    expect(featureSet?.primaryFile.workspaceRelativePath).toBe("docs/19_feature_tickets.md");
    expect(featureSet?.ticketProgress?.totalTickets).toBeGreaterThan(0);
    expect(featureSet?.ticketProgress?.doneTickets).toBeDefined();

    expect(loneInventorySet).toBeDefined();
    expect(loneInventorySet?.types).toEqual(["inventory"]);
    expect(loneInventorySet?.primaryFile.workspaceRelativePath).toBe(
      "docs/70_lone_inventory.md",
    );
  });

  it("reads generic markdown documents with outline metadata", async () => {
    const listed = workspacesResponseSchema.parse(await getJson("/api/workspaces"));
    const projectOne = requireWorkspaceByRoot(listed.workspaces, realProjectOneRoot);
    const documentSets = documentSetsResponseSchema.parse(
      await getJson(`/api/workspaces/${projectOne.id}/document-sets`),
    );
    const planFile = documentSets.sets
      .find((documentSet) => documentSet.slug === "feature")
      ?.documents.find((file) => file.type === "plan");
    expect(planFile).toBeDefined();

    const markdown = markdownDocumentResponseSchema.parse(
      await getJson(`/api/workspaces/${projectOne.id}/files/${planFile?.id}/markdown`),
    );

    expect(markdown.file.type).toBe("plan");
    expect(markdown.markdown).toContain("# Feature Plan");
    expect(markdown.outline).toEqual([
      { level: 1, line: 1, title: "Feature Plan" },
      { level: 2, line: 3, title: "목표" },
    ]);
  });

  it("streams workspace markdown file change events", async () => {
    const listed = workspacesResponseSchema.parse(await getJson("/api/workspaces"));
    const projectOne = requireWorkspaceByRoot(listed.workspaces, realProjectOneRoot);
    const projectOneFile = await requireWorkspaceTicketFile(projectOne.id);
    const eventsResponse = await fetch(
      `${baseUrl}/api/workspaces/${projectOne.id}/files/events`,
    );
    expect(eventsResponse.ok).toBe(true);

    const ticketPath = path.join(projectOneRoot, "docs", "02_alpha_kanban_tickets.md");
    writeFileSync(
      ticketPath,
      `${readFileSync(ticketPath, "utf8")}\n<!-- alpha-kanban-sse-smoke -->\n`,
    );

    const event = markdownFileChangeEventSchema.parse(
      await readNextMarkdownFileEvent(eventsResponse),
    );
    expect(event).toMatchObject({
      eventType: "changed",
      workspaceId: projectOne.id,
      fileId: projectOneFile.id,
      relativePath: "docs/02_alpha_kanban_tickets.md",
      workspaceRelativePath: "docs/02_alpha_kanban_tickets.md",
      absolutePath: realpathSync.native(ticketPath),
    });
    expect(event.file?.hash).toBeDefined();
    expect(event.file?.hash).not.toBe(projectOneFile.hash);
  });

  it("reads and writes tickets only in the selected workspace", async () => {
    const listed = workspacesResponseSchema.parse(await getJson("/api/workspaces"));
    const projectOne = requireWorkspaceByRoot(listed.workspaces, realProjectOneRoot);
    const projectTwo = requireWorkspaceByRoot(listed.workspaces, realProjectTwoRoot);
    const projectOneFile = await requireWorkspaceTicketFile(projectOne.id);
    const projectTwoFile = await requireWorkspaceTicketFile(projectTwo.id);

    const patched = ticketDocumentResponseSchema.parse(
      await patchJson(
        `/api/workspaces/${projectOne.id}/files/${projectOneFile.id}/tickets/AKB-07`,
        {
          expectedHash: projectOneFile.hash,
          status: "IN_PROGRESS",
          progress: 50,
        },
      ),
    );
    const patchedTicket = patched.document.tickets.find((ticket) => ticket.id === "AKB-07");
    expect(patched.file.workspaceId).toBe(projectOne.id);
    expect(patchedTicket?.status).toBe("IN_PROGRESS");
    expect(patchedTicket?.progress).toBe(50);

    const staleResponse = await fetch(
      `${baseUrl}/api/workspaces/${projectOne.id}/files/${projectOneFile.id}/tickets/AKB-07`,
      {
        body: JSON.stringify({
          expectedHash: projectOneFile.hash,
          status: "DONE",
          progress: 100,
        }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      },
    );
    expect(staleResponse.status).toBe(409);
    const staleError = apiErrorResponseSchema.parse(await staleResponse.json());
    expect(staleError.error.code).toBe("STALE_FILE");

    const instructed = ticketDocumentResponseSchema.parse(
      await postJson(
        `/api/workspaces/${projectOne.id}/files/${projectOneFile.id}/tickets/AKB-07/instructions`,
        {
          date: "2026-06-23",
          text: "workspace scoped instruction",
        },
      ),
    );
    expect(
      instructed.document.tickets
        .find((ticket) => ticket.id === "AKB-07")
        ?.userInstructions.at(-1)?.text,
    ).toBe("workspace scoped instruction");

    const noted = ticketDocumentResponseSchema.parse(
      await postJson(
        `/api/workspaces/${projectOne.id}/files/${projectOneFile.id}/tickets/AKB-07/progress-notes`,
        {
          date: "2026-06-23",
          text: "workspace scoped progress",
        },
      ),
    );
    expect(
      noted.document.tickets
        .find((ticket) => ticket.id === "AKB-07")
        ?.progressNotes.at(-1)?.text,
    ).toBe("workspace scoped progress");

    const projectTwoDocument = ticketDocumentResponseSchema.parse(
      await getJson(`/api/workspaces/${projectTwo.id}/files/${projectTwoFile.id}/tickets`),
    );
    const projectTwoTicket = projectTwoDocument.document.tickets.find(
      (ticket) => ticket.id === "AKB-07",
    );
    expect(projectTwoTicket?.status).toBe("DONE");
    expect(projectTwoTicket?.userInstructions.at(-1)?.text).not.toBe(
      "workspace scoped instruction",
    );
    expect(projectTwoTicket?.progressNotes.at(-1)?.text).not.toBe("workspace scoped progress");
  });

  it("stores workspace chat messages and previews project-wide prompts", async () => {
    const listed = workspacesResponseSchema.parse(await getJson("/api/workspaces"));
    const projectOne = requireWorkspaceByRoot(listed.workspaces, realProjectOneRoot);
    const projectTwo = requireWorkspaceByRoot(listed.workspaces, realProjectTwoRoot);
    const projectOneFile = await requireWorkspaceTicketFile(projectOne.id);

    const emptyChat = codexWorkspaceChatResponseSchema.parse(
      await getJson(`/api/workspaces/${projectOne.id}/workspace-chat`),
    );
    expect(emptyChat.messages).toEqual([]);

    const savedChat = codexWorkspaceChatResponseSchema.parse(
      await postJson(`/api/workspaces/${projectOne.id}/workspace-chat/messages`, {
        content: "새 기능 plan/ticket을 만들 수 있을지 봐줘",
      }),
    );
    expect(savedChat.messages).toHaveLength(1);
    expect(savedChat.messages[0]).toMatchObject({
      scope: "workspace",
      role: "user",
      contentFormat: "markdown",
      content: "새 기능 plan/ticket을 만들 수 있을지 봐줘",
      workspaceId: projectOne.id,
    });
    expect(savedChat.messages[0]?.fileRelativePath).toBeUndefined();
    expect(savedChat.messages[0]?.ticketId).toBeUndefined();

    const preview = codexWorkspacePromptPreviewResponseSchema.parse(
      await postJson(`/api/workspaces/${projectOne.id}/workspace-chat/prompt-preview`, {
        currentFileId: projectOneFile.id,
        instructionDraft: "@workspace 새 plan/ticket 작성 방향을 논의해줘",
      }),
    );
    expect(preview.mode).toBe("read_only");
    expect(preview.intent).toBe("general");
    expect(preview.scopeResolution).toMatchObject({
      scope: "workspace",
      targetWorkspaceId: projectOne.id,
      cleanedMessage: "새 plan/ticket 작성 방향을 논의해줘",
    });
    expect(preview.prompt).toContain(`${realProjectOneRoot} 프로젝트`);
    expect(preview.prompt).toContain("Workspace documents:");
    expect(preview.prompt).toContain(
      "Recent selected document: [tickets] docs/02_alpha_kanban_tickets.md",
    );
    expect(preview.prompt).toContain("[plan] docs/18_feature_plan.md");
    expect(preview.prompt).toContain("[tickets] docs/19_feature_tickets.md");
    expect(preview.prompt).toContain("작업 모드: Read-only workspace chat");
    expect(preview.documentSets.some((set) => set.slug === "feature")).toBe(true);
    expect(preview.args.slice(0, 3)).toEqual([
      "exec",
      "--skip-git-repo-check",
      "--json",
    ]);

    const specPreview = codexWorkspacePromptPreviewResponseSchema.parse(
      await postJson(`/api/workspaces/${projectOne.id}/workspace-chat/prompt-preview`, {
        instructionDraft: "새 기능을 만들기 전에 요구사항을 질문으로 좁혀줘",
        intent: "spec_grilling",
        mode: "edit",
      }),
    );
    expect(specPreview.intent).toBe("spec_grilling");
    expect(specPreview.mode).toBe("read_only");
    expect(specPreview.prompt).toContain("작업 모드: Spec grilling read-only workspace chat");
    expect(specPreview.prompt).toContain("Clarifying questions");
    expect(specPreview.prompt).toContain("Open questions");
    expect(specPreview.prompt).toContain("직접 파일을 수정하지 마");

    const planTicketingPreview = codexWorkspacePromptPreviewResponseSchema.parse(
      await postJson(`/api/workspaces/${projectOne.id}/workspace-chat/prompt-preview`, {
        intent: "plan_ticketing_handoff",
        instructionDraft: "새 feature plan/ticket을 만들어줘",
        mode: "read_only",
      }),
    );
    expect(planTicketingPreview.intent).toBe("plan_ticketing_handoff");
    expect(planTicketingPreview.mode).toBe("edit");
    expect(planTicketingPreview.scopeResolution.scope).toBe("workspace");
    expect(planTicketingPreview.prompt).toContain("$implementation-ledger");
    expect(planTicketingPreview.prompt).toContain("작업 모드: Implementation-ledger handoff");
    expect(planTicketingPreview.prompt).toContain("Resolved scope:");
    expect(planTicketingPreview.prompt).toContain("raw `@w`/`@t:` mention");

    const created = createCodexRunResponseSchema.parse(
      await postJson(`/api/workspaces/${projectOne.id}/workspace-chat/runs`, {
        currentFileId: projectOneFile.id,
        instructionDraft: "안녕",
      }),
    );
    expect(created.run).toMatchObject({
      fileId: "workspace",
      ticketId: "workspace",
      mode: "read_only",
      status: "running",
    });
    expect(created.run.prompt).toContain("안녕");

    const finished = await waitForRun(created.run.id);
    expect(finished.run.status).toBe("succeeded");

    const chatAfterRun = codexWorkspaceChatResponseSchema.parse(
      await getJson(`/api/workspaces/${projectOne.id}/workspace-chat`),
    );
    expect(chatAfterRun.messages.map((message) => message.role)).toEqual([
      "user",
      "user",
      "assistant",
    ]);
    expect(chatAfterRun.messages.at(-2)).toMatchObject({
      scope: "workspace",
      role: "user",
      content: "안녕",
      runId: created.run.id,
      metadata: { intent: "general" },
    });
    expect(chatAfterRun.messages.at(-1)).toMatchObject({
      scope: "workspace",
      role: "assistant",
      content: "fake final message",
      runId: created.run.id,
      metadata: { intent: "general" },
    });

    const projectTwoChat = codexWorkspaceChatResponseSchema.parse(
      await getJson(`/api/workspaces/${projectTwo.id}/workspace-chat`),
    );
    expect(projectTwoChat.messages).toEqual([]);
  });

  it("previews and runs Codex in the selected workspace", async () => {
    const listed = workspacesResponseSchema.parse(await getJson("/api/workspaces"));
    const projectOne = requireWorkspaceByRoot(listed.workspaces, realProjectOneRoot);
    const projectTwo = requireWorkspaceByRoot(listed.workspaces, realProjectTwoRoot);
    const projectOneFile = await requireWorkspaceTicketFile(projectOne.id);
    const projectTwoFile = await requireWorkspaceTicketFile(projectTwo.id);

    const preview = codexPromptPreviewResponseSchema.parse(
      await postJson(`/api/workspaces/${projectOne.id}/codex/prompt-preview`, {
        fileId: projectOneFile.id,
        ticketId: "AKB-05",
        instructionDraft: "workspace fake instruction",
      }),
    );
    expect(preview.prompt).toContain(`${realProjectOneRoot} 프로젝트`);
    expect(preview.prompt).toContain(
      `Ticket file: ${path.join(realProjectOneRoot, "docs", "02_alpha_kanban_tickets.md")}`,
    );
    expect(preview.prompt).toContain("Selected ticket: AKB-05");
    expect(preview.resumeSessionId).toBeUndefined();

    const scopedPreview = codexPromptPreviewResponseSchema.parse(
      await postJson(`/api/workspaces/${projectOne.id}/codex/prompt-preview`, {
        fileId: projectOneFile.id,
        ticketId: "AKB-05",
        instructionDraft: "@t:AKB-06 다른 티켓 상태도 같이 봐줘",
      }),
    );
    expect(scopedPreview.scopeResolution).toMatchObject({
      scope: "ticket",
      targetFileId: projectOneFile.id,
      targetTicketId: "AKB-06",
      cleanedMessage: "다른 티켓 상태도 같이 봐줘",
    });
    expect(scopedPreview.prompt).toContain("Resolved scope:");
    expect(scopedPreview.prompt).toContain("- Target ticket id: AKB-06");

    const created = createCodexRunResponseSchema.parse(
      await postJson(`/api/workspaces/${projectOne.id}/codex/runs`, {
        fileId: projectOneFile.id,
        ticketId: "AKB-05",
        instructionDraft: "workspace fake instruction",
      }),
    );
    const finished = await waitForRun(created.run.id);
    expect(finished.run.status).toBe("succeeded");
    const cwdEvent = finished.run.events.find((event) => event.message === "cwd");
    expect((cwdEvent?.data as { cwd?: string } | undefined)?.cwd).toBe(realProjectOneRoot);

    const summary = codexDocumentRunSummaryResponseSchema.parse(
      await getJson(
        `/api/workspaces/${projectOne.id}/files/${projectOneFile.id}/codex-run-summary`,
      ),
    );
    expect(summary.latestRun?.id).toBe(created.run.id);

    const state = JSON.parse(
      readFileSync(path.join(workspaceRoot, ".alpha-kanban", "state.json"), "utf8"),
    ) as {
      documents: Record<string, { codexSessionId?: string }>;
    };
    expect(
      state.documents[`${projectOne.id}::docs/02_alpha_kanban_tickets.md`]?.codexSessionId,
    ).toBe("fake-thread-id");
    expect(state.documents[`${projectTwo.id}::docs/02_alpha_kanban_tickets.md`]).toBeUndefined();

    const resumedPreview = codexPromptPreviewResponseSchema.parse(
      await postJson(`/api/workspaces/${projectOne.id}/codex/prompt-preview`, {
        fileId: projectOneFile.id,
        ticketId: "AKB-06",
      }),
    );
    expect(resumedPreview.resumeSessionId).toBe("fake-thread-id");
    expect(resumedPreview.args.slice(0, 4)).toEqual([
      "exec",
      "resume",
      "--skip-git-repo-check",
      "--json",
    ]);

    const projectTwoPreview = codexPromptPreviewResponseSchema.parse(
      await postJson(`/api/workspaces/${projectTwo.id}/codex/prompt-preview`, {
        fileId: projectTwoFile.id,
        ticketId: "AKB-06",
      }),
    );
    expect(projectTwoPreview.resumeSessionId).toBeUndefined();
    expect(projectTwoPreview.prompt).toContain(`${realProjectTwoRoot} 프로젝트`);

    const projectOneDocument = ticketDocumentResponseSchema.parse(
      await getJson(`/api/workspaces/${projectOne.id}/files/${projectOneFile.id}/tickets`),
    );
    const projectOneTicket = projectOneDocument.document.tickets.find(
      (ticket) => ticket.id === "AKB-05",
    );
    expect(projectOneTicket?.userInstructions.at(-1)?.text).toBe(
      "Codex 실행 지시: workspace fake instruction",
    );
    expect(
      projectOneTicket?.progressNotes.some((entry) =>
        entry.text.includes("Codex run succeeded"),
      ),
    ).toBe(false);

    const chat = codexTicketChatResponseSchema.parse(
      await getJson(
        `/api/workspaces/${projectOne.id}/files/${projectOneFile.id}/tickets/AKB-05/chat`,
      ),
    );
    expect(chat.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(chat.messages[0]).toMatchObject({
      scope: "ticket",
      role: "user",
      contentFormat: "markdown",
      content: "workspace fake instruction",
      workspaceId: projectOne.id,
      fileRelativePath: "docs/02_alpha_kanban_tickets.md",
      ticketId: "AKB-05",
      runId: created.run.id,
    });
    expect(chat.messages[1]).toMatchObject({
      role: "assistant",
      contentFormat: "markdown",
      content: "fake final message",
      runId: created.run.id,
    });

    const projectTwoChat = codexTicketChatResponseSchema.parse(
      await getJson(
        `/api/workspaces/${projectTwo.id}/files/${projectTwoFile.id}/tickets/AKB-05/chat`,
      ),
    );
    expect(projectTwoChat.messages).toEqual([]);
  });

  it("lists Codex CLI models and applies saved run defaults to prompts", async () => {
    const models = codexModelsResponseSchema.parse(await getJson("/api/codex/models"));
    expect(models.source).toBe("live");
    expect(models.models.map((model) => model.slug)).toContain("gpt-5.5");
    expect(models.models.find((model) => model.slug === "gpt-5.5")).toMatchObject({
      displayName: "GPT-5.5",
      defaultReasoning: "high",
      supportsFast: true,
    });

    const emptyDefaults = codexRunDefaultsResponseSchema.parse(
      await getJson("/api/codex/run-defaults"),
    );
    expect(emptyDefaults.defaults).toEqual({});

    const savedDefaults = codexRunDefaultsResponseSchema.parse(
      await putJson("/api/codex/run-defaults", {
        model: "gpt-5.5",
        reasoningEffort: "xhigh",
        speedTier: "fast",
      }),
    );
    expect(savedDefaults.defaults).toEqual({
      model: "gpt-5.5",
      reasoningEffort: "xhigh",
      speedTier: "fast",
    });

    const files = filesResponseSchema.parse(await getJson("/api/files"));
    const file = files.files[0];
    expect(file).toBeDefined();

    const preview = codexPromptPreviewResponseSchema.parse(
      await postJson("/api/codex/prompt-preview", {
        fileId: file?.id,
        ticketId: "AKB-05",
        instructionDraft: "defaults smoke",
      }),
    );
    expect(preview.runDefaults).toEqual({
      model: "gpt-5.5",
      reasoningEffort: "xhigh",
      speedTier: "fast",
      speedTierApplied: true,
      speedTierConfigKey: "service_tier",
    });
    expect(preview.args.slice(0, 10)).toEqual([
      "exec",
      "-m",
      "gpt-5.5",
      "-c",
      'model_reasoning_effort="xhigh"',
      "-c",
      "features.fast_mode=true",
      "-c",
      'service_tier="fast"',
      "--skip-git-repo-check",
    ]);

    const dryRun = createCodexRunResponseSchema.parse(
      await postJson("/api/codex/runs", {
        dryRun: true,
        fileId: file?.id,
        ticketId: "AKB-05",
        instructionDraft: "defaults dry run",
      }),
    );
    expect(dryRun.run.runDefaults).toEqual(preview.runDefaults);
    expect(dryRun.run.args).toEqual(
      preview.args.map((arg, index) =>
        index === preview.args.length - 1 ? dryRun.run.prompt : arg,
      ),
    );

    const clearedDefaults = codexRunDefaultsResponseSchema.parse(
      await putJson("/api/codex/run-defaults", {
        model: null,
        reasoningEffort: null,
        speedTier: null,
      }),
    );
    expect(clearedDefaults.defaults).toEqual({});
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
    const documentKey = Object.keys(state.documents).find((key) =>
      key.endsWith("::docs/02_alpha_kanban_tickets.md"),
    );
    expect(documentKey).toMatch(/^w_[a-f0-9]{16}::docs\/02_alpha_kanban_tickets\.md$/);
    expect(state.documents[documentKey ?? ""]?.codexSessionId).toBe("fake-thread-id");

    const noted = ticketDocumentResponseSchema.parse(
      await getJson(`/api/files/${file?.id}/tickets`),
    );
    const ticket = noted.document.tickets.find((item) => item.id === "AKB-05");
    expect(ticket?.userInstructions.at(-1)?.text).toBe("Codex 실행 지시: fake instruction");
    expect(
      ticket?.progressNotes.some((entry) => entry.text.includes("Codex run succeeded")),
    ).toBe(false);

    const chat = codexTicketChatResponseSchema.parse(
      await getJson(`/api/files/${file?.id}/tickets/AKB-05/chat`),
    );
    expect(chat.messages).toHaveLength(2);
    expect(chat.messages[0]).toMatchObject({
      scope: "ticket",
      role: "user",
      contentFormat: "markdown",
      content: "fake instruction",
      fileRelativePath: "docs/02_alpha_kanban_tickets.md",
      ticketId: "AKB-05",
      runId: created.run.id,
    });
    expect(chat.messages[1]).toMatchObject({
      role: "assistant",
      contentFormat: "markdown",
      content: "fake final message",
      runId: created.run.id,
    });

    const resumedPreview = codexPromptPreviewResponseSchema.parse(
      await postJson("/api/codex/prompt-preview", {
        fileId: file?.id,
        ticketId: "AKB-06",
      }),
    );
    expect(resumedPreview.resumeSessionId).toBe("fake-thread-id");
    expect(resumedPreview.args.slice(0, 4)).toEqual([
      "exec",
      "resume",
      "--skip-git-repo-check",
      "--json",
    ]);

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
    expect(otherPreview.args.slice(0, 3)).toEqual([
      "exec",
      "--skip-git-repo-check",
      "--json",
    ]);
  });

  it("runs Codex in read-only mode without appending ticket markdown", async () => {
    const files = filesResponseSchema.parse(await getJson("/api/files"));
    const file = files.files[0];
    expect(file).toBeDefined();
    const beforeMarkdown = readFileSync(file?.absolutePath ?? "", "utf8");

    const preview = codexPromptPreviewResponseSchema.parse(
      await postJson("/api/codex/prompt-preview", {
        fileId: file?.id,
        ticketId: "AKB-05",
        instructionDraft: "커밋 여부만 확인해줘",
        mode: "read_only",
      }),
    );
    expect(preview.mode).toBe("read_only");
    expect(preview.prompt).toContain("작업 모드: Read-only answer");
    expect(preview.prompt).toContain("파일 생성/수정/삭제를 하지 마");
    expect(preview.prompt).toContain("append하지 마");

    const created = createCodexRunResponseSchema.parse(
      await postJson("/api/codex/runs", {
        fileId: file?.id,
        ticketId: "AKB-05",
        instructionDraft: "커밋 여부만 확인해줘",
        mode: "read_only",
      }),
    );
    expect(created.run.mode).toBe("read_only");

    const finished = await waitForRun(created.run.id);
    expect(finished.run.status).toBe("succeeded");
    expect(finished.run.mode).toBe("read_only");
    expect(finished.run.events.at(-1)?.type).toBe("exit");
    expect(readFileSync(file?.absolutePath ?? "", "utf8")).toBe(beforeMarkdown);

    const noted = ticketDocumentResponseSchema.parse(
      await getJson(`/api/files/${file?.id}/tickets`),
    );
    const ticket = noted.document.tickets.find((item) => item.id === "AKB-05");
    expect(
      ticket?.userInstructions.some((entry) => entry.text.includes("커밋 여부만 확인")),
    ).toBe(false);
    expect(
      ticket?.progressNotes.some((entry) => entry.text.includes("Codex run succeeded")),
    ).toBe(false);

    const chat = codexTicketChatResponseSchema.parse(
      await getJson(`/api/files/${file?.id}/tickets/AKB-05/chat`),
    );
    expect(chat.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(chat.messages[0]).toMatchObject({
      role: "user",
      content: "커밋 여부만 확인해줘",
      runId: created.run.id,
    });
    expect(chat.messages[1]).toMatchObject({
      role: "assistant",
      content: "fake final message",
      runId: created.run.id,
    });
  });

  it("does not append a ticket user instruction when Codex fails before session start", async () => {
    const files = filesResponseSchema.parse(await getJson("/api/files"));
    const file = files.files[0];
    expect(file).toBeDefined();

    const created = createCodexRunResponseSchema.parse(
      await postJson("/api/codex/runs", {
        fileId: file?.id,
        ticketId: "AKB-05",
        instructionDraft: "preflight-fail 완료기준 충족 여부를 검토해줘",
      }),
    );

    const finished = await waitForRun(created.run.id);
    expect(finished.run.status).toBe("failed");
    expect(finished.run.capturedSessionId).toBeUndefined();

    const documentAfterFailure = ticketDocumentResponseSchema.parse(
      await getJson(`/api/files/${file?.id}/tickets`),
    );
    const ticketAfterFailure = documentAfterFailure.document.tickets.find(
      (item) => item.id === "AKB-05",
    );
    expect(
      ticketAfterFailure?.userInstructions.some((entry) =>
        entry.text.includes("preflight-fail"),
      ),
    ).toBe(false);
  });

  it("retries and deletes failed ticket chat messages without duplicating chat", async () => {
    const files = filesResponseSchema.parse(await getJson("/api/files"));
    const file = files.files[0];
    expect(file).toBeDefined();

    const created = createCodexRunResponseSchema.parse(
      await postJson("/api/codex/runs", {
        fileId: file?.id,
        ticketId: "AKB-05",
        instructionDraft: "preflight-fail retry candidate",
      }),
    );
    const failed = await waitForRun(created.run.id);
    expect(failed.run.status).toBe("failed");

    const chatAfterFailure = codexTicketChatResponseSchema.parse(
      await getJson(`/api/files/${file?.id}/tickets/AKB-05/chat`),
    );
    expect(chatAfterFailure.messages).toHaveLength(1);
    const sourceMessage = chatAfterFailure.messages[0];
    expect(sourceMessage?.runId).toBe(created.run.id);

    const retry = createCodexRunResponseSchema.parse(
      await postJson("/api/codex/runs", {
        fileId: file?.id,
        ticketId: "AKB-05",
        sourceMessageId: sourceMessage?.id,
      }),
    );
    expect(retry.run.id).not.toBe(created.run.id);
    expect(retry.run.sourceMessageId).toBe(sourceMessage?.id);
    expect(retry.run.retryOfRunId).toBe(created.run.id);
    await waitForRun(retry.run.id);

    const chatAfterRetry = codexTicketChatResponseSchema.parse(
      await getJson(`/api/files/${file?.id}/tickets/AKB-05/chat`),
    );
    expect(chatAfterRetry.messages).toHaveLength(1);
    expect(chatAfterRetry.messages[0]?.id).toBe(sourceMessage?.id);
    expect(chatAfterRetry.messages[0]?.runId).toBe(retry.run.id);
    expect(chatAfterRetry.messages[0]?.metadata?.previousRunIds).toContain(created.run.id);

    const chatAfterDelete = codexTicketChatResponseSchema.parse(
      await deleteJson(`/api/files/${file?.id}/tickets/AKB-05/chat/${sourceMessage?.id}`),
    );
    expect(chatAfterDelete.messages).toHaveLength(0);
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

  async function deleteJson(route: string): Promise<unknown> {
    const response = await fetch(`${baseUrl}${route}`, {
      method: "DELETE",
    });
    expect(response.ok).toBe(true);
    return response.json();
  }

  async function putJson(route: string, body: unknown): Promise<unknown> {
    const response = await fetch(`${baseUrl}${route}`, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "PUT",
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

  async function readNextMarkdownFileEvent(response: Response): Promise<unknown> {
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    const decoder = new TextDecoder();
    let buffer = "";
    const startedAt = Date.now();

    try {
      while (Date.now() - startedAt < 5_000) {
        const chunk = await reader?.read();
        if (!chunk || chunk.done) {
          break;
        }

        buffer += decoder.decode(chunk.value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";
        for (const block of blocks) {
          if (!block.includes("event: markdown-file")) {
            continue;
          }
          const dataLine = block
            .split("\n")
            .find((line) => line.startsWith("data: "));
          if (dataLine) {
            return JSON.parse(dataLine.slice("data: ".length));
          }
        }
      }
    } finally {
      await reader?.cancel();
    }

    throw new Error("Timed out waiting for markdown-file SSE event.");
  }

  function requireWorkspaceByRoot(
    workspaces: WorkspaceSummary[],
    root: string,
  ): WorkspaceSummary {
    const workspace = workspaces.find((item) => item.root === root);
    expect(workspace).toBeDefined();
    return workspace as WorkspaceSummary;
  }

  async function requireWorkspaceTicketFile(workspaceId: string): Promise<MarkdownFileSummary> {
    const files = filesResponseSchema.parse(
      await getJson(`/api/workspaces/${workspaceId}/files`),
    );
    const file = files.files.find(
      (item) => item.workspaceRelativePath === "docs/02_alpha_kanban_tickets.md",
    );
    expect(file).toBeDefined();
    return file as MarkdownFileSummary;
  }
});
