# Alpha Kanban

Local kanban workspace for browsing implementation-ledger Markdown sets, reviewing work, and leaving durable ticket directions. Discuss and execute work in Codex; exchange context through the project's Markdown files.

## What It Does

- Lists available target projects from configured `workspaceRoots`.
- Groups selected workspace Markdown files into document sets for `*_plan.md`, `*_tickets.md`, `*_inventory.md`, and other `.md` files.
- Renders selected ticket documents as a Notion-like flat kanban board and renders plan/inventory/markdown files in reader mode.
- Opens a ticket detail drawer with canonical fields, status/progress controls, user instruction history, and progress notes.
- Appends manual user directions and status-change reasons to the selected ticket's Markdown.
- Writes ticket changes back to Markdown with stale-file protection and external Markdown change detection.

In-app Workspace Chat, ticket chat, model options, and run controls are temporarily
hidden. Existing chat/run data and backend APIs are retained, but document saves
do not send prompts or start Codex.

## Workflow

The UI defaults to Korean. Choose **한국어 / English** in the Start page or either
board's top bar; the choice applies immediately and is remembered in this browser.
It does not change document content, canonical Markdown status/field names, paths,
or stored user directions. Default status-change reasons remain in their original
Korean because the input previews the exact text written to Markdown.

1. Open or create a project. You can start without documents.
2. Discuss the work in Codex with `$implementation-ledger`, then ask it to create tickets and, when useful, a plan or inventory.
3. Review the plan and progress in Alpha Kanban. All work can continue in your AI chat; editing the board is optional.
4. When needed, leave a manual direction or move a ticket on the board, then ask Codex to reread the updated file. Dragging a card opens a confirmation dialog before saving.

## Install

```bash
pnpm install
pnpm install:skill
```

`pnpm install:skill` installs the bundled `implementation-ledger` Codex skill from
`skills/implementation-ledger` into `${CODEX_HOME:-~/.codex}/skills/implementation-ledger`.
Restart Codex after installing so the skill list refreshes.

## Run

```bash
pnpm dev
```

Default local URLs:

- Web: `http://127.0.0.1:5173/`
- API: `http://127.0.0.1:5174/`

The dev server binds to `127.0.0.1` only.

## Browser-Local Preview

The separate browser-local build uses desktop Chrome's File System Access API.
It keeps local Markdown on your computer and does not start an API server or Codex.
The original `pnpm dev` and Node-backed workflow above remain unchanged.

```bash
pnpm dev:browser       # http://127.0.0.1:5187, browser file access
pnpm build:browser     # apps/web/dist-browser
pnpm preview:browser  # http://127.0.0.1:4187, serve the static output
```

The development/build commands need Node; visitors to the eventual hosted website do not.
This branch has not been publicly deployed.

The `/` route is the project launcher with separate recent/other project lists.
The `/intro` route introduces the workflow with a fictional board and matching
Markdown. Opening the introduction does not request folder access or load projects.

1. Choose **프로젝트 열기 / Open project** for one project, or **워크스페이스 등록 / Register workspace** for a folder containing projects.
2. Roots group their immediate child directories as projects. More specific folder connections take precedence. Selecting a folder grants access; the website cannot browse arbitrary paths.
3. Open **로컬 폴더 / Local folders** and choose **편집 권한 허용 / Allow editing** before changing tickets. Read access and write access are separate.
4. Optionally leave reasons and directions through the same ticket and drag-confirmation forms. Changes go to the original Markdown, not a cloud document store.
5. Discuss and execute work in your external AI tool. Start, the introduction and empty projects share a reviewable Codex installation request, a GitHub source link and manual instructions. A complete skill ZIP is available inside manual installation. Back up and compare any installed skill before replacing it.

Draft a plan with your AI, review its open questions, and discuss those that affect
the implementation you are about to request. Questions about later work can stay
open. Reflect agreed scope and completion criteria in new or existing tickets,
then request implementation and review the results. The bundled skill checks for
relevant unresolved decisions before dependent implementation; it does not require
every question to be resolved or repeat decisions already answered or delegated.

Connections, opaque IDs, recent projects, recovery copies and global card order live
in this site's IndexedDB. Language, sorting, filters and detail dimensions remain
browser preferences. A different hostname, port, browser profile, or cleared site
data starts a different registry. Native `.alpha-kanban` state and absolute-path URLs
are not automatically migrated. Reconnect the original folder when permission expires.

The browser scans Markdown below connected projects, skipping hidden/build/dependency
directories (including `.git`, `node_modules`, and `.alpha-kanban`). Native
`alpha-kanban.config.json` allowlists and absolute docRoots are not imported. The
initial limit is 5,000 files per project, 30 folder levels and 10 MiB per Markdown file.
The body cache is capped at 64 MiB; metadata and grouped progress remain cached after
body eviction, so listing unchanged documents does not require rereading their text.
Files with invalid UTF-8 or ambiguous ticket fields are not silently rewritten.

Saves check the current content hash and modification time, keep a durable recovery
copy before writing, serialize this site's tabs, and verify the result after closing
the write stream. External tools do not participate in those browser locks: a race
after the last check remains possible, and an unseen intermediate external version
cannot be recovered. Avoid simultaneous edits to the same file when practical.
If a save is uncertain, open **Local folders → Recovery records**, download the
original/intended copies, check the actual file, and explicitly finish the review.
Do not submit the same direction again before checking whether it was already saved.

While visible, projects are rescanned every 15 seconds and on window focus. File
metadata avoids rereading unchanged bodies; the selected document is checked freshly.
Edits in progress receive a stale-file notice instead of losing their draft.
Browser writes and saved card order also notify other tabs. These are not background
watch guarantees. Local I/O remains usable without a network after the app loads;
offline first load/reload is not supported.

### Cloudflare Pages

- Build command: `pnpm build:browser`
- Output directory: `apps/web/dist-browser`
- Production target: a stable `<project>.pages.dev` hostname, not a new preview hostname on every run.
- No Functions, Workers, API proxy, root `404.html`, or hash-router fallback. Pages' SPA fallback serves `/`, `/intro`, `/all`, and `/w/:id`; query and fragment preserve document/ticket state.
- `public-browser/_headers` supplies CSP, no-referrer, and MIME-sniff protection. Markdown is not uploaded. External images only load on explicit request; local resources resolve through folder handles, not hosting paths.
- `tk.giveit2.me` is a future custom-domain option, not configured by this change. Moving there requires reconnecting folders because browser storage is origin-scoped.

See [browser-local validation](docs/browser_local_validation.md) for the verified
checks and remaining real-folder/contributor-PC acceptance work.

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
- `codexCommand`: executable for the retained runner API; unused by document-only UI actions.

If the config file is missing, the server defaults to `defaultDocRoots: ["docs"]`, `workspaceRoots: ["."]`, and `codexCommand: "codex"`.

## Required Codex Skill

Alpha Kanban is designed around the bundled `implementation-ledger` Codex skill.
The app can browse and edit compatible Markdown without Codex. Install the skill
in Codex to create compatible documents and interpret the directions left here.

The full skill directory is vendored in this repository:

```text
skills/implementation-ledger/
  SKILL.md
  agents/openai.yaml
  scripts/check-ledger.mjs
  scripts/ticket-md.mjs
  assets/
  references/
```

Install or refresh it with:

```bash
pnpm install:skill
```

By default the installer writes to `~/.codex/skills/implementation-ledger`. Set
`CODEX_HOME` if your Codex home directory is elsewhere:

```bash
CODEX_HOME=/path/to/.codex pnpm install:skill
```

After installation, restart Codex. Then prompts can reference `$implementation-ledger`
to create or update plan, ticket, and inventory documents.

The installer does not delete an existing `~/.codex/skills/plan-ticketing`
directory because it may contain user changes. Remove that legacy skill manually
when both skills should not be discoverable.

The installed skill also includes the deterministic ticket Markdown helper, so
it can be used outside Alpha Kanban WebUI:

```bash
node ~/.codex/skills/implementation-ledger/scripts/ticket-md.mjs show examples/sample_tickets.md SMP-01
node ~/.codex/skills/implementation-ledger/scripts/check-ledger.mjs examples/sample_tickets.md
```

Inside this repository the shorter wrapper is available:

```bash
pnpm ticket-md show docs/11_alpha_kanban_autonomous_runs_tickets.md NVD-03
```

## Ticket Editing

Ticket writes are intentionally narrow:

- Status/progress changes share one form in ticket detail and the drag confirmation dialog. An empty reason uses the displayed user-action default; custom text is labeled `사용자 사유:`. One guarded file update changes the ticket body, completion timestamp, top-level `현재 진행률`, and appends the record to `사용자 지시`.
- Dragging to another column opens a dialog; canceling does not move or save the card. The card moves only after a successful save. Same-column drops on a workspace board do not reorder tickets; the all-projects board supports a separate saved order. Stale documents or save failures do not cause an optimistic move.
- `DONE` tickets get `Completed at: YYYY-MM-DDTHH:mm:ss+HH:MM` using the server's local offset immediately after `Progress`; reopening removes that field. Old checked items and progress notes are preserved for reassessment, not silently reset. A user's DONE action is not a claim that an agent ran verification.
- Legacy `Progress Board` sections may remain in older docs, but new docs do not require them and the UI/API do not use them as the source of truth.
- `문서에 추가` appends free text prefixed by `[수동지시]` to `사용자 지시`. There is no record-type selector. It does not change status or start a chat/run.
- Codex records its own outcomes in `진행 메모` during separately authorized work.
- Writes include the current file hash and mtime from the UI; if the Markdown changed on disk, the API returns `STALE_FILE` and the UI asks for reload.
- The server emits workspace-scoped Markdown change events for selected workspace doc roots. The UI refetches the current document or, when a ticket drawer is open, shows `File changed externally` with a `Reload` action before saving.

New records retain the ledger's single-line dated format. Input line breaks are
collapsed to spaces so they cannot create new ticket headings or fields:

```md
- 2026-10-13: DONE -> TODO 사용자가 명시적으로 할 일로 변경했습니다.
- 2026-10-13: DONE -> TODO 사용자 사유: 저장 후 값이 초기화되는 버그 발견.
- 2026-10-13: [수동지시] 자동 저장은 이번 범위에서 제외한다.
```

## All-Projects Board

- `/all` groups tickets by the first directory beneath a registered `workspaceRoots` entry. Overlapping roots use the most specific enclosing root, not a common prefix guessed from discovered projects. A workspace equal to a registered root represents that root itself.
- Project identity comes from its canonical absolute path. Identical folder names in different roots remain separate; their tabs show the full path to disambiguate. For example, registering `~/workspace` groups `sparkone/apps/crew-admin` under `sparkone`; additionally registering `~/workspace/sparkone/apps` groups it under `crew-admin` instead.
- Existing discovery still lists project candidates and explicitly opened recent workspaces; registering a root does not recursively open every nested directory. Nested workspaces that expose the same document are deduplicated, preferring the most specific workspace for API routing.
- Search, project filters, and Hide DONE are remembered locally. The header counts visible cards; project tabs count all loaded tickets in that project.
- Reads are concurrency-limited. An inaccessible project or document produces a warning while the remaining tickets stay visible. The board polls every 15 seconds; an open editor preserves its draft and requires reload if its file changed.
- Workspace and all-projects views share the reason dialog, editable ticket detail, manual direction input, and detail preferences. Ticket views offer side peek, center peek, and full view. Drag the side edge or center edges/corner to resize; double-click an edge to reset. Each peek remembers its size, and switching views preserves unsaved input. Saving edits Markdown only and does not start Codex.
- Same-column card ordering can be changed by drag/drop or the up/down buttons. Order saves are serialized within the view, roll back on failure, and preserve entries for temporarily unavailable projects. A cross-column move saves the status and reason first; an order-save failure is reported separately and does not undo an already saved Markdown change.
- State-file mutations and guarded Markdown writes are serialized per path across service instances in one API process. This does not coordinate separate API processes or external editors. File revisions still protect against stale UI saves; the global board order is last-save-wins across browser tabs.

## Retained Runner

The runner and chat APIs remain for compatibility and a later product decision.
They are not exposed by the current UI. Hiding the UI is not an API security
boundary and does not cancel an already running process.

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
- Open a ticket card in both boards and confirm side/center/full view, independent size preferences, resize handles, and unsaved-input preservation work.
- Confirm there is no Workspace Chat launcher, ticket chat composer, or model/run control.
- Change status/progress on a disposable ticket, enter a reason, save, and confirm the ticket body, top-level progress, and `사용자 지시` update together.
- Reopen a DONE fixture ticket and confirm `Completed at` disappears, a user-authored transition is appended, and old checklists/notes remain.
- Drag a fixture card to another status and confirm the dialog uses the same default reason. Cancel once, then confirm a move; the card must not move until saving succeeds.
- Append a manual direction and confirm one dated `[수동지시]` line appears in the selected ticket's `사용자 지시` without a chat message or Codex run.
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
