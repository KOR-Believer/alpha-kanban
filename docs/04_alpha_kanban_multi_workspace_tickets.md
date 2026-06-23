# Alpha Kanban Multi Workspace 티켓

## Status

- 작성일: 2026-06-22
- 기준 문서: `docs/03_alpha_kanban_multi_workspace_plan.md`
- 목적: Alpha Kanban이 자기 repository docs에 고정되지 않고 사용자가 선택한 target workspace의 plan-ticketing 문서를 탐색, 수정, 실행하도록 확장한다.
- 범위: `alpha-kanban`
- 현재 진행률: `10 / 15 tickets`

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

- Alpha Kanban repository는 control app이고, 실제 작업 대상은 selected target workspace다.
- `workspaceRoots`는 OS permission이 아니라 앱 내부 allowlist policy다.
- target workspace path는 `realpath` 기준으로 allowlist 내부인지 검증한다.
- recent workspace, last selection, Codex session id는 control app의 `.alpha-kanban/state.json`에만 저장한다.
- target project repository에는 Alpha Kanban local state를 쓰지 않는다.
- Markdown 수정 시 개별 ticket body, `Progress Board`, top-level `현재 진행률`을 함께 갱신한다.
- `사용자 지시`와 `진행 메모`는 append-only log로 다루고, 같은 날짜의 항목 순서는 문서 라인 순서로 해석한다.
- `Run with Codex`는 selected target workspace를 cwd로 사용한다.
- ticket 실행 입력, document-level chat, workspace-level chat은 scope가 다르므로 UI와 prompt boundary를 분리한다.
- 자세한 terminal log는 debug affordance로 유지하고, 제품 UX에는 run status indicator를 우선 제공한다.
- 완료/실패 run 결과는 시간 기반으로 사라지지 않고, 사용자가 명시적으로 읽음 처리할 때까지 unread badge로 유지한다.
- 외부 CLI/editor가 Markdown을 직접 수정할 수 있으므로 UI는 file change 감지, stale 표시, refetch 정책을 가져야 한다.

## Ticket Template

새 티켓을 추가할 때는 아래 형식을 따른다.

```md
### AKW-000. Ticket Title

Status: READY
Progress: 25%
Repository:

- `alpha-kanban`

Priority: P0
Type: Feature / API / UX / Test / Policy / Security
Depends on:

- `AKW-000`

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

- 2026-06-22: 사용자 요청 또는 작업 방향을 기록한다.

진행 메모:

- 2026-06-22: 초안 작성.
```

## Progress Board

| Ticket | Status | Progress | Repository | Depends on |
| --- | --- | ---: | --- | --- |
| AKW-00 | DONE | 100% | `alpha-kanban`, `docs` | - |
| AKW-01 | DONE | 100% | `packages/shared`, `apps/server` | AKW-00 |
| AKW-02 | DONE | 100% | `apps/server`, `packages/shared` | AKW-01 |
| AKW-03 | DONE | 100% | `apps/server`, `packages/shared` | AKW-01, AKW-02 |
| AKW-04 | DONE | 100% | `apps/web`, `packages/shared` | AKW-02, AKW-03 |
| AKW-12 | DONE | 100% | `apps/web`, `alpha-kanban` | AKW-02, AKW-04 |
| AKW-13 | DONE | 100% | `apps/server`, `apps/web`, `packages/shared`, `alpha-kanban` | AKW-02, AKW-04, AKW-12 |
| AKW-14 | DONE | 100% | `apps/web` | AKW-13 |
| AKW-05 | TODO | 0% | `apps/server`, `apps/web` | AKW-03, AKW-04 |
| AKW-06 | TODO | 0% | `alpha-kanban`, `apps/server`, `apps/web` | AKW-01, AKW-02, AKW-03, AKW-04, AKW-05, AKW-07, AKW-08, AKW-09, AKW-10, AKW-11, AKW-12, AKW-13, AKW-14 |
| AKW-07 | TODO | 0% | `apps/web`, `apps/server`, `packages/shared` | AKW-03, AKW-04, AKW-05 |
| AKW-08 | TODO | 0% | `apps/web`, `apps/server`, `packages/shared` | AKW-02, AKW-03, AKW-04, AKW-05, AKW-07 |
| AKW-09 | DONE | 100% | `apps/server`, `apps/web`, `packages/shared` | AKW-05 |
| AKW-10 | TODO | 0% | `apps/server`, `apps/web`, `packages/shared` | AKW-03, AKW-04 |
| AKW-11 | DONE | 100% | `apps/server`, `apps/web`, `packages/shared` | AKW-09 |

## Ticket List

### AKW-00. Multi-workspace 정책 및 phase 범위 확정

Status: DONE
Progress: 100%
Repository:

- `alpha-kanban`
- `docs`

Priority: P0
Type: Policy / Design
Depends on:

- 없음

목표:

- Alpha Kanban의 다음 phase를 single-workspace MVP 연장이 아니라 target workspace 선택 구조로 분리한다.
- 기존 AKB 문서는 완료된 MVP 문서로 유지하고, multi-workspace 작업은 새 plan/ticket 문서로 추적한다.

현재 문제:

- 현재 앱은 `/Users/kiseong.park/workspace/alpha-kanban`의 `docs`와 `examples`를 바로 리스팅한다.
- 사용자가 원하는 실제 운영 흐름은 workspace/project를 고른 뒤 해당 project의 docs를 보고 Codex 작업을 지시하는 것이다.
- 기존 `workspaceRoots` 개념은 config에 있지만 target project 선택과 Codex cwd routing에 아직 사용되지 않는다.

구현 범위:

- control app과 target workspace를 개념적으로 분리한다.
- `workspaceRoots`를 OS 권한이 아니라 앱 내부 allowlist policy로 정의한다.
- recent/last/session state는 `.alpha-kanban/state.json`에 두고 target project에는 쓰지 않는 원칙을 확정한다.
- 새 phase 문서 `docs/03_alpha_kanban_multi_workspace_plan.md`, `docs/04_alpha_kanban_multi_workspace_tickets.md`를 만든다.

제외 범위:

- 구현 코드 변경
- UI 구현
- API route 변경

완료 기준:

- [x] multi-workspace 방향의 plan 문서가 작성된다.
- [x] 구현 티켓이 기존 완료 AKB 문서와 분리된다.
- [x] allowlist, recent state, target workspace cwd 원칙이 문서화된다.

검증:

- [x] 기존 `docs/02_alpha_kanban_tickets.md`가 `8 / 8 tickets` 완료 상태임을 확인한다.
- [x] 새 티켓 문서 top-level 진행률이 `1 / 11 tickets`로 Progress Board와 일치한다.

사용자 지시:

- 2026-06-22: Alpha Kanban이 자기 프로젝트 docs가 아니라 workspace를 골라 그 project의 docs를 리스팅하고 진행을 지시하는 구조로 바꾸고 싶다.
- 2026-06-22: recent 관리는 칸반 앱의 local state JSON에 유지하는 방향이 맞다.
- 2026-06-22: 기존 MVP 티켓은 완료 상태로 두고 새 plan/ticket을 만들어 진행한다.

진행 메모:

- 2026-06-22: 초안 작성.
- 2026-06-22: 기존 AKB-00부터 AKB-07까지 DONE 상태를 확인하고 multi-workspace phase를 별도 문서로 분리했다.

### AKW-01. Config/state schema를 multi-workspace 기준으로 확장

Status: DONE
Progress: 100%
Repository:

- `packages/shared`
- `apps/server`

Priority: P0
Type: API / Data Model
Depends on:

- `AKW-00`

목표:

- 정적 config와 사용자별 local state를 분리해 target workspace 선택과 recent/session 저장을 지원한다.

현재 문제:

- `alpha-kanban.config.json`은 `docRoots`와 `workspaceRoots`를 모두 control app root 기준으로 처리한다.
- `.alpha-kanban/state.json`은 Codex document session 저장 용도로만 쓰이고, workspace recent/last selection 개념이 없다.
- 기존 document state key는 단일 workspace 상대 path만 고려한다.

구현 범위:

- config schema에 `workspaceRoots`, `defaultDocRoots`, `codexCommand`를 정의한다.
- 기존 `docRoots`는 backward compatible alias로 유지하거나 migration warning을 제공한다.
- state schema에 `recentWorkspaces`, `lastWorkspaceId`, workspace-scoped `documents` key를 추가한다.
- workspace id 생성 규칙을 안정화한다. 예: normalized realpath hash.
- 기존 `.alpha-kanban/state.json` document session을 새 key 형식으로 읽을 수 있는 migration path를 구현한다.
- shared zod schema와 TypeScript type을 추가한다.

제외 범위:

- UI switcher 구현
- workspace discovery route 구현
- Codex process 실행 변경

완료 기준:

- [x] server config가 `workspaceRoots`와 `defaultDocRoots`를 구분한다.
- [x] local state가 recent workspace와 workspace-scoped document session을 저장할 수 있다.
- [x] 기존 state 파일이 있어도 server boot가 실패하지 않는다.
- [x] target project에는 state 파일을 쓰지 않는다.

검증:

- [x] config loader unit test
- [x] state migration unit test
- [x] backward compatibility test

사용자 지시:

- 2026-06-22: recent는 대상 project docs/config가 아니라 Alpha Kanban local state JSON에 유지한다.
- 2026-06-22: Codex 실행 지시: 테스트겸 web ui로 명령해볼게 01 구현 시작해줘.

진행 메모:

- 2026-06-22: 초안 작성.
- 2026-06-22: `packages/shared` state schema를 v2 기준으로 확장해 `recentWorkspaces`, `lastWorkspaceId`, workspace-scoped `documents`, `runResults`를 함께 표현하도록 정리했다.
- 2026-06-22: `apps/server/src/codexState.ts`가 legacy v1 document key를 `${workspaceId}::relativePath`로 마이그레이션하고, recent workspace와 run read-state를 control app `.alpha-kanban/state.json`에만 저장하도록 구현했다.
- 2026-06-22: `apps/server/src/__tests__/config.test.ts`, `apps/server/src/__tests__/codexState.test.ts`, API 통합 테스트를 추가/수정했고 `pnpm --filter @alpha-kanban/server test` 통과를 확인했다.

### AKW-02. Workspace discovery와 allowlist path 검증 API 구현

Status: DONE
Progress: 100%
Repository:

- `apps/server`
- `packages/shared`

Priority: P0
Type: API / Security
Depends on:

- `AKW-01`

목표:

- allowlist 내부 project만 선택 가능한 workspace 후보로 노출하고, 모든 workspace/file 요청을 같은 policy로 검증한다.

현재 문제:

- 현재 API에는 project 선택 개념이 없고 `/api/files`가 control app의 configured docs만 반환한다.
- `workspaceRoots`는 실제 project allowlist로 적용되지 않는다.
- path traversal, symlink escape, unavailable recent workspace에 대한 명시 에러가 없다.

구현 범위:

- `GET /api/workspaces`를 추가한다.
- allowlist root 아래 project candidate를 scan한다.
- candidate summary에 `id`, `label`, `root`, `isAvailable`, `hasDocs`, `lastOpenedAt`을 포함한다.
- workspace path 검증 helper를 만든다.
- `realpath` 기준으로 symlink와 `..` escape를 차단한다.
- `WORKSPACE_NOT_FOUND`, `WORKSPACE_OUTSIDE_ALLOWLIST`, `WORKSPACE_UNAVAILABLE` 에러를 정의한다.

제외 범위:

- 깊은 recursive project scan
- target project별 doc root UI 편집
- frontend switcher UI

완료 기준:

- [x] allowlist 내부 project만 API에 반환된다.
- [x] allowlist 밖 absolute path는 거부된다.
- [x] symlink가 allowlist 밖을 가리키면 거부된다.
- [x] recent workspace가 삭제된 경우 unavailable 상태로 표현된다.

검증:

- [x] API integration test
- [x] symlink/path traversal test
- [x] unavailable recent workspace test

사용자 지시:

- 2026-06-22: allowlist는 OS 접근권한이 아니라 앱 내부 workspace root 정책으로 이해한다.
- 2026-06-22: AKW-02 구현을 진행한다.

진행 메모:

- 2026-06-22: 초안 작성.
- 2026-06-22: `packages/shared`에 workspace list/select DTO를 추가하고, `apps/server/src/workspaces.ts`에 allowlist realpath 검증, candidate discovery, recent unavailable 병합 정책을 구현했다.
- 2026-06-22: `GET /api/workspaces`, `POST /api/workspaces/select`와 `WORKSPACE_NOT_FOUND`, `WORKSPACE_OUTSIDE_ALLOWLIST`, `WORKSPACE_UNAVAILABLE` 에러 매핑을 추가했다.
- 2026-06-22: API 통합 테스트로 allowlist listing, select recent 기록, path traversal 차단, symlink escape 차단, unavailable recent 선택 거부를 검증했고 `pnpm --filter @alpha-kanban/server test` 통과를 확인했다.

### AKW-03. Per-workspace Markdown file API와 FileStore 분리

Status: DONE
Progress: 100%
Repository:

- `apps/server`
- `packages/shared`

Priority: P0
Type: API / Feature
Depends on:

- `AKW-01`
- `AKW-02`

목표:

- Markdown file listing, ticket read/write, status/progress update를 selected workspace 기준으로 수행한다.

현재 문제:

- `MarkdownFileStore`는 단일 `config.workspaceRoot`와 `config.docRoots`에 묶여 있다.
- file id와 relative path가 workspace id를 포함하지 않아 여러 project의 같은 path를 구분할 수 없다.
- API route가 workspace id 없이 `/api/files/:fileId` 형태다.

구현 범위:

- `WorkspaceFileStore` 또는 workspace-aware `MarkdownFileStore`를 도입한다.
- `GET /api/workspaces/:workspaceId/files`를 구현한다.
- `GET /api/workspaces/:workspaceId/files/:fileId/tickets`를 구현한다.
- `PATCH /api/workspaces/:workspaceId/files/:fileId/tickets/:ticketId`를 구현한다.
- instruction/progress note append route를 workspace-scoped로 이전한다.
- 기존 `/api/files` route는 임시 compatibility route로 둘지 명시적으로 제거할지 결정하고 문서화한다.
- file summary에 workspace id와 workspace-relative path를 포함한다.

제외 범위:

- frontend switcher UI
- Codex runner cwd 변경
- drag-and-drop status 변경

완료 기준:

- [x] selected workspace의 docs만 file list에 나온다.
- [x] 같은 relative path를 가진 두 workspace가 서로 다른 file id로 처리된다.
- [x] ticket write가 selected workspace 파일에만 반영된다.
- [x] stale write protection이 workspace-scoped로 유지된다.

검증:

- [x] two-workspace file list integration test
- [x] two-workspace same relative path collision test
- [x] ticket patch/instruction/progress note API test

사용자 지시:

- 2026-06-22: workspace를 골라 그 project에 있는 docs를 리스팅하고 그 project에 진행을 지시하는 구조가 필요하다.
- 2026-06-23: AKW-02를 커밋한 뒤 AKW-03 구현을 진행한다.

진행 메모:

- 2026-06-22: 초안 작성.
- 2026-06-23: `MarkdownFileStore`를 workspace root/docRoots/workspaceId 기준으로 인스턴스화할 수 있게 확장하고, file summary에 `workspaceId`, `workspaceRelativePath`를 포함했다.
- 2026-06-23: `GET /api/workspaces/:workspaceId/files`, ticket read, status patch, 사용자 지시 append, 진행 메모 append route를 workspace-scoped로 추가했다. 기존 `/api/files` route는 UI 전환 전 compatibility route로 유지한다.
- 2026-06-23: 두 workspace가 같은 `docs/02_alpha_kanban_tickets.md`를 가질 때 file id가 충돌하지 않고, patch/instruction/progress-note가 selected workspace에만 반영되며 stale hash guard가 유지되는 API 통합 테스트를 추가했다.
- 2026-06-23: `pnpm --filter @alpha-kanban/server test` 통과를 확인했다.

### AKW-04. Project switcher와 recent workspace UX 구현

Status: DONE
Progress: 100%
Repository:

- `apps/web`
- `packages/shared`

Priority: P0
Type: UX / Feature
Depends on:

- `AKW-02`
- `AKW-03`

목표:

- 앱 첫 화면이 자기 docs에 고정되지 않고, last/recent target project를 선택하거나 전환할 수 있게 한다.

현재 문제:

- UI는 시작 시 바로 `/api/files`를 호출하고 첫 ticket document로 진입한다.
- project 선택 UI가 없어 사용자가 어떤 target project를 보고 있는지 명확하지 않다.
- recent/last workspace가 화면에 노출되지 않는다.

구현 범위:

- 좌측 상단 project switcher를 추가한다.
- last workspace가 유효하면 바로 해당 project의 board를 로드한다.
- last workspace가 없거나 unavailable이면 project selection empty state를 표시한다.
- recent workspace와 discovered workspace를 구분해 표시한다.
- project 변경 시 file list, selected file, selected ticket, board query cache를 workspace scope로 갱신한다.
- selected project root와 selected ticket document path를 header에 표시한다.
- mobile viewport에서도 switcher와 board가 겹치지 않게 조정한다.

제외 범위:

- project 생성/삭제 UI
- target project별 docRoots 편집 UI
- visual redesign 전체 개편

완료 기준:

- [x] last workspace가 있으면 앱 진입 시 해당 project board가 열린다.
- [x] workspace가 없으면 project selection empty state가 표시된다.
- [x] switcher에서 project를 바꾸면 ticket documents와 board가 바뀐다.
- [x] selected project가 unavailable이면 복구 가능한 UI가 표시된다.
- [x] UI가 Notion-like flat board 구조를 유지한다.

검증:

- [x] component/API mocked smoke
- [x] desktop browser smoke
- [x] mobile browser smoke

사용자 지시:

- 2026-06-22: 운영 UX 기준으로는 프로젝트 선택 UI가 먼저 있고, 마지막 선택 프로젝트가 있으면 바로 그 칸반으로 들어가는 방식이 좋다.
- 2026-06-23: AKW-04 구현을 진행한다.

진행 메모:

- 2026-06-22: 초안 작성.
- 2026-06-23: `apps/web/src/App.tsx`가 `/api/workspaces`, `/api/workspaces/select`, `/api/workspaces/:workspaceId/files`를 사용하도록 변경하고, 좌측 상단 project switcher와 no-selection empty state를 추가했다.
- 2026-06-23: last workspace가 유효하면 reload 시 바로 board로 진입하고, project 변경 시 selected file/ticket과 query cache가 workspace scope로 초기화되도록 구현했다.
- 2026-06-23: selected workspace root와 selected ticket document path를 board header에 표시하고, workspace-scoped Codex 실행은 AKW-05 전까지 drawer에서 명시적으로 비활성화했다.
- 2026-06-23: 검증 완료: `pnpm typecheck`, `pnpm test`, `pnpm build`, Playwright desktop/mobile smoke. Desktop에서 no-last empty state, project switcher, last workspace reload, project 전환을 확인했고 mobile `390x844`에서 switcher/file list/board header가 겹치지 않음을 확인했다.

### AKW-12. Project switcher Open path 입력 선택 구현

Status: DONE
Progress: 100%
Repository:

- `apps/web`
- `alpha-kanban`

Priority: P0
Type: UX / Feature
Depends on:

- `AKW-02`
- `AKW-04`

목표:

- recent/discovered 목록에 없는 workspace도 사용자가 absolute path를 직접 입력해 선택할 수 있게 한다.
- 입력된 path는 기존 allowlist 검증 API를 통과한 경우에만 recent/last workspace로 기록한다.

현재 문제:

- project switcher는 API가 반환하는 recent/discovered 목록만 선택할 수 있다.
- allowlist 내부에 있는 새 project나 아직 discovered 목록에 없는 하위 경로를 사용자가 직접 열 수 없다.
- 현재 dogfooding config가 `workspaceRoots: ["."]`에 묶여 sibling project 선택 흐름을 확인하기 어렵다.

구현 범위:

- project switcher에 `Open path` 입력 form을 추가한다.
- 입력값을 trim한 뒤 `POST /api/workspaces/select`에 `{ root }`로 전달한다.
- 성공 시 returned workspace id를 selected workspace로 설정하고 selected file/ticket state를 초기화한다.
- 실패 시 `WORKSPACE_OUTSIDE_ALLOWLIST`, `WORKSPACE_NOT_FOUND`, `WORKSPACE_UNAVAILABLE` 같은 API error code와 message를 switcher 안에 표시한다.
- 기존 discovered/recent workspace 선택은 `{ workspaceId }` 기반 select flow를 유지한다.
- dogfooding config를 `defaultDocRoots`와 parent `workspaceRoots` 기준으로 정리한다.

제외 범위:

- OS native folder picker
- `workspaceRoots` allowlist를 UI에서 편집하는 기능
- target project별 docRoots 편집 UI

완료 기준:

- [x] allowlist 내부 path를 입력하면 workspace가 선택되고 recent에 기록된다.
- [x] allowlist 밖 path를 입력하면 복구 가능한 error message가 표시된다.
- [x] 기존 recent/discovered project 선택이 유지된다.
- [x] path 입력 form이 mobile viewport에서 project switcher와 겹치지 않는다.

검증:

- [x] `pnpm typecheck`
- [x] `pnpm test`
- [x] `pnpm build`
- [x] desktop browser smoke
- [x] mobile browser smoke

사용자 지시:

- 2026-06-23: recent에 있는 project 말고 새로운 경로를 입력해 선택하는 기능이 앞으로 할 티켓에 없으면 바로 뒤에 추가하고 진행한다.

진행 메모:

- 2026-06-23: `apps/web/src/App.tsx`의 project switcher에 Open path form을 추가하고, root 기반 workspace select 성공 시 returned workspace id로 board scope를 전환하도록 구현했다.
- 2026-06-23: `alpha-kanban.config.json`을 `workspaceRoots: [".."]`, `defaultDocRoots: ["docs", "examples"]`로 정리해 `/Users/kiseong.park/workspace` 아래 project를 dogfooding 대상으로 열 수 있게 했다.
- 2026-06-23: 검증 완료: `pnpm typecheck`, `pnpm test`, `pnpm build`, Playwright desktop/mobile smoke. `/tmp` 입력 시 `WORKSPACE_OUTSIDE_ALLOWLIST` 표시, allowlist 내부 신규 path 선택 및 recent 등록, 기존 `alpha-kanban` 재선택, mobile `390x844` 레이아웃을 확인했다.

### AKW-13. Server-backed folder picker와 workspaceRoots 설정 UX 설계/구현

Status: DONE
Progress: 100%
Repository:

- `apps/server`
- `apps/web`
- `packages/shared`
- `alpha-kanban`

Priority: P0
Type: API / UX / Policy
Depends on:

- `AKW-02`
- `AKW-04`
- `AKW-12`

목표:

- 사용자가 absolute path를 직접 타이핑하지 않아도 allowlist 내부 폴더를 탐색해 workspace를 선택할 수 있게 한다.
- `workspaceRoots` 최대 범위를 누가, 언제, 어디서 정하는지 제품 흐름으로 명확히 만든다.

현재 문제:

- browser의 native folder input 또는 `webkitdirectory`는 폴더 선택 UI는 제공하지만 보안상 absolute path를 노출하지 않으므로, selected workspace cwd가 필요한 Alpha Kanban에는 단독으로 충분하지 않다.
- AKW-12의 주소 입력은 빠른 fallback이지만 최종 제품 UX로는 탐색/검색 가능한 폴더 선택기가 더 적합하다.
- `workspaceRoots` allowlist는 현재 config 파일에서 직접 설정해야 하며, 최초 설정 또는 settings UX가 없다.

구현 범위:

- allowlist root와 하위 directory를 조회하는 server API를 추가한다.
- directory listing API는 `realpath` 기준으로 `workspaceRoots` 밖으로 벗어나는 요청을 거부한다.
- UI는 project switcher 안에서 folder picker sheet 또는 inline browser를 제공한다.
- folder picker는 allowlist root, parent/child navigation, 선택한 directory open action을 제공한다.
- native folder input은 absolute path를 얻을 수 없다는 제약을 문서화하고, 필요하면 파일 목록 import 같은 보조 용도로만 평가한다.
- `workspaceRoots`는 앱 설치/최초 실행/Settings에서 사용자가 지정하는 앱 정책임을 README와 plan에 정리한다.
- Settings 기반 config 변경은 즉시 reload가 가능한지, server restart가 필요한지 정책을 명시한다.

제외 범위:

- OS-level filesystem permission 요청 자동화
- allowlist 밖 directory를 임시 예외로 여는 기능
- target project repository에 Alpha Kanban state/config를 쓰는 기능
- 웹 UI에서 `alpha-kanban.config.json`을 직접 쓰기/수정하는 기능

완료 기준:

- [x] 주소를 직접 입력하지 않고 allowlist 내부 directory를 선택할 수 있다.
- [x] folder picker가 allowlist 밖 navigation/path traversal/symlink escape를 허용하지 않는다.
- [x] `workspaceRoots` 최대 범위를 설정하는 ownership과 UX가 문서화된다.
- [x] 주소 입력 fallback과 folder picker의 error message가 같은 allowlist 정책을 따른다.
- [x] mobile viewport에서도 folder picker를 사용할 수 있다.

검증:

- [x] directory listing API test
- [x] allowlist escape/symlink test
- [x] `pnpm typecheck`
- [x] `pnpm test`
- [x] `pnpm build`
- [x] desktop browser smoke
- [x] mobile browser smoke

사용자 지시:

- 2026-06-23: file input 같은 것을 활용하거나 유사한 UI/API로 폴더를 고르게 할 수 있는지, 주소 입력이 최선인지, `workspaceRoots` 최대 범위는 언제 누가 정하는지 확인한다.
- 2026-06-23: 위 내용을 티켓화해서 바로 진행한다.
- 2026-06-23: 브라우저 smoke는 Playwright raw snapshot이 토큰을 많이 쓰면 Chrome/in-app browser plugin처럼 더 적합한 도구를 써도 된다. 마우스 cursor 표시가 필요한 비주얼 피드백에서는 Chrome plugin도 고려한다.

진행 메모:

- 2026-06-23: `webkitdirectory` 계열 file input은 absolute path를 제공하지 않으므로 Codex cwd routing에는 부족하고, 서버가 allowlist 내부 directory를 listing하는 폴더 브라우저 API가 필요하다고 정리했다.
- 2026-06-23: `packages/shared`에 workspace directory DTO를 추가하고, `apps/server/src/workspaces.ts`와 `apps/server/src/app.ts`에 `GET /api/workspace-directories`를 구현했다. API는 allowlist root, 현재 directory, parent path, child directory entries를 반환한다.
- 2026-06-23: directory API는 `realpath` 기준으로 allowlist 밖 traversal과 symlink escape를 거부하고, child listing에서도 allowlist 밖으로 빠지는 entry를 제외하도록 구현했다.
- 2026-06-23: `apps/web/src/App.tsx` project switcher에 `Browse` inline folder picker를 추가했다. Allowlist root 선택, parent 이동, child folder navigation, 현재 folder `Open` action이 기존 root 기반 workspace select flow를 재사용한다.
- 2026-06-23: config 쓰기 UI는 이번 티켓에서 제외했다. 현재 구현은 `workspaceRoots`가 앱 사용자/운영자가 정하는 allowlist 정책임을 문서화하고, UI는 그 정책 내부를 탐색하는 데 집중한다.
- 2026-06-23: 검증 완료: `pnpm --filter @alpha-kanban/server test`, `pnpm --filter @alpha-kanban/server typecheck`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `git diff --check`, Playwright desktop/mobile smoke. Desktop에서 Browse open, allowlist root listing, `alpha-kanban` child navigation, current folder Open을 확인했고 mobile `390x844`에서 folder picker layout이 겹치지 않음을 확인했다. Browser smoke는 다음부터 snapshot token을 줄이고, 순수 비주얼 확인은 in-app browser/Chrome plugin 사용을 우선 검토한다.

### AKW-14. Folder picker를 file chooser modal UX로 전환

Status: DONE
Progress: 100%
Repository:

- `apps/web`

Priority: P0
Type: UX / Feature
Depends on:

- `AKW-13`

목표:

- project switcher 안에 갇힌 folder picker를 Windows file selector에 가까운 modal UX로 전환한다.
- shadcn 스타일 Dialog와 details-view folder list를 사용해 workspace 선택 화면을 더 넓고 명확하게 만든다.

현재 문제:

- AKW-13의 inline folder picker는 sidebar 폭 안에 고정되어 폴더 목록, 경로, 선택 action을 한눈에 보기 어렵다.
- 사용자가 기대한 UX는 작은 sidebar panel이 아니라 OS file chooser처럼 넓은 modal에서 폴더를 탐색하고 선택하는 흐름이다.

구현 범위:

- shadcn 스타일 `Dialog` component를 추가한다.
- `@radix-ui/react-dialog`를 web package dependency로 추가한다.
- Project switcher의 `Browse` action이 inline panel 대신 modal을 열도록 변경한다.
- Modal은 좌측 allowlist roots, 상단 path bar, 중앙 details-view folder list, 하단 `Cancel`/`Select Folder` action으로 구성한다.
- Desktop과 mobile viewport에서 modal layout이 겹치지 않게 조정한다.

제외 범위:

- OS native folder picker 연동
- `workspaceRoots` config 편집 UI
- directory API 계약 변경

완료 기준:

- [x] Browse action이 sidebar inline panel 대신 modal을 연다.
- [x] Modal에서 allowlist root, 현재 path, child folders, current folder select action을 볼 수 있다.
- [x] Folder list의 type/path column이 겹치지 않는다.
- [x] mobile viewport에서 modal footer action이 안정적으로 배치된다.

검증:

- [x] `pnpm typecheck`
- [x] `pnpm test`
- [x] `pnpm build`
- [x] desktop browser smoke
- [x] mobile browser smoke

사용자 지시:

- 2026-06-23: 폴더 선택 UI가 sidebar에 고정되어 너무 좁으니 fileChooser처럼 modal로 만들고, shadcn을 활용해 Windows file selector 같은 UI로 구성한다.

진행 메모:

- 2026-06-23: `apps/web/src/components/ui/dialog.tsx`에 Radix 기반 shadcn 스타일 Dialog 컴포넌트를 추가했다.
- 2026-06-23: `apps/web/src/App.tsx`의 folder picker를 modal로 전환하고, roots sidebar, path bar, details-view folder list, footer action 구조로 재구성했다.
- 2026-06-23: in-app browser smoke에서 desktop modal과 mobile `390x844` modal을 확인했다. Desktop에서 type/path column overlap을 발견해 Type column 폭을 넓히고 재확인했다.

### AKW-05. Codex runner를 target workspace cwd/session 기준으로 라우팅

Status: TODO
Progress: 0%
Repository:

- `apps/server`
- `apps/web`

Priority: P0
Type: Feature / Security
Depends on:

- `AKW-03`
- `AKW-04`

목표:

- `Run with Codex`가 Alpha Kanban control app이 아니라 selected target workspace에서 실행되게 한다.

현재 문제:

- `codexRunner.ts`는 `spawn`의 cwd를 config `workspaceRoot`로 고정한다.
- prompt 첫 줄도 Alpha Kanban root를 project path로 사용한다.
- session id는 ticket document path 기준이지만 workspace id가 없어 다른 project와 충돌할 수 있다.

구현 범위:

- Codex preview/run request에 `workspaceId`를 포함한다.
- prompt build context의 `workspaceRoot`를 selected target workspace root로 바꾼다.
- `spawn(codexCommand, args, { cwd: targetWorkspaceRoot })`로 실행한다.
- instruction summary append는 target ticket document에 수행한다.
- raw draft와 prompt에는 target project root, ticket absolute path, plan absolute path를 포함한다.
- session state key를 `workspaceId::ticketRelativePath`로 저장한다.
- run log metadata에 workspace id/root와 ticket relative path를 기록한다.
- UI log/preview에 target workspace가 명확히 보이게 한다.

제외 범위:

- Codex Cloud task 생성
- workspace별 sandbox profile UI
- target project bootstrap command 자동 실행

완료 기준:

- [ ] preview prompt가 selected target workspace root를 표시한다.
- [ ] mocked Codex process cwd가 selected target workspace로 설정된다.
- [ ] 같은 ticket path라도 workspace가 다르면 session id가 분리된다.
- [ ] run instruction summary가 target ticket의 `사용자 지시`에 append된다.
- [ ] Codex stdin EOF 대기 방지 옵션이 유지된다.

검증:

- [ ] mocked process integration test
- [ ] workspace-scoped session resume test
- [ ] prompt preview smoke

사용자 지시:

- 2026-06-22: UI에서 입력한 Run with Codex 지시는 selected project에서 수행되어야 한다.

진행 메모:

- 2026-06-22: 초안 작성.

### AKW-06. Multi-workspace 통합 검증 및 운영 문서 정리

Status: TODO
Progress: 0%
Repository:

- `alpha-kanban`
- `apps/server`
- `apps/web`

Priority: P1
Type: Test / Documentation
Depends on:

- `AKW-01`
- `AKW-02`
- `AKW-03`
- `AKW-04`
- `AKW-05`
- `AKW-07`
- `AKW-08`
- `AKW-09`
- `AKW-10`
- `AKW-11`
- `AKW-12`
- `AKW-13`
- `AKW-14`

목표:

- multi-workspace flow가 기존 single-workspace dogfooding을 깨지 않고 실제 다른 project 문서에도 적용되는지 검증한다.

현재 문제:

- 기존 검증은 Alpha Kanban 자기 docs와 sample fixture 중심이다.
- target workspace 선택, recent state, workspace-scoped session, Codex cwd routing, run status indicator, run result read state, 외부 Markdown 변경 감지를 묶은 regression check가 없다.

구현 범위:

- README의 config/state 설명을 multi-workspace 기준으로 갱신한다.
- sample 또는 test fixture로 두 개 workspace를 구성한다.
- API, UI, Codex mocked integration 검증을 실행한다.
- run status indicator와 external Markdown change sync 동작을 통합 smoke에 포함한다.
- run result unread/read badge 동작을 통합 smoke에 포함한다.
- manual smoke checklist를 업데이트한다.
- 기존 `docs/01`, `docs/02`는 MVP 완료 기록으로 유지하고 새 phase 문서를 현재 상태로 갱신한다.

제외 범위:

- 모든 기존 docs migration
- 외부 project의 실제 Codex run 강제 수행
- release packaging

완료 기준:

- [ ] `pnpm typecheck`가 통과한다.
- [ ] `pnpm test`가 통과한다.
- [ ] `pnpm build`가 통과한다.
- [ ] 브라우저 smoke에서 project switcher, file list, ticket detail, prompt preview가 동작한다.
- [ ] 브라우저 smoke에서 document chat과 workspace chat entry가 scope에 맞게 동작한다.
- [ ] 브라우저 smoke에서 run status indicator와 external file change refresh/stale UI가 동작한다.
- [ ] 브라우저 smoke에서 unread run result badge와 mark-read flow가 동작한다.
- [ ] README와 티켓 문서가 실제 구현 상태와 일치한다.

검증:

- [ ] automated test suite
- [ ] desktop browser smoke
- [ ] mobile browser smoke
- [ ] document/workspace chat smoke
- [ ] run status indicator smoke
- [ ] run result read state smoke
- [ ] external Markdown change smoke
- [ ] manual checklist

사용자 지시:

- 2026-06-22: 샘플 fixture와 실제 제품 진행률은 구분하고, 새 phase는 별도 티켓으로 추적한다.

진행 메모:

- 2026-06-22: 초안 작성.

### AKW-11. Run result unread badge와 read state 저장 구현

Status: DONE
Progress: 100%
Repository:

- `apps/server`
- `apps/web`
- `packages/shared`

Priority: P0
Type: Feature / API / UX
Depends on:

- `AKW-09`

목표:

- 완료/실패한 Codex run 결과를 사용자가 놓치지 않도록 unread result badge로 유지하고, 명시적 읽음 처리 후 카드에서 숨긴다.

현재 문제:

- 현재 ticket card는 ticket별 latest run summary를 그대로 표시하므로 `succeeded` badge가 ticket 상태와 무관하게 계속 따라다닌다.
- badge를 즉시 제거하면 사용자가 완료/실패 결과를 읽기 전에 놓칠 수 있다.
- 시간 기반 만료는 장기 휴식 후 돌아오는 workflow에 맞지 않는다.
- run result read state가 서버 state로 저장되지 않아 브라우저/새로고침 간 일관 정책이 없다.

구현 범위:

- `.alpha-kanban/state.json`에 `runId -> readAt` read state를 저장한다.
- document run summary API가 finished run의 `readAt`과 `isUnread` 정보를 반환한다.
- finished run 중 unread result만 ticket card badge에 표시한다.
- active run은 read state와 무관하게 항상 표시한다.
- ticket detail drawer에 latest run result `Mark as read` action을 제공한다.
- mark-read API를 추가하고 read 처리 후 run summary query를 갱신한다.
- read 처리된 finished run은 카드 badge에서 사라지지만 drawer run history/latest run에서는 확인 가능하게 유지한다.

제외 범위:

- 시간 기반 자동 만료
- run history 전체 목록 UI
- 서버 재시작 후 JSONL 로그를 읽어 run registry를 복원하는 기능

완료 기준:

- [x] finished run이 unread이면 ticket card에 result badge가 표시된다.
- [x] active run은 read 여부와 무관하게 ticket card에 표시된다.
- [x] 사용자가 `Mark as read`를 누르면 `readAt`이 서버 state에 저장된다.
- [x] read 처리된 finished run badge는 ticket card에서 사라진다.
- [x] 새로고침 후에도 read 처리 상태가 유지된다.

검증:

- [x] state store readAt unit/API test
- [x] mark-read API test
- [x] ticket card unread badge UI smoke
- [x] drawer mark-read smoke

사용자 지시:

- 2026-06-22: 완료/실패 run 결과는 시간으로 자동 삭제하지 말고, 서버 `.alpha-kanban/state.json`에 read state를 저장해 명시적 읽음 처리로 관리한다.

진행 메모:

- 2026-06-22: 초안 작성 후 구현 시작.
- 2026-06-22: `packages/shared`의 run summary에 `readAt`, `isUnread`를 추가하고 mark-read 응답 schema를 추가했다.
- 2026-06-22: `apps/server`에서 `.alpha-kanban/state.json`의 `runResults[runId].readAt` 저장/조회와 `POST /api/codex/runs/:runId/read`를 구현했다.
- 2026-06-22: `apps/web`에서 ticket card/document header는 active 또는 unread run만 표시하고, drawer의 `Mark as read`가 readAt 저장 후 badge를 제거하도록 구현했다.
- 2026-06-22: 검증 완료: `pnpm --filter @alpha-kanban/server test`, `pnpm typecheck`, `pnpm test`, `pnpm build`, Playwright UI smoke. Dry run으로 unread succeeded badge를 만들고 `Mark as read` 후 카드/header/drawer badge 제거와 state.json `readAt` 저장을 확인했다.

### AKW-07. Document-level chat panel 구현

Status: TODO
Progress: 0%
Repository:

- `apps/web`
- `apps/server`
- `packages/shared`

Priority: P1
Type: UX / Feature
Depends on:

- `AKW-03`
- `AKW-04`
- `AKW-05`

목표:

- 선택된 ticket document 전체를 두고 단순 질문, 논의, 요약, 작업 방향 정리를 할 수 있는 document-level chat surface를 제공한다.

현재 문제:

- 현재 자유 입력은 ticket detail drawer의 `Run with Codex` 실행 draft에만 있다.
- 문서 전체에 대해 질문하고 싶은 경우에도 특정 card를 열어야 해 scope가 잘못 보인다.
- 사용자의 논의가 바로 Markdown에 기록되어야 하는지, 단순 대화인지 구분할 UI가 없다.

구현 범위:

- board 우측에 collapsible `Document Chat` panel을 추가한다.
- panel header에 현재 selected ticket document path를 표시한다.
- board header 오른쪽에 `Discuss doc` 또는 동일 의미의 entry button을 둔다.
- composer placeholder는 현재 문서 전체에 대한 질문/논의임을 명확히 한다.
- document chat prompt는 selected workspace, selected file, 관련 plan path, ticket ids 요약을 context로 포함한다.
- 기본 chat 응답은 Markdown을 수정하지 않는다.
- 사용자가 명시적으로 기록을 요청할 때만 선택 ticket의 `사용자 지시` append, 특정 ticket 선택 요청, 또는 새 ticket 생성 flow로 전환한다.
- desktop에서는 우측 panel, mobile에서는 sheet/fullscreen 형태로 제공한다.

제외 범위:

- workspace 전체 docs 검색
- 새 plan/ticket 생성 primary flow
- 장기 transcript sync 또는 외부 저장소 동기화

완료 기준:

- [ ] 선택된 ticket document가 있으면 document chat entry가 활성화된다.
- [ ] document chat panel이 현재 document path와 scope를 표시한다.
- [ ] document chat 입력은 기본적으로 Markdown을 수정하지 않는다.
- [ ] 사용자가 기록을 명시하면 기록 대상 ticket 선택 또는 append action으로 전환된다.
- [ ] ticket drawer의 `Run with Codex` draft와 혼동되지 않는다.

검증:

- [ ] document chat prompt preview/unit test
- [ ] desktop browser smoke
- [ ] mobile browser smoke
- [ ] no-write default behavior test

사용자 지시:

- 2026-06-22: 카드별 입력뿐 아니라 현재 Markdown 파일 전체를 두고 자유 질문이나 논의를 할 수 있는 전체 입력이 있으면 좋겠다.
- 2026-06-22: document chat은 board 우측 panel에 두는 방향이 좋다.

진행 메모:

- 2026-06-22: 초안 작성.

### AKW-08. Workspace-level chat entry와 project-wide 논의 flow 구현

Status: TODO
Progress: 0%
Repository:

- `apps/web`
- `apps/server`
- `packages/shared`

Priority: P1
Type: UX / Feature
Depends on:

- `AKW-02`
- `AKW-03`
- `AKW-04`
- `AKW-05`
- `AKW-07`

목표:

- 선택된 workspace 전체의 plan/ticket/inventory 문서를 기준으로 질문, 논의, 새 작업 plan/ticket 생성을 시작할 수 있는 workspace-level chat surface를 제공한다.

현재 문제:

- Document Chat은 현재 선택된 ticket document에 묶인다.
- 새 기능 논의, 여러 ticket document 간 비교, workspace 전체 현황 질문은 특정 document 우측 panel보다 project scope entry가 더 적합하다.
- `$plan-ticketing`을 활용한 새 plan/ticket 생성 요청은 특정 card나 document보다 workspace scope에서 시작하는 것이 자연스럽다.

구현 범위:

- sidebar의 project switcher 아래에 `Workspace Chat` entry를 추가한다.
- entry sublabel에 현재 selected workspace와 전체 docs scope를 표시한다.
- desktop에서는 command-palette style modal 또는 sidebar 확장 panel로 연다.
- mobile에서는 fullscreen sheet로 연다.
- workspace chat prompt는 selected workspace root, discovered plan/ticket/inventory docs 목록, recent selected document를 context로 포함한다.
- `$plan-ticketing` 명시 호출이나 plan/ticket 생성 요청을 workspace chat의 primary flow로 지원한다.
- chat 결과가 Markdown 변경을 제안할 때는 대상 문서 생성/수정 범위를 preview하고 명시 실행으로 분리한다.

제외 범위:

- workspace 전체 코드베이스 semantic indexing
- 외부 issue tracker 동기화
- 여러 workspace를 동시에 대상으로 하는 cross-workspace chat

완료 기준:

- [ ] selected workspace가 있으면 sidebar에서 workspace chat entry가 보인다.
- [ ] workspace chat은 현재 document가 없어도 project scope로 열 수 있다.
- [ ] workspace chat prompt가 project docs 목록을 기반으로 구성된다.
- [ ] plan/ticket 생성 요청은 `$plan-ticketing`을 사용할 수 있는 prompt boundary를 가진다.
- [ ] document chat과 workspace chat의 scope label이 명확히 구분된다.

검증:

- [ ] workspace chat prompt preview/unit test
- [ ] `$plan-ticketing` trigger prompt smoke
- [ ] desktop browser smoke
- [ ] mobile browser smoke

사용자 지시:

- 2026-06-22: workspace chat은 project switcher 아래 sidebar entry에서 열고, project 전체 docs를 기준으로 질문하거나 새 plan/ticket 생성을 논의하는 방향이 좋다.

진행 메모:

- 2026-06-22: 초안 작성.

### AKW-09. Codex run status indicator와 active run 신호 구현

Status: DONE
Progress: 100%
Repository:

- `apps/server`
- `apps/web`
- `packages/shared`

Priority: P0
Type: UX / Feature
Depends on:

- `AKW-05`

목표:

- 사용자가 자세한 terminal log를 보지 않아도 Codex CLI 실행이 진행 중인지, 완료됐는지, 실패했는지 알 수 있는 시각적 신호를 제공한다.
- 같은 plan/ticket Markdown document session에서는 단일 active run만 허용해 session context와 Markdown write 충돌을 피한다.

현재 문제:

- 현재 run 로그는 `.alpha-kanban/runs/*.jsonl`에 남지만 UI에서 실행 중인지 아닌지 판단하기 어렵다.
- drawer나 side panel을 닫으면 SSE stream을 놓쳐 사용자가 run 상태를 잃어버린 것처럼 느낀다.
- 제품 UX에 필요한 것은 full terminal replay보다 ticket/document/workspace scope의 compact status signal이다.

구현 범위:

- active run registry 또는 run summary API를 제공한다.
- run summary는 `idle`, `running`, `succeeded`, `failed`, `canceled`, `needs_auth`, `unknown` 상태를 구분한다.
- 같은 document에 `queued` 또는 `running` run이 있으면 새 run 요청을 거부하고 기존 active run을 안내한다.
- run history는 여러 개 기록하되, UI primary action은 document-scoped single active run 정책을 따른다.
- Codex 내부 subagent/병렬 tool call은 하나의 outer run 상태로 표시한다.
- ticket card에 해당 ticket의 active run dot/badge를 표시한다.
- selected document header 또는 board header에 document-level running/failure indicator를 표시한다.
- workspace switcher 이후 workspace-level indicator로 확장할 수 있게 response shape를 설계한다.
- drawer 재오픈 시 active run summary를 다시 조회해 상태를 표시한다.
- full terminal log는 debug/view log affordance로 숨기고, 상태 신호와 실패 요약을 우선한다.

제외 범위:

- full terminal replay를 제품 필수 UI로 구현
- 닫힌 run을 자동 재시작
- 상태 indicator 클릭만으로 자동 cancel
- 같은 document 안에서 여러 ticket run을 UI가 직접 병렬 실행하는 기능

완료 기준:

- [x] run 중인 ticket card에 running indicator가 표시된다.
- [x] selected document 안에 run 중인 ticket이 있으면 document-level indicator가 표시된다.
- [x] 같은 document에 active run이 있으면 추가 run 요청이 막히고 기존 active run이 안내된다.
- [x] run 성공/실패/취소/auth-required 상태가 구분된다.
- [x] drawer를 닫았다 다시 열어도 active run summary를 볼 수 있다.
- [x] terminal log replay가 없어도 사용자가 run 상태를 판단할 수 있다.

검증:

- [x] active run summary API test
- [x] mocked Codex running/succeeded/failed/canceled test
- [x] desktop browser smoke
- [x] drawer reopen smoke

사용자 지시:

- 2026-06-22: 자세한 터미널은 디버그 용도라 최종 제품에는 없어도 되지만, 이 티켓이 CLI 세션에서 진행 중인지 아닌지 알 수 있는 시각적 신호등은 있으면 좋겠다.
- 2026-06-22: MVP는 같은 md 파일 document session 안에서 단일 active run으로 구현하고, Codex 내부 subagent/병렬 도구 사용은 하나의 outer run으로 취급한다.
- 2026-06-22: 완료 기준이나 검증 같은 Markdown checkbox가 UI에서 체크 상태로 렌더링되지 않아 어디까지 진행됐는지 알기 어렵다.
- 2026-06-22: AKW-09 진행사항이 완료 기준 checkbox에 반영되어 있지 않다.
- 2026-06-22: 샘플 티켓 run으로 drawer reopen/run status smoke가 확인되었고, 샘플 변경은 reset한다.

진행 메모:

- 2026-06-22: 초안 작성.
- 2026-06-22: 단일 active run 정책을 plan과 ticket 본문에 반영하고 AKW-09 구현을 시작한다.
- 2026-06-22: `packages/shared`에 run signal/summary schema를 추가하고, `apps/server`에 document run summary API와 document-scoped single active run guard를 구현했다.
- 2026-06-22: `apps/web`에 document header/ticket card run badge, active run 안내, drawer reopen 시 run snapshot 재조회 연결을 구현했다.
- 2026-06-22: 검증 완료: `pnpm --filter @alpha-kanban/server test`, `pnpm typecheck`, `pnpm test`, `pnpm build`, Playwright desktop smoke. 남은 확인: AKW-05 target workspace routing 이후 실제 active run drawer reopen smoke.
- 2026-06-22: Markdown checkbox marker를 `completionCriteriaItems`와 `validationItems`로 구조화해 API 응답에 보존하고, ticket detail의 완료 기준/검증 섹션에서 checked/unchecked 상태로 렌더링되게 수정했다.
- 2026-06-22: AKW-09 완료 기준 checkbox를 구현 완료 상태에 맞게 checked로 갱신했다. 티켓은 `IN_PROGRESS 75%` 유지하며, 남은 항목은 실제 active run 기반 drawer reopen smoke다.
- 2026-06-22: 샘플 티켓 run에서 새로고침 후 running 상태 추적과 종료 후 succeeded 전환을 확인했다. `examples/sample_tickets.md` 변경은 smoke 후 reset했으며, AKW-09를 DONE 처리했다.

### AKW-10. 외부 Markdown 변경 감지와 UI refresh/stale 정책 구현

Status: TODO
Progress: 0%
Repository:

- `apps/server`
- `apps/web`
- `packages/shared`

Priority: P0
Type: Feature / API / UX
Depends on:

- `AKW-03`
- `AKW-04`

목표:

- UI 밖의 Codex CLI, Cursor, editor가 Markdown 파일을 직접 수정해도 Alpha Kanban이 변경을 감지하고 board/detail을 갱신하거나 stale 상태를 표시한다.

현재 문제:

- 현재 UI는 app 내부 mutation에는 query invalidation/refetch를 수행하지만, 외부 process가 `.md` 파일을 수정하면 자동 갱신되지 않는다.
- 사용자는 CLI가 문서를 수정했는지 확인하려면 새로고침해야 한다.
- 오래된 화면에서 status/progress를 저장하면 stale write guard가 막기는 하지만, 변경 사실을 미리 알려주지 않는다.

구현 범위:

- selected workspace의 configured doc roots에 Markdown file watcher를 추가한다.
- watcher는 allowlist 내부 doc roots만 감시한다.
- file changed event를 SSE 또는 websocket으로 UI에 전달한다.
- UI는 현재 selected file 변경 시 query invalidate/refetch 또는 stale banner를 표시한다.
- 사용자가 detail drawer에서 편집 중이면 자동 덮어쓰기 대신 `File changed externally` banner와 `Reload` action을 제공한다.
- window focus regain refetch와 manual refresh button을 fallback으로 둔다.
- `STALE_FILE` 에러 UI와 watcher 기반 stale UI의 메시지를 일관되게 맞춘다.

제외 범위:

- workspace 전체 코드 변경 감시
- Markdown conflict merge editor
- target project Git 자동 commit/pull

완료 기준:

- [ ] 외부 CLI/editor가 selected ticket document를 수정하면 UI가 변경을 감지한다.
- [ ] board/detail query가 자동 refetch되거나 stale banner가 표시된다.
- [ ] detail 편집 중 외부 변경이 생기면 사용자가 reload/keep editing을 판단할 수 있다.
- [ ] watcher는 allowlist/doc roots 밖 파일을 감시하지 않는다.
- [ ] stale write guard와 UI 메시지가 같은 정책을 따른다.

검증:

- [ ] file watcher unit/integration test
- [ ] external Markdown change API/SSE test
- [ ] focus refetch fallback smoke
- [ ] desktop browser stale banner smoke

사용자 지시:

- 2026-06-22: CLI가 Markdown을 갱신했을 때 UI가 자동 갱신되는지, 아니면 새로고침해야 하는지 문제가 있다. 이 문제를 먼저 티켓과 플랜에 반영한다.

진행 메모:

- 2026-06-22: 초안 작성.
