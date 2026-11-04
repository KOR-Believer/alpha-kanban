# Reading journal

A fictional project used in the introduction and README. Statuses and work records illustrate the workflow; they are not real implementation results.

## Status

- 작성일: 2026-10-18
- 기준 문서: [Reading journal plan](01_reading_plan.md)
- 목적: Illustrate how to review plans and tickets.
- 범위: reading-journal
- 현재 진행률: `1 / 4 tickets`

## 확인·결정이 필요한 사항

- 없음

## Ticket List

### READ-01. Define book record fields

Status: DONE
Progress: 100%
Completed at: 2026-10-18T10:00:00+09:00

Repository:

- reading-journal

Priority: P1
Type: Feature
Depends on:

- 없음

목표:

- Define book record fields

현재 문제:

- Reviewed · Fields matched to sample

구현 범위:

- Record title, author, and reading status.

제외 범위:

- Features outside this ticket’s scope

완료 기준:

- [x] Required book record fields are defined.

검증:

- [x] Compared the sample record with required fields.

사용자 지시:

- 2026-10-18: Start with title, author, and reading status.

진행 메모:

- 2026-10-18: Defined the fields and compared them with the sample record. Completed the agreed document review.

### READ-02. Read-books filter and title search

Status: IN_PROGRESS
Progress: 75%

Repository:

- reading-journal

Priority: P1
Type: Feature
Depends on:

- READ-01

목표:

- Read-books filter and title search

현재 문제:

- Layout revised · Mobile check pending

구현 범위:

- Combine both conditions and show an empty state. Do not persist the filter across visits.

제외 범위:

- Features outside this ticket’s scope

완료 기준:

- [x] Title search and read-books filtering work together.
- [ ] Place the filter below the search field on narrow screens.

검증:

- [x] Ran combined-filter and empty-result tests.
- [ ] Check title and button layout at 390px.

사용자 지시:

- 2026-10-18: The plan’s questions were discussed: keep filters for this visit and exclude note search. The user reviewed these decisions in the updated plan and tickets before requesting implementation. On reviewing the result, they asked to move the filter below search on phones.

진행 메모:

- 2026-10-18: Implemented the agreed filter, search, and empty state; combined-filter and empty-result tests passed. Added the later feedback to this ticket’s acceptance criteria. Mobile layout was adjusted; device rechecking remains; keep IN_PROGRESS at 75%.

### READ-03. Edit and delete book records

Status: TODO
Progress: 0%

Repository:

- reading-journal

Priority: P1
Type: Feature
Depends on:

- READ-01

목표:

- Edit and delete book records

현재 문제:

- Agreed feature · Awaiting implementation

구현 범위:

- Edit title, author, and reading status; confirm before deleting a record.

제외 범위:

- Features outside this ticket’s scope

완료 기준:

- [ ] Changes are saved and deletion requires confirmation.

검증:

- [ ] Verify saving edits and confirming or canceling deletion.

사용자 지시:

- 2026-10-18: Allow editing book records and ask before deleting them.

진행 메모:

- 2026-10-18: Scope is agreed in the plan. Implementation and verification are pending.

### READ-04. Add book sorting controls

Status: READY
Progress: 25%

Repository:

- reading-journal

Priority: P1
Type: Feature
Depends on:

- READ-01

목표:

- Add book sorting controls

현재 문제:

- Scope agreed · Title / recently recorded

구현 범위:

- Choose title or recently recorded order. Preserve active filters.

제외 범위:

- Features outside this ticket’s scope

완료 기준:

- [ ] Changing sort preserves search and filters.

검증:

- [ ] Check both sort orders with filtering.

사용자 지시:

- 2026-10-18: Use recently recorded order by default.

진행 메모:

- 2026-10-18: Agreed on scope and default order. Implementation and completion checks have not started.

