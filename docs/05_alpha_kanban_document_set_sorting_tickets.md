# Alpha Kanban Document Set Sorting 티켓

> 2026-10-18 적용 상태: 정렬 기능 자체는 폐기하지 않는다. AKS-01의 완료 이력은 보존하고, 브라우저 데이터·설정에서의 정렬 유지 검증은 AKL-01/03/06에서 추적한다. 별도의 서버 구현을 복원하지 않는다.

## Status

- 작성일: 2026-06-24
- 기준 문서: `docs/03_alpha_kanban_multi_workspace_plan.md`
- 목적: Alpha Kanban의 document set 목록 정렬을 파일 단위가 아니라 slug 묶음 단위로 안정화하고, 사용자가 작업 맥락에 맞는 정렬 기준을 선택할 수 있게 한다.
- 범위: `alpha-kanban`
- 현재 진행률: `1 / 1 tickets`

## 티켓 상태

- `TODO`: 아직 시작하지 않음
- `READY`: 정책/선행 조건이 충분해 바로 구현 가능
- `IN_PROGRESS`: 현재 구현 또는 검증 중
- `BLOCKED`: 정책, schema, infra, upstream 확인 필요
- `DONE`: 구현 및 검증 완료
- `DEFERRED`: 의도적으로 후순위 보류

## Progress 기준

- `0%`: 티켓 초안만 있음
- `25%`: 영향 범위와 구현 지점 확인 완료
- `50%`: 핵심 구현 완료, local 단위 검증 전
- `75%`: 단위 검증 완료, cross-module/manual 검증 전
- `100%`: 구현, 검증, 문서/운영 메모 완료

## 운영 원칙

- 문서 목록의 기본 정렬은 document set 단위로 처리한다.
- 같은 slug로 묶인 plan/tickets/inventory 문서는 정렬 변경 시 흩어지지 않고 함께 움직인다.
- set 내부 정렬은 사용자가 관계를 읽기 쉽도록 `Plan -> Tickets -> Inventory -> Markdown` 순서를 기본으로 한다.
- `Recently updated`는 파일 시스템 `mtimeMs` 기준이며, set 안 문서들의 `max(mtimeMs)`를 사용한다.
- `Document order` 오름차순은 set 안 문서들의 `min(sequenceNumber)`를 사용한다.
- `Document order` 내림차순은 set 안 문서들의 `max(sequenceNumber)`를 사용한다.
- 순수 파일 생성 순서를 보고 싶은 요구는 grouped sorting과 분리해 `Flat document order` 같은 별도 모드로 검토한다.
- 정렬 preference는 workspace별 local state에 저장하는 방향을 우선한다.

## Ticket Template

```md
### AKS-000. Ticket Title

Status: READY
Progress: 25%
Repository:

- `alpha-kanban`

Priority: P1
Type: UX / Frontend
Depends on:

- `AKS-000`

목표:

- 이 티켓이 끝났을 때 달라져야 하는 상태를 적는다.

현재 문제:

- 지금 없는 것, 위험한 것, 결정되지 않은 것을 적는다.

구현 범위:

- 실제로 수정할 API, route, model, helper, component를 적는다.

제외 범위:

- 이번 티켓에서 하지 않을 일을 적는다.

완료 기준:

- [ ] 기능 관점의 완료 조건
- [ ] 회귀 방지 조건

검증:

- [ ] unit/API test
- [ ] browser smoke

사용자 지시:

- 2026-06-24: 사용자 요청 또는 작업 방향을 기록한다.

진행 메모:

- 2026-06-24: 초안 작성.
```

## Ticket List

### AKS-01. Document set grouped sorting과 정렬 컨트롤 구현

Status: DONE
Progress: 100%
Completed at: 2026-06-24T14:22:32+09:00
Repository:

- `apps/web`
- `packages/shared`
- `apps/server`

Priority: P1
Type: UX / Frontend / API
Depends on:

- `AKW-28`

목표:

- 좌측/문서 목록에서 plan/tickets/inventory가 같은 slug 묶음으로 함께 움직이게 한다.
- 기본 정렬은 번호가 작은 문서 묶음이 앞에 오는 `Document order` 오름차순으로 둔다.
- 사용자가 필요한 경우 최근 수정, 타입, 진행률, 이름, 디렉터리 기준으로 document set 목록을 정렬할 수 있게 한다.

현재 문제:

- document set grouping은 존재하지만 정렬 정책이 명확히 UI에 드러나지 않는다.
- 파일 단위 정렬을 그대로 적용하면 같은 slug의 plan/tickets/inventory가 흩어질 수 있다.
- `Recently updated`의 의미가 file mtime인지, ticket 진행 메모인지, run 시각인지 분명하지 않으면 사용자가 기대와 다른 목록 이동을 볼 수 있다.
- `1_A_plan`, `2_A_tickets`, `3_B_plan`, `4_B_tickets`, `5_A_inventory`처럼 inventory가 나중에 생긴 경우 set 단위 내림차순 기준을 정하지 않으면 결과가 모호하다.

구현 범위:

- document set 목록 정렬 모델을 정의한다.
- 기본 정렬은 `Document order` 오름차순으로 둔다.
- 정렬 옵션을 문서 목록 header의 menu/select로 제공한다.
- 지원 정렬 후보:
  - `Document order`: set sequence 기준
  - `Recently updated`: set 안 문서들의 `max(mtimeMs)` 기준
  - `Type`: tickets/plan/inventory/markdown 우선순위 또는 primary type 기준
  - `Progress`: tickets 문서의 `done / total` 기준
  - `Name`: set slug/title 기준
  - `Directory`: directory + slug 기준
- set 간 `Document order` 오름차순은 `min(sequenceNumber)`, 내림차순은 `max(sequenceNumber)`를 사용한다.
- set 내부 문서 표시는 `Plan -> Tickets -> Inventory -> Markdown` 순서를 기본으로 유지한다.
- 같은 type이 한 set 안에 여러 개 있으면 그때만 `sequenceNumber`로 정렬한다.
- workspace별 정렬 preference를 local state에 저장한다.
- 정렬 label과 tooltip을 명확히 한다. 예: `Recently updated` tooltip은 `Sort by file modified time`.

제외 범위:

- document set 관계 추론 알고리즘 자체의 대규모 변경
- ticket 진행 메모/사용자 지시 마지막 날짜 기반 정렬
- git commit 시간 기반 정렬
- run log 최신 실행 시간 기반 정렬
- flat file order 모드 구현

완료 기준:

- [x] 기본 문서 목록이 `Document order` 오름차순으로 정렬된다.
- [x] 같은 slug의 plan/tickets/inventory가 정렬 변경 시 한 묶음으로 움직인다.
- [x] `Recently updated`가 set 안 문서들의 `max(mtimeMs)` 기준으로 동작한다.
- [x] 숫자 내림차순 정렬은 set 간 `max(sequenceNumber)` 기준을 사용하고, set 내부는 type 순서를 유지한다.
- [x] 정렬 옵션 변경이 workspace별로 유지된다.
- [x] 빈 sequence/type/progress 값이 있어도 안정적인 fallback 정렬을 한다.

검증:

- [x] document set sort helper unit test
- [x] sequence edge case test: `1_A_plan`, `2_A_tickets`, `3_B_plan`, `4_B_tickets`, `5_A_inventory`
- [x] mtime 기반 recently updated test
- [x] Chrome desktop smoke

사용자 지시:

- 2026-06-24: 칸반 좌측 문서 목록은 기본적으로 숫자가 작은 문서가 앞에 오도록 정렬되면 좋다.
- 2026-06-24: 정렬 버튼으로는 Recently updated, Type, Progress, Name, Directory 같은 기준이 가능해 보인다.
- 2026-06-24: Recently updated는 파일 시스템 `mtimeMs` 기준으로 보면 된다.
- 2026-06-24: slug 단위로 묶었다면 정렬 변경 시 묶음이 같이 움직여야 한다.
- 2026-06-24: `1_A플랜`, `2_A티켓`, `3_B플랜`, `4_B티켓`, `5_A인벤토리` 케이스에서 숫자 내림차순은 set 간 `max(sequenceNumber)`를 기준으로 하고 set 내부는 type 순서를 유지하는 정책이 좋다.
- 2026-06-24: 기존 multi-workspace 티켓 문서가 무겁고 연관성이 낮으면 새 티켓 파일로 분리해도 좋다.

진행 메모:

- 2026-06-24: 초안 작성. 기존 `04_alpha_kanban_multi_workspace_tickets.md`가 이미 무거우므로 document set 정렬 후속 UX는 별도 티켓 문서로 분리했다.
- 2026-06-24: `apps/web/src/documentSetSorting.ts`에 document set 정렬 모델을 분리하고, `Document order`, `Recently updated`, `Type`, `Progress`, `Name`, `Directory` 정렬을 구현했다. set 내부 문서는 `Plan -> Tickets -> Inventory -> Markdown` 순서를 유지한다.
- 2026-06-24: `apps/web/src/App.tsx`의 Documents 헤더에 Radix/shadcn 기반 sort select와 방향 토글을 추가하고, workspace별 정렬 preference를 `localStorage`에 저장하도록 연결했다.
- 2026-06-24: `pnpm --filter @alpha-kanban/web test -- documentSetSorting`, `pnpm --filter @alpha-kanban/web typecheck`, `pnpm --filter @alpha-kanban/web build`를 통과했다. Chrome smoke에서 `Document order` 기본 표시, `Recently updated` 선택 후 reload 유지, 기본값 복구를 확인했다.
