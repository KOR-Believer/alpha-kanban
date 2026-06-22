# Alpha Kanban

Local kanban workspace for browsing plan-ticketing Markdown files, editing ticket state, recording run instructions, and launching local Codex runs from ticket context.

## What It Does

- Scans configured Markdown roots for `*_tickets.md`, `*_plan.md`, and `*_inventory.md`.
- Renders selected ticket documents as a Notion-like flat kanban board.
- Opens a ticket detail drawer with canonical fields, status/progress controls, user instruction history, progress notes, Codex run draft, and prompt preview.
- Writes ticket changes back to Markdown with stale-file protection.
- Runs `codex exec --json` locally, streams logs, supports cancel, and stores file-level Codex session ids in `.alpha-kanban/state.json`.

## Install

```bash
pnpm install
```

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
  "docRoots": ["docs", "examples"],
  "workspaceRoots": ["."],
  "codexCommand": "codex"
}
```

- `docRoots`: Markdown roots the API may scan and edit.
- `workspaceRoots`: reserved workspace allowlist for Codex-oriented workflows.
- `codexCommand`: executable used for `Run with Codex`.

If the config file is missing, the server defaults to `docRoots: ["docs"]`, `workspaceRoots: ["."]`, and `codexCommand: "codex"`.

## Ticket Editing

Ticket writes are intentionally narrow:

- Status/progress updates change the ticket body, `Progress Board`, and top-level `현재 진행률`.
- Run draft text is summarized and appended to `사용자 지시` when `Run with Codex` starts.
- Agent-authored results are appended to `진행 메모`.
- Writes include the current file hash and mtime from the UI; if the Markdown changed on disk, the API returns `STALE_FILE` and the UI asks for reload.

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
- Process launch uses `spawn(command, args)` with `shell: false`.
- The process stdin is closed with `stdio: ["ignore", "pipe", "pipe"]`; prompt input is passed through argv, not stdin.
- The run draft summary is written to `사용자 지시` before the Codex process starts.
- Session ids are stored by ticket document path in `.alpha-kanban/state.json`.
- `.alpha-kanban/` is gitignored and should not be committed.
- JSONL logs are stored under `.alpha-kanban/runs/`.

The prompt gives Codex the ticket file path, selected ticket id, plan path when known, run instruction summary, raw run draft, and instructions to use `rg`/`sed` for fresh context instead of embedding the whole Markdown document.

## Sample Fixture

`examples/sample_tickets.md` is a small fixture for UI and API smoke tests. It is included in the default project config so the file browser can open it alongside the real Alpha Kanban ticket document.

## Verify

```bash
pnpm typecheck
pnpm test
pnpm build
```

Manual smoke checklist:

- Open `http://127.0.0.1:5173/`.
- Select `docs/02_alpha_kanban_tickets.md`.
- Confirm all six board columns render.
- Open a ticket card.
- Change status/progress, save, and confirm Markdown updates.
- Enter a Run with Codex draft and preview the prompt.
- Run Codex only when local CLI auth is ready; cancel if needed.
- Confirm the run draft summary lands under `사용자 지시`.

## Local-Only Security Checklist

- Keep server and Vite host bound to `127.0.0.1`.
- Keep `docRoots` as narrow as possible.
- Do not commit `.alpha-kanban/`.
- Do not pass user input through shell-interpolated command strings.
- Treat Markdown content as local project data; avoid adding secrets to ticket logs.
