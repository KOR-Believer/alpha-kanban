# Alpha Kanban

Local kanban workspace for selecting a target project, browsing plan-ticketing Markdown sets, editing ticket state, discussing scope-aware work, and launching local Codex runs from the selected workspace context.

## What It Does

- Lists available target projects from configured `workspaceRoots`.
- Groups selected workspace Markdown files into document sets for `*_plan.md`, `*_tickets.md`, `*_inventory.md`, and other `.md` files.
- Renders selected ticket documents as a Notion-like flat kanban board and renders plan/inventory/markdown files in reader mode.
- Opens a ticket detail drawer with canonical fields, status/progress controls, user instruction history, progress notes, scope-aware Codex run draft, prompt preview, and ticket chat history.
- Provides a workspace chat surface for project-wide discussion, spec grilling, and plan-ticketing handoff prompts.
- Writes ticket changes back to Markdown with stale-file protection and external Markdown change detection.
- Runs `codex exec --json` locally, streams logs, supports cancel/read state, and stores workspace-scoped Codex session ids in `.alpha-kanban/state.json`.

## Install

```bash
pnpm install
pnpm install:skill
```

`pnpm install:skill` installs the bundled `plan-ticketing` Codex skill from
`skills/plan-ticketing` into `${CODEX_HOME:-~/.codex}/skills/plan-ticketing`.
Restart Codex after installing so the skill list refreshes.

## Run

```bash
pnpm dev
```

Default local URLs:

- Web: `http://127.0.0.1:5173/`
- API: `http://127.0.0.1:5174/`

The dev server binds to `127.0.0.1` only.

## Config

Alpha Kanban reads `alpha-kanban.config.json` from the workspace root.

```json
{
  "workspaceRoots": [".."],
  "defaultDocRoots": ["docs", "examples"],
  "codexCommand": "codex"
}
```

- `workspaceRoots`: target project allowlist. Project selection, file reads/writes, and Codex cwd routing must stay inside these roots.
- `defaultDocRoots`: Markdown roots scanned inside each selected target workspace.
- `docRoots`: backward-compatible alias for `defaultDocRoots`.
- `codexCommand`: executable used for `Run with Codex`.

If the config file is missing, the server defaults to `defaultDocRoots: ["docs"]`, `workspaceRoots: ["."]`, and `codexCommand: "codex"`.

## Required Codex Skill

Alpha Kanban is designed around the bundled `plan-ticketing` Codex skill. The
app can browse and edit Markdown without the skill, but Workspace Chat handoffs
and `Run with Codex` prompts assume the skill is installed.

The full skill directory is vendored in this repository:

```text
skills/plan-ticketing/
  SKILL.md
  agents/openai.yaml
  scripts/ticket-md.mjs
  assets/
  references/
```

Install or refresh it with:

```bash
pnpm install:skill
```

By default the installer writes to `~/.codex/skills/plan-ticketing`. Set
`CODEX_HOME` if your Codex home directory is elsewhere:

```bash
CODEX_HOME=/path/to/.codex pnpm install:skill
```

After installation, restart Codex. Then prompts can reference `$plan-ticketing`
to create or update plan, ticket, and inventory documents.

The installed skill also includes the deterministic ticket Markdown helper, so
it can be used outside Alpha Kanban WebUI:

```bash
node ~/.codex/skills/plan-ticketing/scripts/ticket-md.mjs show docs/example_tickets.md ABC-01
node ~/.codex/skills/plan-ticketing/scripts/ticket-md.mjs check docs/example_tickets.md
```

Inside this repository the shorter wrapper is available:

```bash
pnpm ticket-md show docs/11_alpha_kanban_autonomous_runs_tickets.md NVD-03
```

## Ticket Editing

Ticket writes are intentionally narrow:

- Status/progress updates change the ticket body and top-level `현재 진행률`; ticket body fields are the canonical source for UI/API state.
- `DONE` tickets get `Completed at: YYYY-MM-DDTHH:mm:ss+09:00` immediately after `Progress`; reopening a ticket removes that field.
- Legacy `Progress Board` sections may remain in older docs, but new docs do not require them and the UI/API do not use them as the source of truth.
- Run draft text is summarized and appended to `사용자 지시` only after the Codex CLI session starts successfully enough to provide a session id.
- Agent-authored results are appended to `진행 메모`.
- Writes include the current file hash and mtime from the UI; if the Markdown changed on disk, the API returns `STALE_FILE` and the UI asks for reload.
- The server emits workspace-scoped Markdown change events for selected workspace doc roots. The UI refetches the current document or, when a ticket drawer is open, shows `File changed externally` with a `Reload` action before saving or running Codex.

## Run With Codex

The runner uses the local Codex CLI and existing local auth.

Before using it:

```bash
codex --version
codex exec --help
```

Runner behavior:

- New document run: `codex exec --json <prompt>`
- Existing document session: `codex exec resume --json <sessionId> <prompt>`
- Non-git target workspaces add `--skip-git-repo-check` so Codex can run from selected project roots that are not repositories.
- Process launch uses `spawn(command, args)` with `shell: false`.
- The process stdin is closed with `stdio: ["ignore", "pipe", "pipe"]`; prompt input is passed through argv, not stdin.
- The run draft and assistant answer are stored in ticket/workspace chat logs; durable Markdown logs are appended only where the run policy allows.
- Session ids are stored by `workspaceId::documentPath` in `.alpha-kanban/state.json`.
- `.alpha-kanban/` is gitignored and should not be committed.
- JSONL logs are stored under `.alpha-kanban/runs/`.

The prompt gives Codex the selected target workspace root, ticket file path, selected ticket id, plan path when known, normalized scope block, run instruction summary, raw run draft, and instructions to use `rg`/`sed` for fresh context instead of embedding the whole Markdown document.

## Sample Fixture

`examples/sample_tickets.md` is a small fixture for UI and API smoke tests. It may be listed when `examples` is included in `defaultDocRoots`, but it is not treated as an operating project on its own.

## Verify

```bash
pnpm typecheck
pnpm test
pnpm build
```

Manual smoke checklist:

- Open `http://127.0.0.1:5173/`.
- Select or open an allowed target project from the project switcher.
- Confirm document sets list plan/tickets/inventory/markdown documents and that tickets open as a board while plan/inventory files open as readers.
- Open a ticket card and confirm the side/modal detail mode and width preference still work.
- Change status/progress on a disposable or fixture ticket, save, and confirm the ticket body plus top-level progress update.
- Enter a scoped Run with Codex draft such as `@t:AKW-10 상태만 확인해줘` and preview the prompt; confirm the resolved scope block and target workspace root are shown.
- Open Workspace Chat, send a read-only/spec prompt, and confirm the workspace-scoped chat history updates.
- Run Codex only when local CLI auth is ready; cancel if needed, then confirm run status, unread result badge, and mark-read behavior.
- Edit the selected Markdown file externally, then confirm the board refetches or the open ticket drawer shows `File changed externally` with a working `Reload` action.
- Refresh the browser or open a direct route and confirm selected workspace, selected document, and ticket detail hash state are restored.

## Local-Only Security Checklist

- Keep server and Vite host bound to `127.0.0.1`.
- Keep `workspaceRoots` and `defaultDocRoots` as narrow as possible.
- Do not commit `.alpha-kanban/`.
- Do not pass user input through shell-interpolated command strings.
- Treat Markdown content as local project data; avoid adding secrets to ticket logs.

## License

TBD. No open-source license has been selected yet.
