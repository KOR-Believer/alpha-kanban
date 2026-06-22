# Sample 티켓

## Status

- 작성일: 2026-06-22
- 기준 문서: `examples/sample_plan.md`
- 목적: Alpha Kanban parser/API/UI smoke fixture
- 범위: `examples`
- 현재 진행률: `0 / 2 tickets`

## 티켓 상태

- `TODO`: 아직 시작하지 않음
- `READY`: 정책/선행 조건이 충분해 바로 구현 가능
- `IN_PROGRESS`: 현재 구현 또는 검증 중
- `BLOCKED`: 정책, schema, infra, upstream 확인 필요
- `DONE`: 구현 및 검증 완료
- `DEFERRED`: 의도적으로 후순위 보류

## Progress 기준

- `0%`: 시작 전
- `25%`: 구현 범위 확정
- `50%`: 핵심 구현 중
- `75%`: 검증 중
- `100%`: 구현 및 검증 완료

## 운영 원칙

- `사용자 지시`와 `진행 메모`는 append-only log로 다룬다.
- 상태 변경 시 Progress Board와 개별 ticket body를 함께 갱신한다.

## Ticket Template

```md
### SMP-00. 제목

Status: TODO
Progress: 0%
Repository:

- `examples`

Priority: P1
Type: Example
Depends on:

- 없음

목표:

- 목표를 적는다.

현재 문제:

- 현재 문제를 적는다.

구현 범위:

- 구현 범위를 적는다.

제외 범위:

- 제외 범위를 적는다.

완료 기준:

- [ ] 완료 기준을 적는다.

검증:

- [ ] 검증 기준을 적는다.

사용자 지시:

- 2026-06-22: 사용자 지시 예시.

진행 메모:

- 2026-06-22: 진행 메모 예시.
```

## Progress Board

| Ticket | Status | Progress | Repository | Depends on |
| --- | --- | ---: | --- | --- |
| SMP-01 | READY | 25% | `examples` | - |
| SMP-02 | TODO | 0% | `examples` | SMP-01 |

## Ticket List

### SMP-01. 샘플 보드 렌더링 확인

Status: READY
Progress: 25%
Repository:

- `examples`

Priority: P1
Type: Example
Depends on:

- 없음

목표:

- Alpha Kanban이 작은 ticket 문서를 목록과 보드로 렌더링하는지 확인한다.

현재 문제:

- 실제 프로젝트 문서는 커서 테스트에 너무 크거나 변경 중일 수 있다.

구현 범위:

- file browser에서 `sample_tickets.md`를 선택한다.
- READY 컬럼에 이 ticket이 보이는지 확인한다.

제외 범위:

- Codex runner 실제 실행

완료 기준:

- [ ] READY 컬럼에 `SMP-01` 카드가 표시된다.

검증:

- [ ] Playwright smoke

사용자 지시:

- 2026-06-22: 샘플 문서는 작고 안정적인 fixture로 유지한다.

진행 메모:

- 2026-06-22: 초안 작성.

### SMP-02. 샘플 상세 편집 확인

Status: TODO
Progress: 0%
Repository:

- `examples`

Priority: P2
Type: Example
Depends on:

- `SMP-01`

목표:

- detail drawer에서 status/progress 변경과 사용자 지시 append를 재현한다.

현재 문제:

- 실제 프로젝트 티켓을 수정하지 않고 편집 flow를 확인할 fixture가 필요하다.

구현 범위:

- `SMP-02` 상세를 연다.
- status를 `IN_PROGRESS`, progress를 `50%`로 바꾼다.
- 사용자 지시를 append한다.

제외 범위:

- 장기 운영 문서 역할

완료 기준:

- [ ] Markdown 원문에 status/progress 변경이 반영된다.
- [ ] `사용자 지시`에 새 항목이 추가된다.

검증:

- [ ] API integration smoke
- [ ] UI smoke

사용자 지시:

- 2026-06-22: 편집 flow 검증에 사용한다.
- 2026-06-22: 샘플 티켓 있네 이거 동작하는거냐?

진행 메모:

- 2026-06-22: 초안 작성.
