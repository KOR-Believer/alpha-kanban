# Ledger Format

## Renderer Contract

- Ticket documents contain exactly one `## Status` and one `## Ticket List`. Every `### PREFIX-00. Title` belongs inside `Ticket List`; the prefix is alphanumeric. Another `##` ends that section.
- Place the document-level `## 확인·결정이 필요한 사항` between `Status` and `Ticket List`, never between individual tickets. Keep this section (or its existing equivalent) when its questions are resolved, replacing the pending items with `- 없음` after review.
- Preserve every field and its order in [tickets-template.md](../assets/tickets-template.md). Keep block labels on their own lines. Use `없음` for empty dependencies/exclusions and `기준 문서: 없음` when no plan is needed. Name the repository or workspace-relative package; never use `.` as its identity.
- `현재 진행률` inside `Status` counts `DONE / all tickets`, including deferred tickets. Do not add a duplicate progress board, status glossary, or embedded ticket template.
- Ticket detail displays recognized fields as plain text. Put consequential information there: custom fields and extra Status properties may be invisible. Use short, flat bullets; do not rely on Markdown links, emphasis, tables, or nested lists rendering inside ticket detail.
- Each log entry is one physical line: `- YYYY-MM-DD: text`. Continuation lines are not rendered as log entries. Split distinct updates into dated bullets; same-day order follows document order.

Check existing structure before adding tickets. Preserve incompatible legacy prose and create a compatible file for new work. Migrate only within user-requested restructuring scope.

## Content and History

Use the user's language and retain parser field names. Prefer a short sentence or a few bullets per field. Goals describe outcomes; scope describes planned behavior with only useful evidence locators. Acceptance criteria describe observable results; verification describes how those results will be checked. Label assumptions and unverified claims.

Leave `사용자 지시` empty until a durable user direction exists. Keep current fields authoritative; when direction changes, update affected fields and append the decision once. Resolve user answers in the plan and affected goal, scope, acceptance, or verification fields, not only in a log; remove resolved pending questions. Preserve dated history rather than silently replacing earlier instructions or outcomes. Record consequential unanswered user-context questions or choices, their current assumptions, and affected scope in `진행 메모` when relevant to that ticket; routine questions need no durable entry.

Example progress note:

```md
- 2026-09-07: 중복 요청에서도 결제가 한 번만 발생하도록 처리했다. 동시 요청 검증은 통과했다. 결제사 테스트 환경 확인은 남아 있다.
```

Keep detailed evidence in an existing artifact or an inventory when warranted. Tickets can use concise source paths; plan/inventory Markdown can carry tables and clickable links.

## User Direction Records

Alpha Kanban writes ordinary dated records to `사용자 지시` without running an AI. Read the selected ticket's current fields and latest relevant directions together; do not replay every historical record as a new command.

```md
- 2026-10-16: DONE -> TODO 사용자가 명시적으로 할 일로 변경했습니다.
- 2026-10-16: DONE -> TODO 사용자 사유: 저장 후 값이 사라지는 버그 발견.
- 2026-10-16: IN_PROGRESS 진행률 50% -> 75% 사용자가 명시적으로 진행률을 변경했습니다.
- 2026-10-16: [수동지시] 자동 저장은 이번 범위에서 제외한다.
```

- State and progress changes record the user's action, not agent implementation or verification. A user-applied DONE does not prove checks passed; report missing evidence rather than inventing checked items or silently undoing the user's status just to satisfy validation.
- Reopening makes prior completion subject to reassessment during authorized work. Preserve old checklists and notes as history; update affected current fields and checks when findings warrant it, not by resetting all evidence.
- `[수동지시]` is user-authored free text and does not itself change status. Untagged entries and older `[재오픈]`, `[상태 변경]`, and typed records remain valid history; do not migrate them merely to match the new form.
- These records do not start or authorize implementation by themselves. Apply relevant directions within the current task, without duplicating them, and append agent findings to `진행 메모`.

## Status and Completion

| Status | Progress | Meaning |
| --- | --- | --- |
| TODO | 0% | Scope or approach needs definition. |
| READY | 25% | Scope, decisions, and edit points permit execution. |
| IN_PROGRESS | 50%, 75% | Work is underway; at 75%, the main change exists with required checks or finishing work remaining. |
| BLOCKED | 0%, 25%, 50%, 75% | A named dependency or decision prevents the next required action. |
| DEFERRED | 0%, 25%, 50%, 75% | Work is deliberately postponed. |
| DONE | 100% | The agreed outcome and required checks are complete. |

Progress denotes lifecycle stages, not effort or percentage of code written. The template starts at `TODO / 0%`; promote it only when evidence supports readiness. For blocked/deferred work, retain the last evidenced progress and record the reason and next action.

When the agent marks a ticket `DONE`:

- Both `완료 기준` and `검증` have at least one applicable checkbox, with all required items checked. A document-only task can use a concrete content review. Use plain `N/A: reason` for inapplicable categories alongside actual checks; never check an unperformed test.
- `진행 메모` states the result and verification evidence. Required checks that remain unavailable keep the ticket open. User review or deployment gates completion only when the task requires them.
- Set `Progress: 100%` and add `Completed at: YYYY-MM-DDTHH:mm:ss+HH:MM` immediately after it, using the actual completion time and local offset. Remove the timestamp when reopening and recalculate the top-level count.

`--legacy` accommodates established progress/completion conventions and a missing user-instructions field. It does not accept arbitrary Markdown or establish completion.

## Scoped Editing

When a repository provides `pnpm ticket-md`, prefer its `show <file> <id>` before canonical mutations and use `status`, `append-user`, and `append-note` for supported changes. Consult `--help` for arguments. The helper updates the completion count; prose and checkboxes still need scoped edits. Inspect its before/after ranges and re-read the changed ticket.

Outside such a repository, the same optional helper is available as `node <skill-directory>/scripts/ticket-md.mjs` when Node is available. For unsupported edits or environments, use targeted search and patch only the inspected ticket range. Do not bypass an ambiguous target or reported validation failure by editing a guessed range.

Validate the edited file with the skill's strict checker after related edits; helper success alone is insufficient. Report existing evidence gaps without fabricating completion or broadening an unrelated ticket's scope to make validation pass.
