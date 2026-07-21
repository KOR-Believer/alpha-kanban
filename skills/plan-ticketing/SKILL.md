---
name: plan-ticketing
description: Use when creating or updating implementation plan, ticket, and inventory documents, especially requests like "plan 문서", "ticket화", "티켓 단위로 쪼개", "인벤토리", "진행률 문서", "같은 템플릿으로 작성", or when preserving implementation context for future Codex work.
---

# Plan Ticketing

Use this skill to turn an implementation discussion into durable plan, ticket, and inventory Markdown documents.

## Core Rule

Answer the user's current question first, then update documents. Do not hide decisions inside a document update when the user is asking for a conclusion.

## Workflow

1. Identify affected repositories, packages, or project areas explicitly.
2. Inspect existing plan/ticket documents before writing.
   - Prefer the most specific existing docs directory for the target domain.
   - Treat project documents as current-state examples, not the structural source of truth.
   - Use `references/canonical-plan-ticket-pattern.md` as the canonical structure.
3. Decide whether the user wants:
   - a plan only,
   - tickets only,
   - an inventory only,
   - both plan and tickets,
   - plan/tickets plus an inventory,
   - or an update to an existing plan/ticket.
4. For a new cross-repo or multi-module feature, create two adjacent documents:
   - `{NN}_{slug}_plan.md`
   - `{NN+1}_{slug}_tickets.md`
   If the work also needs durable investigation state, create an inventory as the next adjacent document:
   - `{NN+2}_{slug}_inventory.md`
5. Use a short ticket prefix. If the user has not named one, choose a tentative 3-letter prefix from the domain and make it easy to rename later.
6. Keep implementation code changes out of the document commit unless the user asks to implement.
7. If implementation follows, update ticket progress as work completes.

## Ticket Markdown Helper

For existing ticket documents, prefer the deterministic `ticket-md` helper before manually editing canonical ticket fields. It is bundled with this skill at `scripts/ticket-md.mjs`.

Use the first available command form:

1. Inside a repository that exposes a package script:
   - `pnpm ticket-md <command> ...`
2. From an installed skill directory:
   - `node ~/.codex/skills/plan-ticketing/scripts/ticket-md.mjs <command> ...`
3. From a checked-out skill directory:
   - `node <path-to-skill>/scripts/ticket-md.mjs <command> ...`

Common commands:

- Inspect a ticket before changing it:
  - `ticket-md show <file> <ticket-id>`
- Change canonical ticket state:
  - `ticket-md status <file> <ticket-id> --status DONE --progress 100`
- Append user instructions:
  - `ticket-md append-user <file> <ticket-id> "<text>"`
- Append agent progress notes:
  - `ticket-md append-note <file> <ticket-id> "<text>"`
- Validate after edits:
  - `ticket-md check <file>`

Use `ticket-md` for status, progress, `Completed at`, `사용자 지시`, and `진행 메모` whenever possible. The helper locates a unique ticket heading, limits writes to that ticket body, and recalculates top-level `현재 진행률`.

Manual Markdown edits are still acceptable for new document creation, non-canonical prose, and checkbox changes, but first inspect the ticket range with `ticket-md show`, keep the patch inside that range, and run `ticket-md check` afterward.

## Plan Document Shape

Use `assets/plan-template.md` as the starting shape. Keep these sections unless there is a strong reason to omit one:

- Title
- 작성일 / 수정일
- 영향 범위
- 목표
- 비목표
- 현재 상태 요약
- 제안 아키텍처 or 구현 방향
- 보안/운영 원칙
- 에러 정책 when relevant
- 검증 계획
- Open Questions

The plan must preserve the reasoning needed after context compaction: current behavior, selected approach, rejected alternatives, and risky assumptions.

For the canonical field order and wording expectations, read `references/canonical-plan-ticket-pattern.md`.

## Inventory Document Shape

Use `assets/inventory-template.md` as the starting shape when the work needs long-lived investigation memory, such as:

- code path inventories,
- schema/table/field inventories,
- route or SQL pair decisions,
- policy-to-code alignment matrices,
- bug-suspect registers,
- read/write path maps,
- baseline-vs-staged caveats.

Inventory documents are not implementation plans and should not pretend to be complete tickets. They preserve observed facts, classifications, evidence, and immediate conclusions so future sessions do not need to repeat exploration.

Include these sections unless there is a strong reason to omit one:

- Title
- 작성일 / 수정일
- 영향 범위 or Scope
- 연결 문서 / 연결 티켓 when relevant
- 목적
- 조사 기준
- 분류 기준 when relevant
- 결론 요약 or Executive Summary
- Matrix / Register / Repository details as appropriate
- Immediate Conclusions

For canonical order, naming, and examples to inspect, read `references/canonical-inventory-pattern.md`.

## Ticket Document Shape

Use `assets/tickets-template.md` as the starting shape. Include:

- Status block
- 티켓 상태 glossary
- Progress 기준
- 운영 원칙
- Ticket Template
- Ticket List

Each ticket must include:

- Status
- Progress
- Completed at when `Status: DONE`
- Repository
- Priority
- Type
- Depends on
- 목표
- 현재 문제
- 구현 범위
- 제외 범위
- 완료 기준
- 검증
- 사용자 지시 (optional for existing documents)
- 진행 메모

For the canonical field order and progress accounting rules, read `references/canonical-plan-ticket-pattern.md`.

## Progress Defaults

- Analysis/policy ticket: `DONE`, `100%` if investigation and decisions are already complete.
- Implementation ticket with known edit points: `READY`, `25%`.
- Implementation ticket in active work: `IN_PROGRESS`, normally `50%` after core implementation.
- Verification ticket before implementation: `TODO`, `0%`.
- Completed implementation with verification and notes: `DONE`, `100%`.

Update the individual ticket body and the top-level `현재 진행률` together. The top-level count must match the number of tickets whose body has `Status: DONE`.
When marking a ticket `DONE`, add `Completed at: YYYY-MM-DDTHH:mm:ss+09:00` immediately after `Progress` if it is absent, preserving an existing value if present. Treat `Completed at` as meaningful only when `Status: DONE`; remove it when reopening a ticket from `DONE` to any non-DONE status.

## Project Conventions

- State repositories, packages, or modules by workspace-relative path, such as `apps/...`, `packages/...`, or the project-specific path convention already in use.
- Do not treat a workspace root as the execution context for nested independent repositories unless the task explicitly targets workspace metadata.
- Use root or shared docs for cross-repo and multi-module design/context preservation.
- Use nested repo/module docs only when the task belongs to one nested area.
- Use inventory documents for durable investigation memory that should survive context compaction but is too detailed or evidence-heavy for plan/ticket docs.
- Keep ticket dependencies repo-aware or module-aware.
- Include exact route names, table names, helper names, and file paths when known.
- Record user-provided direction, priority, constraints, and preferences in `사용자 지시`, not `진행 메모`.
- Use `진행 메모` for agent-authored work logs, verification results, and remaining risks.
- Treat `사용자 지시` and `진행 메모` as append-only logs by default. Edit existing entries only for obvious typo fixes or when the user explicitly asks.
- Use `YYYY-MM-DD` dates by default. For multiple entries on the same date, document order is the timeline; add time only when the user requests it or audit/operations require exact timing.
- If a user instruction changes goals, scope, exclusions, or acceptance criteria, append it to `사용자 지시` and update the affected canonical field too.

## Quality Bar

- Be concrete enough that another Codex session can continue implementation from the document.
- Do not overfit a ticket to a single button unless the permission boundary or repository boundary justifies it.
- Separate policy/design, backend API, frontend UI, and verification when they involve different repos or review concerns.
- Keep open questions short and actionable.
- Do not mark tickets complete unless implementation and verification notes are present.
