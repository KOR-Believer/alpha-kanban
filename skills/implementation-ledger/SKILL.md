---
name: implementation-ledger
description: Create and maintain concise, Alpha Kanban-compatible implementation plan, ticket, and inventory Markdown as durable project memory. Use when the user asks to plan implementation, split work into tickets, preserve investigation evidence, hand work to a future session, or update an existing ticket's durable state. Do not infer permission to write documents from a discussion-only request or migrate legacy documents without explicit approval.
---

# Implementation Ledger

Treat plan, ticket, and inventory Markdown as durable project state, not conversation history.

## Select a Mode

- **Discuss**: Answer, review, compare, or brainstorm without editing ledger documents.
- **Create**: Create or restructure durable artifacts only when explicitly requested.
- **Execute**: Implement selected work and update only state supported by actual work and verification.

When intent is mixed, answer the immediate question first. Invocation alone does not authorize document changes.

## Establish Ground Truth

1. Identify the workspace, repositories, packages, and document scope.
2. Inspect relevant guidance and existing ledger files with targeted search and bounded reads.
3. Separate code-observed facts from inference, policy, and unresolved questions.

Follow coherent local directory, numbering, and prose conventions. For new ledger documents, the Alpha Kanban contract takes precedence.

## Create Durable Artifacts

- Use a **plan** for goals, facts, decisions, rejected alternatives, risks, and validation strategy.
- Use **tickets** for independently executable and reviewable delivery units.
- Use an **inventory** for evidence-heavy facts, matrices, maps, and investigation state that should not be rediscovered.

Before creating an artifact, read `references/ledger-format.md` and use the matching file under `assets/`. Remove placeholders and empty optional sections. Keep one slug across related documents; prefer adjacent numbers when local conventions allow.

Prefer vertical-slice tickets. Split only when ownership, permissions, blockers, rollback, or reviewability require independent work.

## Maintain Existing Work

For a selected ticket, read its latest `사용자 지시` before relying on old completion notes. User-applied state changes and `[수동지시]` records can make earlier completion evidence insufficient; see [user direction records](references/ledger-format.md#user-direction-records). Their presence does not start or authorize a new task by itself.

Read `references/ledger-format.md` before adding a ticket. Patch a compatible document at the exact ticket scope and re-read the changed range. Preserve an incompatible document and create a compatible one for new work; migrate or restructure legacy prose only with explicit approval.

- Record durable user changes to scope, priority, constraints, exclusions, or acceptance criteria in `사용자 지시`.
- Record implementation evidence, verification, remaining risks, and blockers in `진행 메모`.
- Keep questions, retries, run IDs, process events, and raw logs outside the ledger.
- When a directive changes a canonical field, update both the field and its durable log.

For exact status and durable-log mutations, prefer the bundled `scripts/ticket-md.mjs` helper when it is available:

```sh
pnpm ticket-md show <ticket-file> <ticket-id>
pnpm ticket-md status <ticket-file> <ticket-id> --status DONE --progress 100
pnpm ticket-md append-user <ticket-file> <ticket-id> "<durable direction>"
pnpm ticket-md append-note <ticket-file> <ticket-id> "<implementation evidence>"
```

Outside this repository, run the same helper as `node <skill-directory>/scripts/ticket-md.mjs`. It narrows writes to one ticket and recalculates the top-level completion count. Use manual edits for prose and checkboxes only after locating the ticket range, then re-read that range.

## Gate State on Evidence

Follow the status, progress, and completion rules in `references/ledger-format.md`. Use `READY` at `25%` only when scope, decisions, and edit points make execution possible; do not claim implementation progress from familiarity alone. Mark `DONE` only after all acceptance and verification checks pass, a meaningful progress note exists, and `Completed at` records the local RFC 3339 offset. Keep the top-level completed count consistent.

Validate every ticket document created with this skill:

```sh
node <skill-directory>/scripts/check-ledger.mjs <ticket-file>
```

Use `--legacy` only for Alpha Kanban-compatible documents whose established progress semantics differ; it does not make arbitrary Markdown compatible.

## Boundaries

- Do not edit implementation code in Discuss or Create mode unless separately requested.
- Name the repository or workspace-relative package path in durable documents; never use `.` as repository identity.
- Keep each ticket concise enough for a future session to load independently.
