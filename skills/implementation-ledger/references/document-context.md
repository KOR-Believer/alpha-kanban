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

`new` returns JSON with `ok`, `context`, `policy`, `user`, `document`, `numbering` and `diagnostics`. It does not write settings, directories or documents. `document.createDirectory` describes what the requested new-document work needs; it is not evidence that anything was created. Use the returned path and `ownerHeader` with the existing templates, then validate the newly written file with `check-new`. Re-resolve before writing if settings, destination or numbering changed; never overwrite an existing file to resolve a collision.

Relative targets are relative to the resolved current project/worktree root. `--base-dir` preserves an established basic location (default `docs`); it does not opt an existing @ folder into automatic ownership. Use `--target` only for a destination the user actually specified. Explicit targets take precedence over default policy and need no user lookup. New document creation remains an agent action, not a CLI write command.

When `numbering.mode` is `existing-convention`, retain the local numbering practice. For `owner`, use `numbering.next`, calculated from Markdown numeric prefixes throughout that owner's subtree. Other owners and unassigned documents do not contribute; gaps are not reused and moved numbers stay intact. A number is a sorting aid, not an identity, dependency or execution order.

An optional `edit --target <file>` query describes an existing path without reading user/policy settings or changing its Owner. `actor` resolves identity only when a request needs “my folder” or “my work”; it does not select or execute a ticket. Existing body/status/direction edits and reference reading do not need a successful actor query.

Exit status is 0 for success, 2 for invalid arguments, 3 for context/settings/read/validation failure. On failure, use `diagnostics[].code`, source and message; do not replace an error with false or another user. Tests and isolated environments may pass `--home <directory>` to isolate the home fallback. Normal use leaves this option unset.

## Optional owner setup

The shared project `.ak.config` can be committed:

```ini
[documents]
    ownerFolders = true
```

The private `.ak.user` identifies the actor:

```ini
[user]
    id = @alice
```

Keep `.ak.user` out of Git, for example with `/.ak.user` in the root `.gitignore` or local Git exclude file. Only create or change settings/exclusions when requested. Do not put a user in `.ak.config` or policy overrides in `.ak.user`.

The files use a restricted Git config syntax: UTF-8 (optional BOM), comments, quotes and case-insensitive section/key names. Values preserve case. `ownerFolders` accepts explicit `true` or `false`; `user.id` is an @ identifier. Duplicate or unknown keys, includes/subsections, malformed files and read failures are errors. Only missing files/keys fall through. The two files are not merged.

- Default placement policy: current repo `.ak.config` → explicitly connected workspace `.ak.config` → false. A repo false overrides workspace true. Home users, existing @ folders and headcount never activate it.
- Actor, only when needed: original repo `.ak.user` → connected workspace `.ak.user` → OS-home `.ak.user`. Missing everywhere asks for a user only for that user-dependent operation. OS/Git author names and folder names are not identities.
- A true policy with a valid actor places new work in current-worktree `docs/@actor/` and records its Owner. False/unset keeps basic placement. Explicit destinations and existing files keep their location when the policy changes.

For an explicitly requested workspace connection, the repository's common Git config holds one absolute `alphaKanban.workspaceRoot` path. This is local to that Git repository, shared by its linked worktrees, and not committed. Write it to the exact common config file rather than global/include/worktree config. The read-only tool never creates this connection. A missing connection skips workspace settings; a broken connection reports an error when that fallback is needed. Browser folder registrations are independent.

Linked worktrees use their **current** `.ak.config`, but inherit the verified main worktree's `.ak.user` and common workspace connection. A `.ak.user` placed in the linked worktree is not the original repo user. Branch, detached HEAD, a temporary parent folder and same-remote clones do not change that source. Restore a missing/inaccessible main connection explicitly; bare or unverifiable separate-git-dir origins cannot inherit a private user. Explicit document targets and existing edits remain available without that lookup. Never substitute the home user for an unverified main; a valid main with a missing user file can fall through normally. Only the current project is a document destination.

## Owner header and boundaries

```markdown
# Search plan

Owner: @alice
작성일: 2026-11-01

## Goal
```

The metadata header is the run of single-line `Field: value` entries and blank lines immediately after the document's H1 title. Prose, lists, code or the next heading end it. Read only the exact `Owner:` field there; duplicate, empty, quoted, invalid or differently cased Owner fields are errors. Body/quote/code examples and foreign front matter are not this field. `check-new` compares the header to the target folder and preserves every byte.

Only direct `docs/@name/` directories own their descendants. `docs/research/@name` is unassigned; `docs/@alice/archive/@bob` remains @alice. Identifiers start with @ and a Unicode letter/number, followed by letters/numbers/combining marks, dots, underscores or hyphens; no trailing dot, whitespace, path separators or control characters, maximum 240 UTF-8 bytes. Compare Unicode NFC, preserve existing spelling, and report case/Unicode collisions rather than choosing a different owner. Unsafe symbolic-link/nested-repo targets or incomplete numbering scans are reported, not followed or guessed.

Owner records the last confirmed document owner; it is not the actor, original author, current path, UUID or permission. An existing @ document with no Owner or a different Owner is a reconciliation candidate. Ordinary editing preserves it; this tool does not migrate existing documents, move files or rewrite links. Ordinary documents without Owner remain valid. Other people's context, unfinished tickets and recorded instructions do not authorize execution or handoff; use the current user request and latest relevant directions.
