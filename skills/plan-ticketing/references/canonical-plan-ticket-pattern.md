# Canonical Plan/Ticket Pattern

This file is the structural source of truth for plan/ticket documents. Existing project documents may contain useful examples and current facts, but they are not the canonical format.

## Document Pair

For cross-repo or multi-module implementation work, create or update two Markdown files in the most specific existing docs directory for the target domain:

```text
docs/{domain_or_feature}/{NN}_{slug}_plan.md
docs/{domain_or_feature}/{NN+1}_{slug}_tickets.md
```

Use adjacent numbers when creating a new pair. If the project already has a numbered docs convention, follow that convention.

## Plan Canonical Order

```md
# {Feature Name} 구현 계획 초안

작성일: YYYY-MM-DD
수정일: YYYY-MM-DD

## 영향 범위
## 목표
## 비목표
## 현재 상태 요약
## 제안 아키텍처
## 보안/운영 원칙
## 에러 정책
## 검증 계획
## Open Questions
```

Rules:

- Use "영향 범위" to name target repositories and reference repositories separately.
- "현재 상태 요약" must contain code-observed facts, not assumptions.
- "제안 아키텍처" must include selected approach and key flow.
- "비목표" must record explicitly rejected or deferred work.
- "Open Questions" must be short and actionable.

## Ticket Canonical Order

```md
# {Feature Name} 티켓

## Status
## 티켓 상태
## Progress 기준
## 운영 원칙
## Ticket Template
## Ticket List
```

The `Status` block must include:

```md
- 작성일: YYYY-MM-DD
- 기준 문서: `path/to/plan.md`
- 목적: ...
- 범위: `repo-a`, `repo-b`
- 현재 진행률: `N / M tickets`
```

## Ticket Canonical Fields

Each ticket must use this field order:

```md
### PREFIX-00. Ticket Title

Status: READY
Progress: 25%
Repository:

- `{{repo_or_package_path}}`

Priority: P0
Type: Feature / API / UX / Test / Policy / Security
Depends on:

- `PREFIX-00`

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

- YYYY-MM-DD: 초안 작성.
```

`Completed at` is meaningful only when `Status: DONE`. Place it immediately after `Progress`; omit it for non-DONE tickets and ignore stale values on non-DONE legacy tickets.
`사용자 지시` is optional in existing documents for backwards compatibility. In new tickets, place it after `검증` and before `진행 메모`.
Use it for user-provided direction, priority, constraints, and preferences from chat or UI.
Use `진행 메모` for agent-authored work logs, verification results, and remaining risks.
Treat both fields as append-only logs by default; edit existing entries only for obvious typo fixes or explicit user requests.
Use `YYYY-MM-DD` dates by default. For multiple entries on the same date, document order is the timeline.

## Status And Progress

- `TODO` + `0%`: ticket exists but work has not started.
- `READY` + `25%`: policy and implementation points are known.
- `IN_PROGRESS` + `50%`: core implementation exists, local verification remains.
- `IN_PROGRESS` + `75%`: local verification exists, cross-repo/manual verification remains.
- `DONE` + `100%`: implementation, verification, and notes are complete.
- `BLOCKED`: waiting on policy, schema, infra, upstream, or user decision.
- `DEFERRED`: intentionally out of current delivery.

Do not mark `DONE` unless the "완료 기준", "검증", and "진행 메모" reflect what actually happened.
When marking `DONE`, add `Completed at: YYYY-MM-DDTHH:mm:ss+09:00` if absent and preserve it if already present. Remove `Completed at` when reopening a ticket to a non-DONE status; if a legacy non-DONE ticket still has the field, do not treat it as completion metadata.

## Ticket Prefix

- If the user named a prefix, use it.
- If not, choose a tentative 3-letter prefix from the domain.
- Do not claim the prefix is final until the user accepts it.
- Keep renaming easy by using the prefix consistently.

## Progress Accounting

- Top-level `현재 진행률` counts tickets with `Status: DONE`.
- Update the top-level count and ticket body together.
- Treat legacy `Progress Board` sections as non-canonical summaries. Do not create them in new documents, and do not rely on them as the source of truth.
- If implementation starts immediately after ticketing, update the ticket before or after the code change so context compaction does not lose state.

## Scope Splitting

Split tickets when any of these boundaries differ:

- repository or package
- backend vs frontend
- policy/design vs implementation
- implementation vs verification
- security/permission boundary

Avoid splitting one UI button into multiple tickets unless it crosses a permission, data, or repository boundary.
