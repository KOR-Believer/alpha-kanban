# Optional document operations


The document boundary comes from `[documents] root` in `.ak.config`, default `docs`. Put the file at the current project root. Repo values override the explicitly connected workspace per key; inherited paths still refer to the current repo. Examples below use the default: replace `docs` in `scope`, targets and moves when a different root is configured. Explicit scope is still required and must stay within that root. The reviewed plan pins the resolved root and source; a settings change requires a new analysis before apply/resume. Explicit recovery uses the original plan's boundary.

Document maintenance is optional compatibility care for files you continue to use as the format evolves. Its supported operations currently include ID assignment, folder-based Owner correction and recognized obsolete-section cleanup. Reading existing documents and boards never requires maintenance. Each new cleanup or metadata rule must preserve real ticket bodies and preview the exact changes before explicit application.

Read this only for requested identity assignment, legacy cleanup, document movement, ownership handoff or PC path repair. Ordinary creation/editing needs none of these operations. A skill/app update never authorizes document conversion.

## Runtime and scope

The complete installed skill contains `scripts/document-cli.mjs` and its dependency licenses. Run it with **Node.js 24 and Git**, from the current document repository/worktree. No pnpm, node_modules, source checkout, agent settings file or server is needed. The browser never runs this program. Use the installed script's absolute path; do not copy only SKILL.md.

The command infers this worktree's root, Git directory, HEAD and branch from the current directory. There is no checkout selection. Writes are restricted to the explicitly supplied `docs` paths in that worktree. Other registered repos supply exact read-only reference targets, never additional write roots. Another worktree is independent until the user merges its changes.

## Analyze, review, apply, verify

1. Build a JSON request for the user's authorized operation and exact paths. Store requests/plans **outside the worktree**, with private permissions: the plan contains preimages of changed documents.
2. Run `node <skill>/scripts/document-cli.mjs analyze --request <request.json>` and retain its JSON output. `--request -` and `--plan -` accept stdin.
3. Review `context`, `changes[].diff`, `ownership`, `issues`, and `decision`. `blocked` cannot be overridden. For each `review` issue actually reviewed within the authorized scope, put its exact fingerprint into the request's `acknowledgements` and analyze again. Do not blindly approve every diagnostic or edit the returned plan. Changed inputs invalidate acknowledgements. Existing user authorization remains sufficient; ask only for genuinely missing scope/decisions.
4. For `ready`, run `apply --plan <plan.json> --approve <exact-plan-id>` using the same script. `noop` means no changes, not a clean bill of health for all references.
5. Run `verify --id <plan-id>`. Report the actual changed paths and verification result. Do not claim success from analyze or process exit alone.

Each completed verification is bound to that operation's inspected snapshot. Later authorized edits to an inspected document can make an older receipt return `REFERENCE_CHANGED`; compare its approved outputs and current scope instead of reporting corruption or rolling it back automatically. Repeated analyze of an already verified operation can return a `document-operation-receipt-1` receipt with `decision: noop`, `reason: already-applied`, and `verified: true`; it is not a new apply plan and need not have `issues`.

All stdout is one JSON object. Exit codes: 0 success, 2 invalid input, 3 review needed, 4 blocked, 5 recovery required. `help` lists commands. Read errors before deciding the next command. Never use regex replacement to bypass a blocked link, identity or scope check.

## ID assignment and legacy cleanup

These operations can also correct a document's recorded Owner without moving it or repairing links. Set `targets[].reconcileOwner: true` to insert a missing Owner or replace a valid mismatching Owner with the nearest `@` directory within the configured document root. No actor lookup or previous path is required for this header-only correction. With no confirmed owner directory (including an invalid nearest `@` name), preserve the recorded Owner and report `OWNER_PATH_UNRESOLVED` when relevant; ID assignment and cleanup can still proceed. Invalid/duplicate header metadata retains its existing protection. Owner correction is not evidence of completed relocation, working links or authority to implement tickets.

```json
{
  "schema": 1,
  "operation": "migrate",
  "scope": ["docs"],
  "targets": [
    {"path": "docs/13_search_tickets.md", "assignId": true, "cleanupLegacy": true}
  ]
}
```

CLI booleans remain independent; choose only what was requested. Existing valid IDs stay unchanged. A missing ID receives one UUID v4 in the reviewed plan; apply/resume reuse it. Each file, including related plan/ticket/inventory files, has its own ID. Ordinary Markdown additionally requires `allowPlainMarkdown: true` and an existing H1; the tool does not invent a title. Invalid/duplicate metadata and unsupported format declarations refuse transformation. Header/section maintenance does not require canonical ticket bodies: preserve missing fields and legacy state/progress values without normalizing them.

The initial registry rule `legacy-progress-board-v1` uses only the `Progress Board` heading and the known five-column table structure. Do not compare row counts, ticket IDs or values against the body: stale and unmaintained tables are intended cleanup targets. Show the exact deletion in the preview. If notes surround the table, remove only the table and preserve the heading/notes; unknown columns, malformed tables and fenced examples stay intact. Preserved content is reported under `migration.retained`. No dates, completion history or format declarations are generated; Owner changes only when `reconcileOwner` is selected. Undeclared recognized documents and format 1 use the same rule directly; no fictitious historical versions or intermediate migrations are required. A repeat is a noop.

Additional rules remove the status glossary under `티켓 상태`, progress glossary under `Progress 기준`, and closed Markdown ticket examples plus the known introduction under `Ticket Template`. Dates, user directions and progress notes inside that template example are removed with it. Extra prose outside recognized blocks stays with its heading; unclosed fences, quoted/nested headings and unrelated structures remain untouched. Actual `Ticket List` bodies must remain byte-for-byte identical, including their instructions, notes and noncanonical values. Cleanup preserves sections needed by existing links instead of rewriting ticket content. Rendering is independent of all maintenance checks.

Cleanup uses a dedicated read-only reference check, separate from move/rebase validation. Only observed links to affected sections matter. Keep a referenced section, or a section whose deletion would renumber another referenced heading, and continue the remaining cleanup and ID assignment. Report the kept section under `migration.retained`; never rewrite other documents or any link text. Recognized Markdown and literal HTML/wiki links can establish a reference, but unrelated malformed/missing links, unknown old PC roots and excluded folders do not block cleanup. Code examples and unused definitions are not incoming links. Do not guess document identity from filenames or old path suffixes. Native migration can recognize exact current absolute targets; the browser checks relative references within its connected project.

The browser's **Document maintenance** action immediately previews missing-ID assignment, folder-based Owner correction and recognized legacy cleanup together, without option or confirmation checkboxes. Only **Apply reviewed changes** writes the selected file. Cancellation, preview errors, document changes and late preview results never apply changes. Existing IDs remain unchanged; a noop disables Apply. The dialog states why an Owner or referenced section is kept. Reanalysis immediately before saving catches a moved document or newly added relevant links; an unrelated document edit alone does not invalidate the browser preview. Browser recovery copies live in IndexedDB; they are independent of native CLI journals.

## Move, adoption and handoff

Ownership follows the nearest `@` directory, including nested directories. Moving an outer owner folder does not assign its independently owned nested documents to that outer owner. A move into a different nearest owner still requires explicit handoff/adoption intent; `actor: current` checks each destination against the resolved user. A directory-wide request is a physical scope, not evidence that all its tickets belong to one person.

```json
{
  "schema": 1,
  "operation": "move",
  "scope": ["docs"],
  "moves": [{"from": "docs/13_search_plan.md", "to": "docs/@alice/13_search_plan.md"}],
  "owner": "destination",
  "intent": "adopt"
}
```

Ordinary reorganization omits `owner`, `intent` and `actor`. Moving into a new owner folder requires `owner: destination`; first adoption uses `intent: adopt`, changing an existing owner (including return from leave) uses `intent: handoff`. Destinations are explicit, can name another user, and cannot already exist. Add `actor: current` only when the request means the configured current user; the common tool resolves private repo > workspace > home identity, including linked-worktree inheritance. `ownerFolders` controls defaults for new documents, not these explicit existing-file operations.

Preserve document numbers and gaps. New owned documents increment within their owner folder; numbers are sorting hints, never dependencies or execution authority. Read `Depends on`, ticket state and latest user instructions. Taking ownership preserves checklist/history and never starts implementation or changes ticket status. Other owners' documents remain reference context unless the user explicitly assigns their work.

For externally moved files use `operation: reconcile`, `owner: destination`, an explicit adopt/handoff intent, and `targets`:

- Verified previous placement: `{ "path": "docs/@alice/13_search_plan.md", "previous": { "path": "docs/13_search_plan.md", "documentId": "<existing-uuid>", "hash": "<verified-pre-move-sha256>" } }`.
- Owner-only registration at an already confirmed placement: `{ "path": "docs/@alice/13_search_plan.md", "placement": "confirmed-in-place" }`.

Do not infer old paths from Owner or a filename. A duplicate UUID, occupied previous path or changed pre-move bytes prevents guessing a relocation. Recovery returns to the state immediately before the CLI, not before a prior manual move.

## PC path repair

```json
{
  "schema": 1,
  "operation": "rebase",
  "scope": ["docs/@alice"],
  "repositories": [
    {"root": "current", "oldRoot": "/old/workspace/project", "proof": {"kind": "remote", "url": "https://example.com/team/project.git"}},
    {"root": "/current/services/api", "oldRoot": "/old/workspace/api", "proof": {"kind": "remote", "url": "https://example.com/team/api.git"}}
  ]
}
```

Replace example roots/remotes with evidence from the request and local Git configuration. `proof: {kind: "confirmed", reason: "<user-confirmed mapping>"}` is available when remote proof is unavailable; do not fabricate that confirmation. Only exact files at the mapped roots are accepted. Repo clone names and nesting can differ. No network/clone/checkout search occurs; ambiguous or missing targets block the plan. Moves/reconciliation may also provide `repositories: [{root: "<exact-external-repo-root>"}]` for external read-only targets.

CommonMark links/images/reference definitions and the ledger's backtick `- 기준 문서:` field are supported. The latter is project-root relative unless explicitly `./` or `../`. Code, front matter and arbitrary prose are not replaced. Path-only changes preserve labels/query/fragments/BOM/line endings; cleanup changes only proven fragments/sections. Output is relative; cross-drive/UNC paths require explicit `output: file-url` and do not become portable to another PC. Web `//host/path` is not an inferred UNC path.

## Interrupted operation and recovery

Use `list`, `verify --id <id>`, then explicitly choose `resume --id <id> --approve <id>` or `recover --id <id> --approve <id>`. Never automatically retry an uncertain write or regenerate its UUID. A rollback already started must continue rollback. The worktree-specific Git directory stores a private journal with complete preimages, file flush and readback before the first document change. Windows uses write-through file handles and file fsync; directory fsync is unavailable and reported in `persistence`. Other platforms retain directory fsync. File flush errors always stop the operation. Process-interruption recovery is not a guarantee against OS crashes or power loss. External edits that match neither expected state are preserved and require manual comparison; recovery is not a force-overwrite command. Keep unresolved backups.

A dead process can leave a lock. Inspect `lock-info`, then use `unlock --token <reported-token>` only when the same-host owner is confirmed dead. Unlocking does not resume work or remove its journal. Never delete the lock/journal manually to bypass a refusal.

The transaction verifies exact inputs, references, file identity and attributes, but is not an atomic multi-file operation or an external-editor lock. Symlinks, existing hard links, collisions, nested-repo boundaries, unknown attributes and cross-filesystem moves are refused. Directory-attribute inspection is currently verified on macOS; other platforms refuse whole-directory movement when inspection is unavailable. Windows/UNC path calculation fixtures do not establish Windows native filesystem behavior. Individual files preserve their original inode. Backlinks outside the inspected worktree, in excluded content or chats are not verified. Keep these limits in the report without claiming a broader migration.
