# {{Title}} 티켓

## Status

- 작성일: {{YYYY-MM-DD}}
- 기준 문서: `{{plan_path}}`
- 목적: {{purpose}}
- 범위: {{scope_repos}}
- 현재 진행률: `{{done_count}} / {{total_count}} tickets`

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
- `75%`: 단위 검증 완료, cross-repo 통합 검증 전
- `100%`: 구현, 검증, 문서/운영 메모 완료

## 운영 원칙

- 모든 독립 repository/package는 해당 실행 컨텍스트에서 작업한다.
- cross-repo 또는 multi-module 기능이더라도 커밋과 검증은 적절한 단위로 분리한다.
- {{principle}}

## Ticket Template

새 티켓을 추가할 때는 아래 형식을 따른다.

```md
### {{PREFIX}}-000. Ticket Title

Status: IN_PROGRESS
Progress: 20%
Repository:

- `{{repo_or_package_path}}`

Priority: P0
Type: Feature / API / UX / Test / Policy / Security
Depends on:

- `{{PREFIX}}-000`

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
- [ ] manual smoke

사용자 지시:

- {{YYYY-MM-DD}}: 사용자 요청 또는 작업 방향을 기록한다.

진행 메모:

- {{YYYY-MM-DD}}: 초안 작성.
```

## Ticket List

### {{PREFIX}}-00. 정책 확정 및 영향 범위 분석

Status: DONE
Progress: 100%
Completed at: {{YYYY-MM-DDTHH:mm:ss+09:00}}
Repository:

- `{{repo_or_package_path}}`

Priority: P0
Type: Policy / Design
Depends on:

- 없음

목표:

- {{analysis_goal}}

현재 문제:

- {{analysis_problem}}

구현 범위:

- {{analysis_scope}}

제외 범위:

- 실제 API 구현
- 실제 UI 구현

완료 기준:

- [x] {{analysis_done}}

검증:

- [x] 코드 기준으로 구현 지점을 확인한다.
- [x] 기준 문서에 분석 내용을 반영한다.

사용자 지시:

- {{YYYY-MM-DD}}: 사용자 요청 또는 작업 방향을 기록한다.

진행 메모:

- {{YYYY-MM-DD}}: 초안 작성.

### {{PREFIX}}-01. {{Implementation Ticket Title}}

Status: READY
Progress: 25%
Repository:

- `{{repo_or_package_path}}`

Priority: P0
Type: Feature
Depends on:

- `{{PREFIX}}-00`

목표:

- {{implementation_goal}}

현재 문제:

- {{implementation_problem}}

구현 범위:

- {{implementation_scope}}

제외 범위:

- {{implementation_out_of_scope}}

완료 기준:

- [ ] {{implementation_done}}

검증:

- [ ] {{implementation_validation}}

사용자 지시:

- {{YYYY-MM-DD}}: 사용자 요청 또는 작업 방향을 기록한다.

진행 메모:

- {{YYYY-MM-DD}}: 초안 작성.
