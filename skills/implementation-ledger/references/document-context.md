# Document Context

Use this reference for optional owner setup, requests that need the current user, or a context-tool diagnostic. Ordinary work needs no configuration, user registration or team/personal question.

## Read-only tool

Use Node.js 24; Git is used for Git repository/worktree discovery. The complete installed skill contains the tool and its modules; no package installation or application server is needed.

```sh
node <skill-directory>/scripts/document-context.mjs new --cwd <project>
node <skill-directory>/scripts/document-context.mjs new --cwd <project> --base-dir notes
node <skill-directory>/scripts/document-context.mjs new --cwd <project> --target docs/@alice/research
node <skill-directory>/scripts/document-context.mjs check-new --cwd <project> --target docs/@alice/01_search_plan.md
```

`new` returns JSON with `ok`, `context`, `policy`, `documentRoot`, `user`, `document`, `numbering` and `diagnostics`. It does not write settings, directories or documents. `document.createDirectory` describes what the requested new-document work needs; it is not evidence that anything was created. Use the returned path, `documentIdHeader` and optional `ownerHeader` with the existing templates, then validate the newly written file with `check-new`. Re-resolve before writing if settings, destination or numbering changed; never overwrite an existing file to resolve a collision.

Relative targets are relative to the resolved current project/worktree root. `--base-dir` explicitly preserves an established basic location; otherwise `[documents] root` selects it (default `docs`); it does not opt an existing @ folder into automatic ownership. Use `--target` only for a destination the user actually specified. Explicit targets take precedence over default policy and need no user lookup. New document creation remains an agent action, not a CLI write command.

When `numbering.mode` is `existing-convention`, retain the local numbering practice. For `owner`, use `numbering.next`, calculated from Markdown numeric prefixes below the nearest owner directory, including ordinary subdirectories but excluding every nested `@` directory. Each physical owner directory has an independent sequence, even if another directory uses the same owner name. Gaps are not reused and moved numbers stay intact. A number is a sorting aid, not an identity, dependency or execution order.

An optional `edit --target <file>` query describes an existing path without resolving identity or changing its Owner; only the document-root setting is needed for path ownership. `actor` resolves identity only when a request needs “my folder” or “my work”; it does not select or execute a ticket. Existing body/status/direction edits and reference reading do not need a successful actor query. If the document root cannot be read, `edit` still succeeds with unresolved path ownership and diagnostics; new placement and `check-new` require a valid boundary.

Exit status is 0 for success, 2 for invalid arguments, 3 for context/settings/read/validation failure. On failure, use `diagnostics[].code`, source and message; do not replace an error with false or another user. Tests and isolated environments may pass `--home <directory>` to isolate the home fallback. Normal use leaves this option unset.

## Document folder and configuration placement

Place `.ak.config` at the project/worktree root, beside `.git` or the worktree's `.git` file. It can be committed. The config directory is not the document directory:

```text
reading-journal/
  .ak.config
  notes/
    01_reading_plan.md
```

```text
[documents]
    root = notes
```

`root` is a project-relative directory, default `docs`. Nested paths such as `notes/planning`, spaces, Korean names and explicit hidden folders are supported. Use `/` on every OS. Absolute paths, `..`, empty segments, backslashes, Git/internal administrative directories and nonportable path characters are rejected. No shell/home expansion or automatic file move occurs. Root selection does not enable `ownerFolders`.

Resolve **each shared key** independently: current project `.ak.config` → explicitly connected workspace `.ak.config` → that key's default (`root = docs`, `ownerFolders = false`). An inherited root is still relative to the current project, not to the workspace config. For example, workspace `root = notes` plus repo `ownerFolders = false` selects `<repo>/notes` without user lookup. A missing key falls through; an unreadable or invalid required value does not become a default.

Inspect placement without resolving a user:

```sh
node <skill-directory>/scripts/document-context.mjs root --cwd <project>
```

The browser reads the connected project's `.ak.config`, then a registered workspace that contains it as a direct child. It uses directory-handle identity even if the project is also connected directly. It never reads `.ak.user`, home settings, hidden parent folders or an arbitrary native Git workspace path. Register that workspace for browser inheritance, or commit `root` in the repo for consistent placement across machines and external worktrees. Connecting `notes` itself does not expose its parent's configuration or owner boundary. Ordinary Markdown discovery is not restricted to `root`.

## Optional owner setup

The shared project `.ak.config` can be committed:

```text
[documents]
    ownerFolders = true
```

The private `.ak.user` identifies the actor:

```text
[user]
    id = @alice
```

Keep `.ak.user` out of Git, for example with `/.ak.user` in the root `.gitignore` or local Git exclude file. Only create or change settings/exclusions when requested. Do not put a user in `.ak.config` or policy overrides in `.ak.user`.

The files use a restricted Git config syntax: UTF-8 (optional BOM), comments, quotes and case-insensitive section/key names. Values preserve case. `ownerFolders` accepts explicit `true` or `false`; `user.id` is an @ identifier. Duplicate or unknown keys, includes/subsections, malformed files and read failures are errors. Only missing files/keys fall through. Personal values never override shared values. Shared keys inherit independently as described above.

- Default placement policy: current repo `.ak.config` → explicitly connected workspace `.ak.config` → false. A repo false overrides workspace true. Home users, existing @ folders and headcount never activate it.
- Actor, only when needed: original repo `.ak.user` → connected workspace `.ak.user` → OS-home `.ak.user`. Missing everywhere asks for a user only for that user-dependent operation. OS/Git author names and folder names are not identities.
- A true policy with a valid actor places new work in the current worktree’s `<document-root>/@actor/` (default `docs/@actor/`) and records its Owner. False/unset keeps basic placement. Explicit destinations and existing files keep their location when the policy changes.

For an explicitly requested workspace connection, the repository's common Git config holds one absolute `alphaKanban.workspaceRoot` path. This is local to that Git repository, shared by its linked worktrees, and not committed. Write it to the exact common config file rather than global/include/worktree config. The read-only tool never creates this connection. To connect the workspace for the native tool, run these commands from the repository with its actual workspace path:

```sh
git rev-parse --path-format=absolute --git-common-dir
# Use the printed directory followed by /config:
git config --file <common-git-directory>/config alphaKanban.workspaceRoot <absolute-workspace-path>
```

A missing connection skips workspace settings; a broken connection reports an error when that fallback is needed. Browser folder registrations are independent.

Linked worktrees use their **current** `.ak.config`, but inherit the verified main worktree's `.ak.user` and common workspace connection. A `.ak.user` placed in the linked worktree is not the original repo user. Branch, detached HEAD, a temporary parent folder and same-remote clones do not change that source. Restore a missing/inaccessible main connection explicitly; bare or unverifiable separate-git-dir origins cannot inherit a private user. Explicit document targets and existing edits remain available without that lookup. Never substitute the home user for an unverified main; a valid main with a missing user file can fall through normally. Only the current project is a document destination.

## Owner header and boundaries

```markdown
# Search plan

Owner: @alice
작성일: 2026-11-01

## Goal
```

The metadata header is the run of single-line `Field: value` entries and blank lines immediately after the document's H1 title. Prose, lists, code or the next heading end it. Read only the exact `Owner:` field there; duplicate, empty, quoted, invalid or differently cased Owner fields are errors. Body/quote/code examples and foreign front matter are not this field. `check-new` compares the header to the target folder and preserves every byte.

Walk from the document's parent toward the configured document root (default `docs`) and use the nearest `@` directory. `docs/research/@alice/file.md` and `docs/@bob/archive/@alice/file.md` both belong to @alice; `docs/@bob/@notes.md` belongs to @bob because the filename is not a directory. An invalid nearest `@` name is an error, never a fallback to an outer owner. Explicit new-document targets keep their full nested path. Paths outside the visible configured document root do not acquire ownership from hidden parents.

Identifiers start with @ and a Unicode letter/number, followed by letters/numbers/combining marks, dots, underscores or hyphens; no trailing dot, whitespace, path separators or control characters, maximum 240 UTF-8 bytes. Compare Unicode NFC, preserve existing spelling, and report case/Unicode collisions rather than choosing a different owner. Unsafe symbolic-link/nested-repo targets or incomplete numbering scans are reported, not followed or guessed.

Owner records the last confirmed document owner; it is not the actor, original author, current path, UUID or permission. An existing @ document with no Owner or a different Owner is a reconciliation candidate. Ordinary editing preserves it; this tool does not migrate existing documents, move files or rewrite links. Ordinary documents without Owner remain valid. Other people's context, unfinished tickets and recorded instructions do not authorize execution or handoff; use the current user request and latest relevant directions.

## New-document identity

Every successful `new` call generates one UUID v4 in `documentIdHeader`. Replace `{{DocumentIdHeader}}` with that line in the new document's header. Call separately for each plan/tickets/inventory file, including basic use without settings or Owner; the result is not a document-set ID. The older `--with-id` flag remains accepted but is unnecessary. Reuse the chosen ID while completing the same new file instead of replacing it on each edit.

`check-new` requires a valid ID in the document header and reports `DOCUMENT_ID_REQUIRED` for a missing one; invalid or duplicate fields remain `INVALID_METADATA`. A body/code/front-matter example does not count. The check reads only the specified file and its placement context; it does not scan other documents or prove project-wide uniqueness. It never adds or repairs metadata. Use `edit` and ordinary ledger checks for existing documents, which may still have no ID. Existing IDs/owners/locations stay unchanged during ordinary edits; explicit migration is described in [document operations](document-operations.md).
