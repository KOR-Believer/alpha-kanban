# Implementation Ledger Format

Use this file as the single structural source of truth for documents created by `implementation-ledger`. Every new document must be readable by Alpha Kanban. Existing project documents may remain on their established format and must not be migrated or mixed with this format without explicit approval.

## Alpha Kanban Compatibility Contract

New documents must satisfy all applicable rules:

- Plan filenames end with the exact suffix `_plan.md`.
- Ticket filenames end with the exact suffix `_tickets.md`.
- Inventory filenames end with the exact suffix `_inventory.md`.
- Hyphenated variants such as `-tickets.md` are plain Markdown to Alpha Kanban and are not compatible.
- Ticket documents contain exactly one `## Status` section and one `## Ticket List` section.
- Ticket headings use `### PREFIX-00. Title`, with an alphanumeric prefix and numeric suffix.
- Ticket `Status` values use uppercase canonical values: `TODO`, `READY`, `IN_PROGRESS`, `BLOCKED`, `DEFERRED`, or `DONE`.
- Ticket fields use the order documented below.
- The `## Ticket List` section contains the ticket headings. Do not place phase headings using `##` inside it because the next level-two heading ends the parsed ticket section.
- The top-level `현재 진행률` line appears inside `## Status` and matches the parsed ticket bodies.

Before adding a ticket to an existing file, check these rules. If the file is incompatible, do not append a canonical ticket to it. Preserve the legacy file and create a new compatible ticket document for new work unless the user explicitly requests migration.

## File Naming

Use these exact suffixes. Apply the project's existing directory and numbering convention when possible:

```text
docs/{domain}/{NN}_{slug}_plan.md
docs/{domain}/{NN+1}_{slug}_tickets.md
docs/{domain}/{next_available_number}_{slug}_inventory.md
```

Keep the same slug for related documents. Adjacency is preferred for a new plan and ticket pair, but an inventory may be created before or after them as investigation requires. Never replace the underscore before `plan`, `tickets`, or `inventory` with a hyphen.

## Plan

Required content:

- title and dates
- affected scope
- goal
- code-observed current state
- selected decisions or implementation direction
- validation strategy

Conditional content:

- non-goals and rejected alternatives
- security or operational constraints
- error policy
- risks
- open questions

Omit conditional sections that carry no information. Record why an alternative was rejected when that decision would otherwise be reopened later.

## Inventory

Include:

- purpose and affected scope
- evidence sources such as files, commands, branches, dumps, or policies
- concise conclusion summary
- the matrix, map, or register needed by the investigation
- immediate conclusions or next decisions

Separate observed facts, interpretations, assumptions, and unresolved gaps. Do not use an inventory to claim implementation completion.

## Ticket Document

Use this top-level shape:

```md
# {Title} 티켓

## Status

- 작성일: YYYY-MM-DD
- 기준 문서: `path/to/plan.md` or 없음
- 목적: ...
- 범위: ...
- 현재 진행률: `N / M tickets`

## Ticket List
```

Do not embed a status glossary, progress tutorial, or reusable Ticket Template in every ticket document. Those are format documentation, not project state.

## Ticket Fields

Use this field order for new tickets:

```md
### PREFIX-00. Ticket title

Status: READY
Progress: 25%
Repository:

- `workspace-relative/path`

Priority: P1
Type: Feature
Depends on:

- 없음

목표:

- ...

현재 문제:

- ...

구현 범위:

- ...

제외 범위:

- ...

완료 기준:

- [ ] ...

검증:

- [ ] ...

사용자 지시:

- YYYY-MM-DD: ...

진행 메모:

- YYYY-MM-DD: 티켓 초안 작성.
```

Add `Completed at: YYYY-MM-DDTHH:mm:ss+HH:MM` immediately after `Progress` only for `DONE` tickets. Preserve the actual local offset rather than requiring a specific timezone.

Allowed status and progress relationships:

| Status | Progress |
| --- | --- |
| `TODO` | `0%` |
| `READY` | `25%` |
| `IN_PROGRESS` | `50%`, `75%` |
| `BLOCKED` | `0%`, `25%`, `50%`, `75%` |
| `DEFERRED` | `0%`, `25%`, `50%`, `75%` |
| `DONE` | `100%` |

`READY` means scope, decisions, and edit points are known well enough to execute. Its `25%` represents lifecycle readiness, not implemented code. `IN_PROGRESS` percentages represent implementation and verification evidence.

The top-level numerator is the number of `DONE` tickets. The denominator is every ticket in the document, including `DEFERRED`, unless the project explicitly defines and documents another convention.

## User Direction Records

Alpha Kanban can append these ordinary dated entries to `사용자 지시` without running an AI. Untagged legacy entries remain valid. Read the ticket's current fields and newest relevant direction together; do not replay all historical entries as fresh commands.

```md
- 2026-10-13: DONE -> TODO 사용자가 명시적으로 할 일로 변경했습니다.
- 2026-10-13: DONE -> TODO 사용자 사유: 저장 후 값이 사라지는 버그 발견.
- 2026-10-13: IN_PROGRESS 진행률 50% -> 75% 사용자가 명시적으로 진행률을 변경했습니다.
- 2026-10-13: [수동지시] 자동 저장은 이번 범위에서 제외한다.
```

Status transitions and default phrases describe a user's explicit action, not agent implementation or verification. In particular, a user-applied DONE does not prove checks passed, and a transition away from DONE makes prior completion subject to reassessment. Old checked items and notes are retained as history; reassess affected items during authorized work. `[수동지시]` is user-authored free text and does not itself change status. Older `[재오픈]`, `[상태 변경]`, and typed records remain valid history; do not migrate them merely to match the new form. Investigate within the current request, reconcile confirmed changes into current fields, and append outcomes to `진행 메모` without duplicating the user's record. These entries are not an automatic execution queue.

## Completion Evidence

Mark a ticket `DONE` only when:

- every required `완료 기준` checkbox is checked,
- every required `검증` checkbox is checked,
- `진행 메모` states what changed and what was verified,
- `Progress` is `100%`, and
- `Completed at` is present.

Use `N/A` text instead of a fake checked item when a validation category genuinely does not apply.

## Durable Logs

`사용자 지시` stores only durable user decisions affecting delivery. `진행 메모` stores agent-authored implementation evidence and remaining risk. Neither field is a full chat transcript or process event log.
