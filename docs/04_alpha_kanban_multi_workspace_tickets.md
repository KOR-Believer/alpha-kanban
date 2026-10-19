# Alpha Kanban Multi Workspace 티켓

> 2026-10-18 적용 상태: 34개 DONE은 과거 구현·검증 이력으로 보존한다. 서버 파일 API·allowlist·Codex runner·채팅·모델 설정은 AKR-01에서 제거했으며 다시 구현할 목록이 아니다. 프로젝트/문서 UI, 정렬, 파서와 ticket-md의 현재 범위는 브라우저 및 문서 중심 티켓으로 이어진다. [기능 구분](21_alpha_kanban_browser_transition_inventory.md)

## Status

- 작성일: 2026-06-22
- 기준 문서: `docs/03_alpha_kanban_multi_workspace_plan.md`
- 목적: Alpha Kanban이 자기 repository docs에 고정되지 않고 사용자가 선택한 target workspace의 plan-ticketing 문서를 탐색, 수정, 실행하도록 확장한다.
- 범위: `alpha-kanban`
- 현재 진행률: `34 / 34 tickets`

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
- Markdown 수정 시 개별 ticket body와 top-level `현재 진행률`을 함께 갱신한다.
- ticket을 `DONE`으로 바꿀 때는 `Progress` 바로 아래에 `Completed at: YYYY-MM-DDTHH:mm:ss+09:00`을 기록하고, non-DONE으로 되돌릴 때는 제거한다. legacy non-DONE 티켓에 값이 남아 있어도 완료 metadata로 취급하지 않는다.
- `사용자 지시`와 `진행 메모`는 append-only log로 다루고, 같은 날짜의 항목 순서는 문서 라인 순서로 해석한다.
- `Run with Codex`는 selected target workspace를 cwd로 사용한다.
- ticket 실행 입력, document-level chat, workspace-level chat은 scope가 다르므로 UI와 prompt boundary를 분리한다.
- chat 입력의 `@w`/`@d`/`@tickets`/`@t:ID` mention은 Alpha Kanban parser가 먼저 정규화하고, Codex prompt에는 normalized scope block으로 전달한다.
- `$plan-ticketing` skill은 raw mention 문법을 직접 파싱하지 않고 Alpha Kanban이 제공한 scope 계약을 신뢰한다.
- `Run with Codex` 입력과 assistant answer는 ticket-scoped chat log로 저장하고, Markdown에는 durable 요약만 append한다.
- read-only answer와 file-edit run은 버튼을 늘리기보다 mode 표시와 prompt/permission boundary로 구분한다.
- workspace-level chat은 티켓이 없는 초기 요구사항을 spec grilling한 뒤 plan/ticket 생성으로 handoff할 수 있어야 한다.
- 자세한 terminal log는 debug affordance로 유지하고, 제품 UX에는 run status indicator를 우선 제공한다.
- 완료/실패 run 결과는 시간 기반으로 사라지지 않고, 사용자가 명시적으로 읽음 처리할 때까지 unread badge로 유지한다.
- 외부 CLI/editor가 Markdown을 직접 수정할 수 있으므로 UI는 file change 감지, stale 표시, refetch 정책을 가져야 한다.
- workspace project는 URL path, selected Markdown document는 query string, ticket detail open state는 hash로 복원 가능한 route state를 유지한다.
- plan/tickets/inventory 문서는 flat file list보다 document set으로 묶어 보여주고, 선택한 문서 type에 따라 Kanban, plan reader, inventory reader view mode를 분리한다.
- `{NN}_{slug}_{plan|tickets|inventory}.md`의 `NN`은 정렬/생성순서 hint일 뿐 관계의 절대 기준이 아니며, 같은 directory의 `slug`와 suffix, 본문 link evidence를 우선한다.
- frontend visual/layout 작업은 `DESIGN-notion.md`를 local design reference로 읽고, Notion 계열 warm canvas, white surface, hairline border, restrained color, aligned internal scroll 규칙을 따른다.

## Ticket Template

새 티켓을 추가할 때는 아래 형식을 따른다.

```md
### AKW-000. Ticket Title

Status: DONE
Progress: 100%
Completed at: 2026-06-23T21:07:28+09:00
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

- 현재 앱은 `alpha-kanban`의 `docs`와 `examples`를 바로 리스팅한다.
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
- 2026-06-23: `alpha-kanban.config.json`을 `workspaceRoots: [".."]`, `defaultDocRoots: ["docs", "examples"]`로 정리해 `/workspace` 아래 project를 dogfooding 대상으로 열 수 있게 했다.
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

### AKW-15. Resizable sidebar와 내부 scroll layout 정리

Status: DONE
Progress: 100%
Repository:

- `apps/web`

Priority: P1
Type: UX / Feature
Depends on:

- `AKW-04`
- `AKW-14`

목표:

- recent workspace path와 ticket document 목록을 읽기 쉽도록 sidebar width를 사용자가 조절할 수 있게 한다.
- desktop app shell을 viewport 높이에 맞추고, sidebar ticket document 목록은 browser 전체 scroll이 아니라 sidebar 내부 scroll로 동작하게 한다.

현재 문제:

- sidebar가 고정 300px 폭이라 recent workspace의 absolute path가 대부분 잘린다.
- app shell이 browser document scroll에 의존하면 sidebar와 board scroll boundary가 명확하지 않다.
- ticket document 목록은 sidebar의 남은 높이를 차지하고 내부에서 스크롤되는 편이 사용자가 구조를 이해하기 쉽다.

구현 범위:

- `apps/web/src/App.tsx`에 sidebar resize handle을 추가한다.
- sidebar width는 280px-560px 범위로 제한하고 기본값은 340px로 둔다.
- width는 browser localStorage에 저장해 새로고침 후에도 유지한다.
- resize handle은 pointer drag, keyboard arrow/Home/End, double-click reset을 지원한다.
- desktop app shell은 `100dvh` 높이와 내부 overflow 구조를 사용한다.
- workspace path는 wrapping과 hover title로 긴 주소를 확인할 수 있게 한다.

제외 범위:

- server-side user preference 저장
- mobile sidebar drag resize
- full workspace settings UI

완료 기준:

- [x] sidebar와 board 사이에 width resize handle이 있다.
- [x] sidebar width가 최소/최대 범위 안에서 조절되고 새로고침 후 유지된다.
- [x] desktop에서 browser document scroll 대신 sidebar list와 board body가 내부 scroll 영역을 가진다.
- [x] 긴 recent workspace path가 sidebar 폭 증가와 wrapping/hover title로 확인 가능하다.

검증:

- [x] `pnpm typecheck`
- [x] `pnpm test`
- [x] `pnpm build`
- [x] desktop browser smoke

사용자 지시:

- 2026-06-23: recent 영역이 있는 sidebar가 너무 좁아서 주소가 다 안 보이니 sidebar와 본문 사이에 width 조절 handle을 넣는 방향을 검토한다.
- 2026-06-23: ticket 목록 영역이 browser 전체 scroll을 차지하기보다 sidebar 전체 높이를 viewport에 맞추고 ticket 목록 내부 scrollbar가 있는 구조가 좋다.
- 2026-06-23: handle 영역 색과 본문 영역 색이 같아 어색하므로 navigation/sidebar 표면에 가까운 색과 border로 구분감을 준다.

진행 메모:

- 2026-06-23: `apps/web/src/App.tsx`에 resizable sidebar shell, persisted width state, resize separator, keyboard resize affordance를 구현했다.
- 2026-06-23: desktop shell을 `100dvh`/internal overflow 구조로 전환하고 sidebar document list와 board body가 각각 내부 scroll을 가지도록 정리했다.
- 2026-06-23: 검증 완료: `pnpm typecheck`, `pnpm test`, `pnpm build`.
- 2026-06-23: in-app browser smoke에서 sidebar/handle 높이가 viewport와 일치하고, drag 후 `420px`로 변경, reload 후 유지, double-click reset 후 `340px` 복귀를 확인했다.
- 2026-06-23: handle surface를 `bg-white`와 `border-neutral-200`로 조정해 본문 배경과 분리했다.
- 2026-06-23: Chrome plugin smoke에서 handle background가 sidebar와 같은 white, main background가 neutral-50, handle border가 neutral-200 계열로 적용됨을 확인했다.

### AKW-16. Notion design reference 주입과 scrollbar gutter 공통 정리

Status: DONE
Progress: 100%
Repository:

- `apps/web`
- `alpha-kanban`

Priority: P1
Type: UX / Design System
Depends on:

- `AKW-15`

목표:

- `DESIGN-notion.md`를 frontend visual/layout 작업의 local design reference로 고정한다.
- app shell의 scrollable region이 같은 scrollbar gutter, thumb weight, edge alignment를 쓰도록 공통 utility를 적용한다.
- sidebar의 project list와 ticket document list scrollbar가 서로 다른 inset에 놓이지 않게 정렬한다.

현재 문제:

- project list와 ticket document list가 각각 다른 padding boundary 안에서 스크롤되어 scrollbar x-position이 어긋난다.
- Notion-like UI 목표가 대화에만 있고 `AGENTS.md`와 CSS token에 명시되지 않아 세션이 길어질수록 일관성이 흔들릴 수 있다.
- modal, board, drawer, preview/log 영역의 scrollbar 스타일이 제각각이다.

구현 범위:

- `AGENTS.md`에 `DESIGN-notion.md`를 UI 작업 전 읽는 design reference로 추가한다.
- `apps/web/src/styles.css`에 Notion 계열 canvas/surface/hairline token과 `ak-scroll-area` utility를 추가한다.
- sidebar project list와 ticket document list를 같은 outer edge에서 스크롤하도록 padding/overflow boundary를 정리한다.
- board body, folder picker list, ticket drawer body, prompt preview, run log에 `ak-scroll-area`를 적용한다.

제외 범위:

- 전체 컴포넌트 visual redesign
- shadcn theme generator 도입
- typography scale 전면 교체

완료 기준:

- [x] `AGENTS.md`가 `DESIGN-notion.md`를 local design-system reference로 지시한다.
- [x] shared scroll utility가 CSS에 존재한다.
- [x] sidebar project list와 ticket document list가 같은 right-edge scrollbox 기준을 사용한다.
- [x] 주요 overflow container가 shared scroll utility를 사용한다.

검증:

- [x] `pnpm typecheck`
- [x] `pnpm test`
- [x] `pnpm build`
- [x] `git diff --check`
- [x] Chrome plugin visual smoke

사용자 지시:

- 2026-06-23: scrollbar 정렬이 엉망이므로 디자인 시스템 룰을 찾아 주입한 뒤 공통 적용하고 시작하는 방향을 검토한다.
- 2026-06-23: `DESIGN-notion.md`를 읽고 항상 지침으로 활용하면 좋겠다.

진행 메모:

- 2026-06-23: `DESIGN-notion.md`를 읽고 Notion 계열 warm canvas, white surface, hairline, restrained accent, app shell row/scroll 원칙을 확인했다.
- 2026-06-23: `AGENTS.md`에 frontend visual/layout 작업 전 `DESIGN-notion.md`를 읽고 `ak-scroll-area` 기반 internal scroll model을 따르도록 추가했다.
- 2026-06-23: `apps/web/src/styles.css`에 design token과 shared scrollbar utility를 추가하고, `apps/web/src/App.tsx`의 주요 overflow container에 공통 적용했다.
- 2026-06-23: sidebar project list의 outer section padding을 제거하고 list scrollbox 자체를 sidebar edge에 맞춰 ticket document list와 scrollbar 기준선을 정렬했다.
- 2026-06-23: 검증 완료: `pnpm typecheck`, `pnpm test`, `pnpm build`, `git diff --check`.
- 2026-06-23: Chrome plugin smoke에서 project list와 ticket document list scrollbox의 right edge delta가 `0px`임을 확인했다.

### AKW-17. Notion design token foundation 정리

Status: DONE
Progress: 100%
Repository:

- `apps/web`

Priority: P1
Type: UX / Design System
Depends on:

- `AKW-16`

목표:

- `DESIGN-notion.md`의 surface, text, radius, shadow, focus token을 `apps/web/src/styles.css`의 reusable CSS variables/utilities로 정리한다.
- 이후 component wrapper와 app layout이 raw `neutral-*` class에 덜 의존하도록 foundation을 마련한다.

현재 문제:

- `styles.css`에는 일부 surface/scroll token만 있고 button, badge, dialog, app shell이 여전히 Tailwind neutral class를 직접 많이 사용한다.
- focus ring, input chrome, row active state, panel surface 같은 반복 스타일이 컴포넌트별로 흩어져 있다.

구현 범위:

- Notion 계열 CSS variables를 확장한다.
- `ak-focus-ring`, `ak-control`, `ak-panel`, `ak-row`, `ak-row-active`, `ak-card`, `ak-muted-label` 같은 utility class를 추가한다.
- 기존 CSS token 이름은 유지해 현재 구현을 깨지 않게 한다.
- design token/theme foundation 변경 시 `AGENTS.md`의 Product UI Design 지침을 같은 변경에서 갱신한다.

제외 범위:

- 기능 로직 변경
- package/theme generator 도입
- dark mode

완료 기준:

- [x] design token과 utility가 `styles.css`에 정리된다.
- [x] app shell과 shadcn wrapper가 foundation utility를 사용할 수 있다.
- [x] `AGENTS.md`가 foundation 유지 규칙을 함께 담는다.
- [x] 기존 build/typecheck가 깨지지 않는다.

검증:

- [x] `pnpm typecheck`
- [x] `pnpm build`

사용자 지시:

- 2026-06-23: 이미 구현된 shadcn 컴포넌트와 tsx 레이아웃을 주입한 디자인 시스템 기준으로 리디자인하고 싶다.
- 2026-06-23: 새 티켓을 추가하고 전부 진행한다.
- 2026-06-23: 디자인 토큰, 테마 foundation을 만들면 그 foundation을 지킬 `AGENTS.md` 파일도 같이 비치해 앞으로 잊지 않도록 한다.

진행 메모:

- 2026-06-23: 티켓 추가.
- 2026-06-23: `apps/web/src/styles.css`에 Notion 계열 CSS variables와 `ak-focus-ring`, `ak-control`, `ak-control-field`, `ak-panel`, `ak-card`, `ak-row`, `ak-row-active`, `ak-muted-label` 등 foundation utility를 추가했다.
- 2026-06-23: `AGENTS.md`에 design token/theme foundation 변경 시 Product UI Design 지침을 같은 변경에서 갱신해야 한다는 규칙을 추가했다.
- 2026-06-23: 검증 완료: `pnpm typecheck`, `pnpm build`.

### AKW-18. shadcn primitive wrapper Notion-like 리디자인

Status: DONE
Progress: 100%
Repository:

- `apps/web`

Priority: P1
Type: UX / Component
Depends on:

- `AKW-17`

목표:

- `Button`, `Badge`, `Dialog` wrapper를 `DESIGN-notion.md`의 utility button, badge pill, modal surface 기준으로 재정리한다.

현재 문제:

- `button.tsx`, `badge.tsx`, `dialog.tsx`가 shadcn default neutral scale에 가까워 local design token을 충분히 쓰지 않는다.
- Dialog footer와 overlay, close button surface가 app shell과 완전히 같은 design language로 묶여 있지 않다.

구현 범위:

- `apps/web/src/components/ui/button.tsx` variants를 Notion-like primary/outline/ghost/icon utility button 기준으로 정리한다.
- `apps/web/src/components/ui/badge.tsx` variants를 pill, muted, outline, success, warning 기준으로 조용한 hairline surface에 맞춘다.
- `apps/web/src/components/ui/dialog.tsx` content, footer, close button, overlay를 tokenized surface/shadow/focus 기준으로 조정한다.

제외 범위:

- 새로운 primitive 추가
- external design dependency 추가
- animation library 변경

완료 기준:

- [x] shadcn wrapper가 `ak-*` foundation utility를 사용한다.
- [x] primary action만 blue structural accent를 사용한다.
- [x] badge/status color가 과하게 구조 색을 점유하지 않는다.

검증:

- [x] `pnpm typecheck`
- [x] Chrome visual smoke

사용자 지시:

- 2026-06-23: 이미 구현된 shadcn 컴포넌트를 주입한 디자인 시스템으로 리디자인한다.

진행 메모:

- 2026-06-23: 티켓 추가.
- 2026-06-23: `Button` wrapper를 Notion-like primary/outline/ghost/default utility button 기준으로 정리했다. 기본 action은 blue primary가 되고 outline/ghost/default는 white surface와 hairline 중심으로 낮췄다.
- 2026-06-23: `Badge` wrapper를 rounded pill, white/warm muted surface, hairline 중심으로 정리했다.
- 2026-06-23: `Dialog` wrapper를 `ak-card-soft`, tokenized overlay/footer/close button 기준으로 정리했다.

### AKW-19. App shell/sidebar/board layout Notion-like 리디자인

Status: DONE
Progress: 100%
Repository:

- `apps/web`

Priority: P1
Type: UX / Layout
Depends on:

- `AKW-17`
- `AKW-18`

목표:

- main app shell, sidebar project switcher, ticket document list, board header, kanban columns/cards를 Notion-like quiet productivity surface로 정리한다.

현재 문제:

- app shell의 surface hierarchy가 일부 개선됐지만, list row active state, board column, ticket card spacing/radius가 아직 제각각이다.
- `App.tsx` 내부에 neutral class가 많이 남아 있어 design-system migration 기준이 흐려진다.

구현 범위:

- app shell background, header, sidebar sections를 design token 기반으로 정리한다.
- workspace/project row, file row, empty/loading state를 shared row/card utility 기준으로 정리한다.
- kanban column과 ticket card를 hairline + warm canvas + white surface 계층으로 조정한다.
- text hierarchy를 compact product UI 기준으로 맞춘다.

제외 범위:

- board drag-and-drop
- column virtualization
- route 구조 변경

완료 기준:

- [x] sidebar list row와 board card가 같은 row/card language를 공유한다.
- [x] nested-card처럼 보이는 과한 composition이 줄어든다.
- [x] desktop/mobile viewport에서 텍스트 겹침이 없다.

검증:

- [x] `pnpm typecheck`
- [x] Chrome desktop visual smoke
- [x] mobile-width visual smoke

사용자 지시:

- 2026-06-23: 나머지 tsx 파일의 레이아웃을 주입한 디자인 시스템으로 리디자인한다.

진행 메모:

- 2026-06-23: 티켓 추가.
- 2026-06-23: app shell, sidebar header, ticket document rows, project rows, workspace picker rows를 `ak-row`, `ak-row-active`, `ak-control`, `ak-muted-label` 중심으로 정리했다.
- 2026-06-23: board header/body, kanban columns, empty states, ticket cards를 `ak-panel`, `ak-panel-muted`, `ak-card` 계층으로 정리했다.
- 2026-06-23: Chrome desktop smoke에서 design token, header/sidebar/board surface, scrollbar edge alignment, board/ticket card rendering을 확인했다.
- 2026-06-23: Playwright mobile-width smoke `390x844`에서 document horizontal overflow가 없고 resize handle이 숨겨지며 board는 내부 horizontal scroll 영역에 유지됨을 확인했다.

### AKW-20. Drawer/dialog/form/run panel Notion-like 리디자인

Status: DONE
Progress: 100%
Repository:

- `apps/web`

Priority: P1
Type: UX / Layout
Depends on:

- `AKW-17`
- `AKW-18`
- `AKW-19`

목표:

- ticket detail drawer, forms, checklist/progress sections, prompt preview, run log panel, folder picker dialog를 같은 design token 기준으로 정리한다.

현재 문제:

- drawer와 run/debug panel은 기능 구현 과정에서 생긴 panel/card 조합이 남아 있어 app shell보다 무겁게 보인다.
- select/input/textarea/pre/log surface가 각자 다른 neutral treatment를 사용한다.

구현 범위:

- drawer header/body/footer surface와 internal sections를 tokenized utility 기준으로 정리한다.
- select/input/textarea/pre/log style을 shared control/panel/card utility로 맞춘다.
- folder picker dialog의 roots/list/table header/footer를 Dialog primitive migration과 맞춘다.

제외 범위:

- Codex runner API 구현
- log streaming 구조 변경
- Markdown parser 변경

완료 기준:

- [x] drawer와 dialog가 같은 modal/panel surface language를 공유한다.
- [x] forms와 preview/log panel이 Notion-like quiet utility chrome을 사용한다.
- [x] drawer 내부 text/button/control overlap이 없다.

검증:

- [x] `pnpm typecheck`
- [x] Chrome drawer/dialog visual smoke

사용자 지시:

- 2026-06-23: 이미 구현된 shadcn 컴포넌트와 tsx 레이아웃을 주입한 디자인 시스템 기준으로 전부 진행한다.

진행 메모:

- 2026-06-23: 티켓 추가.
- 2026-06-23: ticket detail drawer overlay/surface/header/body/forms를 hairline/white surface/foundation control 기준으로 정리했다.
- 2026-06-23: prompt preview, run log, canonical sections, timeline entries, checkbox accent를 foundation utility와 primary accent 기준으로 정리했다.
- 2026-06-23: Chrome smoke에서 drawer title, select, textarea, dialog content, folder picker list surface가 정상 렌더링됨을 확인했다.

### AKW-21. Design migration 통합 검증과 문서 정리

Status: DONE
Progress: 100%
Repository:

- `apps/web`
- `alpha-kanban`

Priority: P1
Type: Test / Documentation
Depends on:

- `AKW-17`
- `AKW-18`
- `AKW-19`
- `AKW-20`

목표:

- Notion design-system migration이 build/test와 Chrome visual smoke를 통과하고, plan/ticket 문서에 실제 상태가 남게 한다.

현재 문제:

- 전역 visual migration은 작은 기능 변경보다 회귀 범위가 넓어 desktop/mobile/interactive surface smoke가 별도로 필요하다.
- `DESIGN-notion.md`가 untracked 상태이므로 design reference를 commit 대상 문서로 포함할지 확인이 필요하다.

구현 범위:

- `pnpm typecheck`, `pnpm test`, `pnpm build`, `git diff --check`를 실행한다.
- Chrome plugin으로 desktop app shell, sidebar scroll, board, detail drawer, folder picker dialog를 확인한다.
- 변경된 design reference와 ticket progress를 문서에 반영한다.

제외 범위:

- pixel-perfect Notion clone
- automated screenshot diff infrastructure
- external browser matrix

완료 기준:

- [x] full static verification이 통과한다.
- [x] Chrome visual smoke에서 주요 surface가 비어 있거나 깨져 있지 않다.
- [x] `DESIGN-notion.md`와 `AGENTS.md` 기준이 유지된다.
- [x] Progress Board와 top-level 진행률이 실제 DONE 개수와 일치한다.

검증:

- [x] `pnpm typecheck`
- [x] `pnpm test`
- [x] `pnpm build`
- [x] `git diff --check`
- [x] Chrome visual smoke

사용자 지시:

- 2026-06-23: 새 티켓을 추가하고 전부 진행한다.

진행 메모:

- 2026-06-23: 티켓 추가.
- 2026-06-23: static verification을 완료했고 Chrome desktop smoke와 Playwright mobile-width smoke를 수행했다.
- 2026-06-23: `DESIGN-notion.md`는 design reference로 유지하며, `AGENTS.md`에 해당 reference와 foundation 유지 규칙을 명시했다.

### AKW-22. Spacing, radius, scrollbar gutter rhythm 보정

Status: DONE
Progress: 100%
Repository:

- `apps/web`
- `alpha-kanban`

Priority: P1
Type: UX / Design System / Documentation
Depends on:

- `AKW-17`
- `AKW-18`
- `AKW-19`
- `AKW-20`
- `AKW-21`

목표:

- 디자인 토큰을 만들었더라도 실제 TSX 적용부에서 padding, radius, scrollbar gutter rhythm이 흔들리지 않도록 공통 utility와 AGENTS 규칙으로 보강한다.

현재 문제:

- sidebar의 recent workspace list와 ticket document list가 서로 다른 scroll container padding을 사용해 scrollbar와 row content 사이 gap이 다르게 보인다.
- ticket detail side panel의 close button이 header padding과 hit area 때문에 시각적으로 오른쪽/상단 rhythm이 어긋나 보인다.
- 반복되는 spacing/radius 판단이 개별 Tailwind class에 흩어지면 agent가 작성한 CSS 특유의 미세한 불일치가 다시 누적될 수 있다.

구현 범위:

- `styles.css`에 `--ak-space-*` spacing token과 sidebar scroll/drawer alignment utility를 추가한다.
- sidebar project list와 ticket document list의 scroll container edge를 맞추고 padding은 shared inner wrapper로 이동한다.
- workspace row와 ticket row의 horizontal padding rhythm을 맞춘다.
- ticket detail drawer header/body/close button을 `ak-drawer-*` utility로 정리한다.
- AGENTS.md에 spacing/radius/scroll wrapper/drawer utility 사용 규칙을 추가한다.

제외 범위:

- 전체 화면 pixel-perfect redesign
- screenshot diff infrastructure
- 남은 TODO 티켓의 feature UI 구현

완료 기준:

- [x] recent workspace list와 ticket document list의 scrollbar outer edge가 같은 sidebar edge에 정렬된다.
- [x] 두 list 모두 content padding이 shared inner wrapper 규칙을 따른다.
- [x] drawer close button이 panel header padding rhythm 안에서 별도 action affordance로 정렬된다.
- [x] AGENTS.md에 spacing/radius utility 사용 규칙이 남는다.

검증:

- [x] `pnpm typecheck`
- [x] `pnpm build`
- [x] Chrome visual smoke

사용자 지시:

- 2026-06-23: padding이나 rounded 사용 통일성이 아직 아쉽다. 사이드바 recent 목록과 ticket 목록은 scrollbar와 content 사이 gap이 다를 이유가 없고, ticket side panel close button 위치도 padding 때문에 시각적으로 불쾌하다.
- 2026-06-23: 디자인 토큰/테마 파운데이션을 만들면 그 파운데이션을 지킬 AGENTS.md 파일도 같이 비치해야 한다.

진행 메모:

- 2026-06-23: 티켓 추가.
- 2026-06-23: `styles.css`에 spacing token, shared scroll content wrapper, drawer header/body/close utility를 추가했다.
- 2026-06-23: sidebar project list와 ticket document list를 같은 outer scroll edge와 inner padding model로 맞췄고, drawer close button을 `iconSm` + absolute action rail로 정리했다.
- 2026-06-23: AGENTS.md에 spacing/radius/scroll wrapper/drawer utility 유지 규칙을 추가했다.
- 2026-06-23: Chrome smoke에서 project/ticket scrollbox right-edge delta `0px`, scroll container padding `0px`, inner wrapper padding `8px`, drawer close top/right inset `16px`를 확인했다.

### AKW-23. Ticket detail side panel resize와 modal/side preference

Status: DONE
Progress: 100%
Repository:

- `apps/web`
- `alpha-kanban`

Priority: P1
Type: UX / Feature / Design System
Depends on:

- `AKW-20`
- `AKW-22`

목표:

- ticket detail을 Notion-like 방식으로 side panel 또는 centered modal로 전환할 수 있게 하고, 사용자의 마지막 선택과 side panel 폭을 localStorage에 기억한다.

현재 문제:

- ticket detail side panel 폭이 고정되어 긴 티켓을 읽거나 실행 draft를 작성할 때 사용자가 작업 환경에 맞춰 조절할 수 없다.
- side panel만 지원하면 Notion처럼 집중해서 읽는 modal workflow와 board를 보며 훑는 side workflow를 선택할 수 없다.
- presentation preference가 저장되지 않으면 매번 같은 토글을 반복해야 한다.

구현 범위:

- `TicketDetailDrawer`에 `side` / `modal` presentation mode를 추가한다.
- header action rail에 side/modal toggle button과 close button을 배치한다.
- side mode에 desktop resize handle을 추가하고 drag, keyboard resize, double-click reset을 지원한다.
- `alpha-kanban.ticketDetailMode`, `alpha-kanban.ticketDetailWidth` localStorage key로 마지막 mode와 width를 저장한다.
- `AGENTS.md`에 drawer presentation preference 유지 규칙을 추가한다.

제외 범위:

- server-side user preference 저장
- multi-device sync
- mobile 전용 fullscreen sheet redesign

완료 기준:

- [x] side mode에서 ticket detail panel 폭을 resize할 수 있다.
- [x] modal mode와 side mode를 header action으로 전환할 수 있다.
- [x] 선택한 mode와 side panel width가 localStorage에 저장된다.
- [x] drawer header action rail이 `ak-drawer-*` padding rhythm을 유지한다.
- [x] AGENTS.md에 관련 유지 규칙이 남는다.

검증:

- [x] `pnpm typecheck`
- [x] `pnpm build`
- [x] `pnpm test`
- [x] Chrome visual/interaction smoke

사용자 지시:

- 2026-06-23: side ticket panel도 resize handle이 있었으면 좋겠고, Notion처럼 modal과 side panel을 localStorage 레벨에서 기억하고 토글 가능하면 좋겠다.

진행 메모:

- 2026-06-23: 티켓 추가.
- 2026-06-23: `TicketDetailDrawer`에 localStorage-backed `side`/`modal` mode와 side width state를 추가하고, side panel resize handle을 구현했다.
- 2026-06-23: header action rail에 modal/side toggle과 close button을 배치했고, `AGENTS.md`에 유지 규칙을 추가했다.
- 2026-06-23: Chrome smoke에서 side resize handle, modal toggle, reload 후 modal 복원, side 복귀 후 resized width 유지(`520px -> 639px`)를 확인했다.
- 2026-06-23: `pnpm typecheck`, `pnpm build`, `pnpm test`, `git diff --check` 통과를 확인했다.

### AKW-05. Codex runner를 target workspace cwd/session 기준으로 라우팅

Status: DONE
Progress: 100%
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

- [x] preview prompt가 selected target workspace root를 표시한다.
- [x] mocked Codex process cwd가 selected target workspace로 설정된다.
- [x] 같은 ticket path라도 workspace가 다르면 session id가 분리된다.
- [x] run instruction summary가 target ticket의 `사용자 지시`에 append된다.
- [x] Codex stdin EOF 대기 방지 옵션이 유지된다.

검증:

- [x] mocked process integration test
- [x] workspace-scoped session resume test
- [x] prompt preview smoke

사용자 지시:

- 2026-06-22: UI에서 입력한 Run with Codex 지시는 selected project에서 수행되어야 한다.
- 2026-06-23: Hashline 도입 검토는 보류하고, 기존 카드 중 적절한 작업으로 돌아가 진행한다.
- 2026-06-23: AKW-05를 진행한다.

진행 메모:

- 2026-06-22: 초안 작성.
- 2026-06-23: `CodexRunner`가 target workspace `MarkdownFileStore`를 기준으로 prompt root, ticket/plan absolute path, `spawn` cwd를 구성하도록 변경했다. Session state key는 target `workspaceId::fileRelativePath` 단위를 사용하고, run log metadata에 workspace id/root와 target ticket path를 기록한다.
- 2026-06-23: 서버에 `POST /api/workspaces/:workspaceId/codex/prompt-preview`, `POST /api/workspaces/:workspaceId/codex/runs`, `GET /api/workspaces/:workspaceId/files/:fileId/codex-run-summary`를 추가했다. Global run detail/event/cancel/read route는 run id로 scoped runner를 찾아 기존 UI polling/SSE와 연결된다.
- 2026-06-23: `apps/web/src/App.tsx`의 Run with Codex preview/run/summary 호출을 selected workspace route로 전환하고, AKW-05 전용 비활성화 문구를 제거했다.
- 2026-06-23: mocked Codex API test에서 selected workspace prompt path, process cwd, target ticket instruction append, workspace별 session resume 분리를 검증했다.
- 2026-06-23: `dodge-web`처럼 target workspace root가 git repository가 아닌 경우 Codex CLI가 `Not inside a trusted directory and --skip-git-repo-check was not specified.`로 실패하는 것을 확인했다. Runner preview/run args 생성 시 `git rev-parse --is-inside-work-tree`가 실패하면 `--skip-git-repo-check`를 추가하도록 보정했고, non-git workspace와 resume preview assertion을 서버 테스트에 반영했다.
- 2026-06-23: Codex CLI preflight 실패가 나도 `사용자 지시`가 먼저 append되어 실행되지 않은 지시가 ticket Markdown에 남는 문제를 확인했다. Ticket run instruction append를 `startRun()` 시점에서 Codex `session id` 관측 이후 finish 처리 시점으로 늦겨, session 시작 전 실패는 Markdown에 사용자 지시를 남기지 않도록 변경했다. 같은 최신 지시가 이미 남아 있으면 중복 append하지 않는 guard도 유지한다.
- 2026-06-23: 검증 완료: `pnpm --filter @alpha-kanban/server test`, `pnpm typecheck`, `pnpm build`, `pnpm test`, `git diff --check`. Chrome smoke에서 `04_alpha_kanban_multi_workspace_tickets.md`의 AKW-05 drawer preview가 target workspace root, ticket file, plan file, 실행 지시 요약을 표시하고 비활성화 안내가 사라졌음을 확인했다.

### AKW-06. Multi-workspace 통합 검증 및 운영 문서 정리

Status: DONE
Progress: 100%
Completed at: 2026-06-26T15:08:39+09:00
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
- `AKW-15`
- `AKW-16`
- `AKW-17`
- `AKW-18`
- `AKW-19`
- `AKW-20`
- `AKW-21`
- `AKW-22`
- `AKW-23`
- `AKW-24`
- `AKW-25`
- `AKW-26`

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
- ticket body와 top-level 진행률의 canonical 관계를 정리하고 legacy Progress Board 무시/호환 기준을 문서화한다.
- manual smoke checklist를 업데이트한다.
- 기존 `docs/01`, `docs/02`는 MVP 완료 기록으로 유지하고 새 phase 문서를 현재 상태로 갱신한다.

제외 범위:

- 모든 기존 docs migration
- 외부 project의 실제 Codex run 강제 수행
- release packaging

완료 기준:

- [x] `pnpm typecheck`가 통과한다.
- [x] `pnpm test`가 통과한다.
- [x] `pnpm build`가 통과한다.
- [x] 브라우저 smoke에서 project switcher, file list, ticket detail, prompt preview가 동작한다.
- [x] 브라우저 smoke에서 document chat과 workspace chat entry가 scope에 맞게 동작한다.
- [x] 브라우저 smoke에서 run status indicator와 external file change refresh/stale UI가 동작한다.
- [x] 브라우저 smoke에서 unread run result badge와 mark-read flow가 동작한다.
- [x] legacy Progress Board가 있어도 UI/API가 ticket body를 canonical source로 사용하고 안전하게 무시한다.
- [x] README와 티켓 문서가 실제 구현 상태와 일치한다.

검증:

- [x] automated test suite
- [x] desktop browser smoke
- [x] document/workspace chat smoke
- [x] run status indicator smoke
- [x] run result read state smoke
- [x] external Markdown change smoke
- [x] manual checklist

사용자 지시:

- 2026-06-22: 샘플 fixture와 실제 제품 진행률은 구분하고, 새 phase는 별도 티켓으로 추적한다.
- 2026-06-23: Progress Board 운영이 현재 UI에서 얼마나 유효한지, ticket body와 어떤 canonical 관계를 가져야 하는지 검토한다.
- 2026-06-23: Progress Board를 스킬에서 제거하고, UI/API도 없는 것처럼 취급하며, legacy 문서에 섹션이 남아 있어도 parser가 안전하게 무시하도록 한다.
- 2026-06-23: `Completed at: 2026-06-23T15:42:31+09:00` 같은 DONE 완료 시각 필드도 `$plan-ticketing` skill과 Alpha Kanban parser/writer에 반영한다.
- 2026-06-26: AKW-31 완료 후 multi-workspace 통합 검증 티켓의 남은 범위를 현재 구현 상태에 맞게 정리한다.
- 2026-06-26: 그동안 실제로 사용해 본 결과를 기준으로 남은 비주얼/수동 smoke를 통과로 간주한다.

진행 메모:

- 2026-06-22: 초안 작성.
- 2026-06-23: Progress Board 정합성 점검 중 body가 완료 기준 미충족 상태인데 `DONE`/`100%`로 표시된 것을 확인했다. 미완료 의존 티켓과 체크리스트 상태에 맞춰 `TODO`/`0%`로 보정했다.
- 2026-06-23: 운영 판단: 현재 UI의 kanban grouping과 상세 표시는 개별 ticket body를 canonical source로 보고, Progress Board는 새 문서에서는 생성하지 않는 legacy 섹션으로 취급한다. 상태 변경 API는 ticket body와 top-level `현재 진행률`만 갱신하고 legacy Progress Board가 남아 있어도 무시하는 방향으로 전환한다.
- 2026-06-23: `$plan-ticketing` skill의 Ticket Document Shape, tickets template, canonical pattern에서 Progress Board 생성을 제거했다. Alpha Kanban parser/writer는 Progress Board section을 필수로 요구하지 않고 public API schema에서도 `progressBoard`를 제거했으며, legacy section이 남아 있어도 ticket body와 top-level 진행률만 갱신하도록 바꿨다. 현재 `docs/04_alpha_kanban_multi_workspace_tickets.md`에서도 Progress Board section을 제거했다.
- 2026-06-23: 누락됐던 `Completed at` 정책을 `$plan-ticketing` skill, tickets template, canonical pattern, Alpha Kanban shared schema, Markdown parser/writer, Codex runner prompt에 반영했다. writer는 DONE 전환 시 완료 시각을 자동 삽입하고, 기존 값은 보존하며, non-DONE으로 재오픈하면 제거한다. parser는 `Status: DONE`일 때만 `completedAt`을 public API에 노출하고, WebUI DONE column은 모든 DONE 티켓에 유효한 `completedAt`이 있을 때 완료 시각 내림차순으로 정렬한다.
- 2026-06-24: AKW-06은 AKW-10, AKW-26 등 미완료 의존성을 포함한 통합 검증 티켓이므로 `IN_PROGRESS`/`75%` 표시는 실제 완료 기준과 맞지 않아 `TODO`/`0%`로 되돌렸다. 개별 기능 티켓 완료 상태는 각 티켓 본문을 canonical source로 본다.
- 2026-06-24: 모든 AKW-06 의존 티켓이 ticket body 기준 `DONE`임을 확인했다. README의 config, document set, workspace chat, Run with Codex, stale/external Markdown change, manual smoke checklist 설명을 현재 multi-workspace 구현 상태에 맞게 갱신했다.
- 2026-06-24: 검증 완료: `pnpm typecheck`, 비-API 서버 테스트 24개(`config`, `codexRunner`, `codexChat`, `codexModels`, `codexState`, `scopeResolver`, `ticketMarkdown`), `pnpm build`, `git diff --check`, `git diff --cached --check`. `pnpm build`는 기존 Vite chunk-size warning만 표시하고 성공했다.
- 2026-06-24: 남은 검증: 현재 Codex sandbox에서 `127.0.0.1` listen이 `EPERM`으로 차단되어 `api.test.ts`, dev server 기반 desktop/mobile browser smoke, document/workspace chat smoke, run status/read-state smoke, external Markdown change smoke는 실행하지 못했다. 순수 Node HTTP listen 최소 재현도 `listen EPERM: operation not permitted 127.0.0.1`로 실패한다.
- 2026-06-26: 현재 세션에서 pnpm test가 통과했다. 결과: shared는 테스트 없음으로 통과, web 2 files/7 tests 통과, server 8 files/54 tests 통과. AKW-31까지 포함한 code-level 검증은 갱신됐고, 남은 범위는 desktop visual smoke와 chat/run 상태 UX 수동 확인이다.
- 2026-06-26: 사용자 dogfooding 결과를 기준으로 project switcher, file list, ticket detail, prompt preview, document/workspace chat entry, run status indicator, external file change stale/refresh, unread run result badge/mark-read flow를 수동 smoke 통과로 정리했다. automated test suite도 통과했으므로 multi-workspace 통합 검증 티켓을 DONE으로 닫는다.

### AKW-24. Ticket-scoped chat log 저장 모델 구현

Status: DONE
Progress: 100%
Repository:

- `apps/server`
- `apps/web`
- `packages/shared`

Priority: P1
Type: Feature / Data Model / UX
Depends on:

- `AKW-05`
- `AKW-09`
- `AKW-11`

목표:

- `Run with Codex` 입력과 assistant answer를 ticket 단위 Q/A chat log로 저장한다.
- ticket Markdown에는 긴 대화 원문을 넣지 않고, durable 요약만 `사용자 지시`와 `진행 메모`에 남긴다.

현재 문제:

- 현재 `Run with Codex`는 실행 지시 summary와 진행 메모만 Markdown에 남긴다.
- Codex 채팅창처럼 길고 맥락 있는 답변을 WebUI ticket drawer 안에서 볼 수 있는 저장 surface가 없다.
- 질문형 run과 구현형 run 모두 assistant answer가 있어야 하지만, 현재 UI는 run event/log와 badge 중심이다.
- Markdown에 모든 Q/A를 append하면 plan-ticketing 문서가 과도하게 커질 수 있다.
- 서버 wrapper가 자동 append하는 `Codex run succeeded. ... Log: ...` 형식의 기계적 성공 메모는 사람이 읽는 진행 메모로는 가치가 낮고, run summary/raw log/chat log와 중복된다.

구현 범위:

- control app local state 아래 ticket chat log 저장소를 추가한다. 예: `.alpha-kanban/chats/{workspaceId}/{fileKey}/{ticketId}.jsonl`.
- chat scope key는 `workspaceId + ticketFileRelativePath + ticketId` 조합으로 정의해 다른 workspace/document의 같은 ticket id 충돌을 막는다.
- shared schema에 chat message, role, content format, createdAt, runId, scope metadata를 추가한다.
- `Run with Codex` 시작 시 execution draft 원문을 `role: "user"` message로 저장한다.
- Codex run 종료 시 assistant markdown answer를 `role: "assistant"` message로 저장한다.
- ticket drawer에 최근 ticket chat messages를 Markdown 렌더링으로 표시한다.
- run summary, unread state, chat message가 같은 runId로 연결되게 한다.
- raw `.alpha-kanban/runs/{runId}.jsonl`은 prompt, command output, stderr, file change, final answer를 담는 디버그/감사용 원본으로 유지한다.
- run status와 logPath는 run summary가 보존하고, 사람이 읽는 최종 답변은 chat log가 보존한다.
- successful wrapper result note는 ticket Markdown `진행 메모`에 자동 append하지 않는다.
- 실패, auth-required, cancel처럼 사용자가 놓치면 안 되는 run outcome만 ticket `진행 메모`에 짧게 append할지 정책화한다.
- 진행 메모에는 Codex가 직접 판단한 작업 결과 요약만 남기고, 긴 assistant answer와 기계적 성공 문구는 chat log/run summary에 둔다.

제외 범위:

- document-level chat UI 구현
- workspace-level chat UI 구현
- 원격 sync 또는 multi-user shared chat
- target project repository에 chat log 저장

완료 기준:

- [x] `Run with Codex` execution draft가 ticket-scoped `role: "user"` message로 저장된다.
- [x] Codex final answer가 `role: "assistant"`, `contentFormat: "markdown"` message로 저장된다.
- [x] ticket drawer에서 같은 ticket의 Q/A history를 볼 수 있다.
- [x] 같은 ticket id라도 workspace나 ticket file이 다르면 chat log가 분리된다.
- [x] Markdown ticket 문서에는 긴 Q/A 원문이 자동 append되지 않는다.
- [x] 성공 run의 wrapper result note가 Markdown `진행 메모`에 자동 append되지 않는다.
- [x] run status/logPath는 run summary 또는 raw run log 참조로 확인할 수 있다.

검증:

- [x] chat log store unit test
- [x] workspace/file/ticket scoped key collision test
- [x] Codex run to chat message API integration test
- [x] ticket drawer Markdown answer rendering smoke

사용자 지시:

- 2026-06-23: `Run with Codex`의 `Execution draft`는 사실상 `role: "user"` 메시지이고, 질문과 응답을 ticket별 chat log로 저장하는 방향이 좋아 보인다.
- 2026-06-23: assistant answer는 Markdown으로 저장해 Codex 답변처럼 예쁘게 렌더링되면 좋겠다.
- 2026-06-23: 모든 `Run with Codex` 질문과 응답을 저장하되, Markdown에는 durable 요약만 남기는 구조를 검토한다.
- 2026-06-23: `Codex run succeeded. ... Log: ...` 같은 wrapper 성공 메모는 Markdown `진행 메모`에서 제외하고, run status/logPath는 run summary/raw log에 보존하는 쪽이 맞다.
- 2026-06-23: AKW-24 구현을 진행한다.

진행 메모:

- 2026-06-23: 초안 작성.
- 2026-06-23: `packages/shared`에 `CodexChatMessage`/`CodexTicketChatResponse` schema를 추가하고, `apps/server/src/codexChat.ts`에 control app `.alpha-kanban/chats/{workspaceId}/{fileKey}/{ticketId}.jsonl` 기반 ticket chat store를 구현했다.
- 2026-06-23: `CodexRunner`가 run 시작 시 execution draft를 `role: "user"` message로 저장하고, Codex JSON event의 마지막 assistant answer를 `role: "assistant"`, `contentFormat: "markdown"` message로 저장하도록 연결했다. 성공 wrapper result note는 더 이상 ticket Markdown `진행 메모`에 자동 append하지 않고, 실패/cancel/auth-required 계열 outcome만 짧은 progress note 후보로 유지한다.
- 2026-06-23: `GET /api/workspaces/:workspaceId/files/:fileId/tickets/:ticketId/chat`와 legacy `GET /api/files/:fileId/tickets/:ticketId/chat` route를 추가했다. API 통합 테스트에서 workspace/file/ticket key 분리, user/assistant message 저장, 성공 wrapper note 미생성을 검증했다.
- 2026-06-23: `apps/web`에 `react-markdown`/`remark-gfm`을 추가하고, ticket drawer `Run with Codex` 영역에 `Ticket chat` history를 Markdown 렌더링으로 표시했다.
- 2026-06-23: 검증 완료: `pnpm --filter @alpha-kanban/server test`, `pnpm typecheck`, `pnpm build`, `pnpm test`, Chrome smoke. Chrome smoke에서는 local chat fixture로 AKW-24 drawer의 user/assistant message와 Markdown bullet/inline code 렌더링을 확인했고 fixture는 제거했다. `pnpm build`는 Markdown renderer 추가로 bundle size warning을 표시하지만 build는 통과했다.

### AKW-25. Run with Codex read-only/edit mode 정책 구현

Status: DONE
Progress: 100%
Repository:

- `apps/server`
- `apps/web`
- `packages/shared`

Priority: P1
Type: Feature / Policy / UX
Depends on:

- `AKW-05`
- `AKW-24`

목표:

- `Run with Codex` 버튼은 하나로 유지하되, 사용자가 read-only answer인지 file edit run인지 의사표시할 수 있게 한다.
- read-only mode에서는 답변만 저장하고, file edit mode에서는 현재처럼 파일 수정과 plan-ticketing 문서 기록을 허용한다.

현재 문제:

- "이 티켓 실제 커밋까지 끝났는지 추적해줘" 같은 요청은 구현 실행보다 조사/답변에 가깝다.
- 현재 실행 model은 모든 `Run with Codex`를 edit-capable implementation run으로 취급한다.
- 버튼을 `Ask`, `Run`, `Preview`로 늘리면 사용자가 기능 차이를 이해하기 어려울 수 있다.

구현 범위:

- ticket drawer composer에 `Allow file edits` 또는 `Read-only answer / Edit files` mode control을 추가한다.
- 기본값은 ticket drawer의 제품 목적에 맞춰 `Edit files`로 두되, 사용자가 run 전 바꿀 수 있게 한다.
- read-only mode prompt에는 파일 수정 금지, Markdown append 금지, 최종 Markdown 답변만 출력 정책을 명시한다.
- read-only mode에서는 `사용자 지시`와 `진행 메모` 자동 append를 기본적으로 수행하지 않는다.
- edit mode에서는 기존처럼 실행 지시 summary를 `사용자 지시`에 append하고, 결과 요약을 `진행 메모`에 append한다.
- 두 mode 모두 AKW-24 chat log에는 user message와 assistant answer를 저장한다.
- 서버 레벨 read-only guard 또는 sandbox 제한 가능성은 설계에 남기되, MVP는 prompt policy와 post-run diff detection으로 시작한다.

제외 범위:

- 별도 `Ask` 버튼 추가
- 완전한 OS/filesystem sandbox 구현
- Codex CLI 권한 모델 변경
- read-only mode에서 외부 도구의 모든 side effect를 100% 강제 차단

완료 기준:

- [x] `Run with Codex` 버튼은 하나로 유지된다.
- [x] run 시작 전 read-only/edit mode를 명확히 선택하거나 확인할 수 있다.
- [x] read-only mode prompt가 파일 수정과 Markdown append 금지를 명시한다.
- [x] read-only mode 결과는 chat log에 저장되고 ticket Markdown은 자동 변경되지 않는다.
- [x] edit mode는 기존 `사용자 지시`/`진행 메모` append 정책을 유지한다.

검증:

- [x] prompt builder mode unit test
- [x] read-only mode no-append API integration test
- [x] edit mode existing append regression test
- [x] ticket drawer mode control smoke

사용자 지시:

- 2026-06-23: 버튼은 하나로 두고 read-only 의사표시만 하는 방식이 좋다.
- 2026-06-23: read-only와 file edit의 차이는 CLI의 다른 기능이라기보다 우리가 보내는 prompt 계약과 권한 boundary 차이로 보면 된다.
- 2026-06-23: Codex 실행 지시: 진행
- 2026-06-23: detail modal 상태에서 read-only/edit mode를 토글하면 빈 modal 또는 빈 화면처럼 보이는 문제가 재현된다.

진행 메모:

- 2026-06-23: 초안 작성.
- 2026-06-23: WebUI에서 `진행`만 입력한 이전 AKW-25 run은 `packages/shared/src/index.ts`와 `apps/server/src/codexRunner.ts` 일부 변경을 만든 뒤 정상 `exit` 이벤트와 ticket 진행 갱신 없이 끊긴 것으로 확인했다.
- 2026-06-23: `CodexRunMode` shared schema/API response/run summary를 `edit`/`read_only`로 확장했다. `edit`은 기본값이며 기존 사용자 지시 append 정책을 유지하고, `read_only`는 prompt에서 파일 수정과 Markdown append 금지를 명시하며 ticket Markdown 자동 append를 건너뛴다.
- 2026-06-23: `CodexRunner`가 read-only run 전후 `git status --short --untracked-files=all`을 비교해 system event로 남기도록 했다. Run terminal `exit`/`error` 이벤트는 assistant chat 저장과 read-only diff check 이후에 발행해 UI refetch race를 줄였다.
- 2026-06-23: ticket drawer `Run with Codex` 영역에 단일 버튼은 유지하고 `Edit files`/`Read-only` segmented mode control을 추가했다. Preview/run request payload와 preview/log/run signal badge에 mode 표시를 연결했다.
- 2026-06-23: 검증 완료: `pnpm --filter @alpha-kanban/server test`, `pnpm typecheck`, `pnpm test`, `pnpm build`, Chrome smoke. Chrome smoke에서는 AKW-25 drawer 기본 `Edit files`, `Read-only` 전환, read-only prompt preview 문구를 확인했다. `pnpm build`는 기존과 같이 Vite chunk-size warning을 표시하지만 build는 통과했다.
- 2026-06-23: modal/read-only 토글 blank 문제를 확인했다. 원인은 read-only 정책 자체가 아니라 URL `file=` route에서 selected file state가 비어도 렌더/query가 path 기준 파일을 즉시 resolve하지 못하는 문제와 run mode radio id/name이 고정값인 구조였다. `selectedFile`/query/drawer/patch 경로를 resolved file id 기반으로 통일하고, run mode radio group을 ticket별 id/name으로 분리했다.
- 2026-06-23: 추가 원인을 확정했다. detail modal panel의 `overflow-hidden`이 programmatic scroll container가 되어, 화면 아래쪽의 `Read-only` control을 클릭할 때 panel 자체의 `scrollTop`이 이동했고 header/body가 clipped panel 밖으로 밀려 빈 modal처럼 보였다. ticket detail panel을 `overflow-clip`으로 바꿔 panel 자체는 스크롤되지 않고 `.ak-drawer-body`만 스크롤되게 했다. 사용자가 준 direct URL 하나만 Chrome에서 열고 `Read-only`/`Edit files` 토글을 재검증했으며, panel `scrollTop`은 `0`으로 유지되고 modal content가 계속 보임을 확인했다.

### AKW-26. Workspace spec grilling chat과 plan-ticketing handoff 구현

Status: DONE
Progress: 100%
Completed at: 2026-06-23T18:55:27+09:00
Repository:

- `apps/server`
- `apps/web`
- `packages/shared`

Priority: P1
Type: Feature / UX / Workflow
Depends on:

- `AKW-07`
- `AKW-08`
- `AKW-24`
- `AKW-25`

목표:

- 아직 ticket 문서가 없거나 구현 범위가 불명확한 상태에서 workspace 전체를 대상으로 요구사항을 질문하고 정리하는 spec grilling chat을 제공한다.
- 충분히 정리된 논의를 `$plan-ticketing` 기반 plan/ticket 생성 실행으로 handoff한다.

현재 문제:

- `AKW-08`은 workspace-level chat entry와 project-wide 논의 surface를 정의하지만, 요구사항을 질문으로 좁히고 plan/ticket 생성으로 넘기는 구체 workflow가 없다.
- AKW-07/08의 scope parser는 입력 범위와 prompt boundary를 정하지만, "요구사항을 질문으로 구체화한 뒤 plan-ticketing으로 넘기는" 제품 flow는 별도로 필요하다.
- 사용자는 평소 Codex 채팅창에서 요구사항을 왕복 정리한 뒤 plan/ticket 생성을 시키지만, WebUI에는 그 대화와 생성 결과를 workspace scope로 보존할 모델이 없다.
- ticket이 없는 상태에서는 ticket drawer 기반 `Run with Codex`로 시작할 수 없다.

구현 범위:

- workspace chat에 `Spec grilling` mode를 추가한다.
- spec grilling은 AKW-07의 normalized scope block과 AKW-08의 workspace chat entry를 사용한다.
- prompt context에는 selected workspace root, discovered plan/ticket/inventory docs 목록, 최근 선택 문서, 사용자가 입력한 목표를 포함한다.
- spec grilling 기본 mode는 read-only answer로 두고, 파일 생성/수정은 명시적 handoff action에서만 수행한다.
- assistant가 필요한 clarifying questions, 결정 사항, open questions, tentative scope를 Markdown으로 답변하게 한다.
- 사용자가 승인하면 `$plan-ticketing` handoff run을 시작해 새 plan/ticket 문서를 생성하거나 기존 문서에 티켓을 추가한다. 이때 plan-ticketing skill에는 raw `@w`/`@t:` mention이 아니라 Alpha Kanban이 만든 `Resolved scope`/`Target document`/`Mode` block을 전달한다.
- plan-ticketing handoff run은 workspace chat log의 `runId`와 `intent` metadata로 연결한다. 생성된 plan/ticket file path와 ticket ids의 자동 추출은 assistant answer 요약을 우선 사용하고, 별도 structured diff parser는 후속 확장으로 둔다.
- chat log 저장은 AKW-24의 scope model을 확장해 `scope: "workspace"`를 지원한다.

제외 범위:

- workspace 전체 코드 semantic index
- 여러 workspace를 동시에 대상으로 하는 spec grilling
- 외부 issue tracker/Notion sync
- 자동 제품 요구사항 완성 판정
- 생성된 plan/ticket file path와 ticket ids를 diff에서 자동 추출하는 structured parser

완료 기준:

- [x] selected workspace가 있으면 ticket document 선택 없이 spec grilling chat을 시작할 수 있다.
- [x] spec grilling 기본 응답은 Markdown을 수정하지 않는다.
- [x] plan/ticket 생성은 사용자가 명시적으로 실행할 때만 수행된다.
- [x] plan-ticketing handoff prompt는 raw mention이 아니라 normalized scope block을 포함한다.
- [x] plan-ticketing handoff run은 workspace chat log의 `runId`와 `intent` metadata로 연결된다.
- [x] ticket-level run/chat과 workspace-level spec chat의 scope label이 명확히 다르다.

검증:

- [x] workspace chat scope key test
- [x] spec grilling prompt preview/unit test
- [x] plan-ticketing handoff dry-run test
- [x] desktop browser smoke

사용자 지시:

- 2026-06-23: 추후 tickets가 없을 때 하고 싶은 구현을 질문으로 구체화한 다음 plan/ticket 생성을 지시하는 프로젝트 스코프 전체채팅을 넣고 싶다.
- 2026-06-23: workspace-level spec grilling chat 기능이 ticket-level 논의와 별도로 필요하다.
- 2026-06-23: plan-ticketing skill은 `@w`/`@t:` raw mention을 직접 파싱하지 않고 Alpha Kanban이 정규화한 scope 계약을 받는 쪽이 맞다.
- 2026-06-23: AKW-29와 AKW-26의 겹친 범위는 자율적으로 잘 섞어 처리하고 결과만 확인한다.

진행 메모:

- 2026-06-23: 초안 작성.
- 2026-06-23: Progress Board와 개별 ticket body의 상태 불일치를 정리했다. 아직 구현 착수 전이므로 `READY 25%`로 맞춘다.
- 2026-06-23: AKW-26을 AKW-07 scope parser와 AKW-08 workspace chat entry 위에 얹는 spec grilling/plan-ticketing handoff workflow로 재정의했다.
- 2026-06-23: AKW-29가 맡은 fullscreen chat shell과 workspace Codex run/assistant answer 저장은 유지하고, AKW-26은 Workspace Chat intent selector(`Chat`/`Spec`/`Plan/Ticket`), spec grilling read-only prompt, plan-ticketing handoff prompt 계약으로 범위를 정리했다.
- 2026-06-23: `packages/shared`, `apps/server`, `apps/web`에 workspace chat `intent` schema와 message metadata를 추가했다. 서버는 `spec_grilling`을 항상 `read_only`, `plan_ticketing_handoff`를 항상 `edit`로 보정하고, workspace run user/assistant message에 `intent` metadata를 저장한다.
- 2026-06-23: Workspace Chat UI에 목적 segmented control을 추가했다. `Spec` 선택 시 `Read-only locked`/`Ask`, `Plan/Ticket` 선택 시 `Edit files locked`/`Run handoff`가 표시되고, Prompt preview badge에도 intent가 표시된다.
- 2026-06-23: 검증 완료: `pnpm --filter @alpha-kanban/server test`, `pnpm --filter @alpha-kanban/web typecheck`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `git diff --check`, Chrome desktop smoke. Chrome smoke에서 Workspace Chat modal의 `Spec` preview가 `Clarifying questions`/파일 수정 금지 규칙을 포함하고, `Plan/Ticket` preview가 `$plan-ticketing`/`Resolved scope`/`Plan-ticketing handoff` 문구를 포함하며 console error가 없음을 확인했다.

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

### AKW-07. Scope-aware ChatComposer와 mention parser 구현

Status: DONE
Progress: 100%
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
- `AKW-24`
- `AKW-25`

목표:

- Ticket, Document, Workspace scope 입력을 하나의 shared ChatComposer와 ScopeResolver로 처리한다.
- 기존 ticket drawer의 `Run with Codex` 입력에 scope mention parser를 붙여 기본 ticket scope를 유지하면서도 `@t:`, `@d`, `@tickets`, `@w` 같은 명시적 scope override를 해석한다.

현재 문제:

- 기존 `Run with Codex`는 현재 ticket 하나를 전제로 prompt를 구성한다.
- 사용자가 "문서 전체", "workspace 전체", "다른 ticket"을 언급해도 UI/API가 이를 구조화하지 않으면 prompt 품질에 의존하게 된다.
- AKW-07/08/26은 모두 넓은 scope chat 문제를 다루므로, 별도 입력기를 늘리기보다 공통 scope parser와 composer를 먼저 세워야 한다.
- bare ticket id를 자동 scope로 해석하면 "AKW-26 말고 AKW-08부터 할까" 같은 자연어가 잘못 라우팅될 위험이 있다.

구현 범위:

- shared schema에 chat scope resolver 결과를 추가한다. 최소 필드는 `scope`, `targetWorkspaceId`, `targetFileId`, optional `targetTicketId`, `rawMessage`, `cleanedMessage`, `warnings`로 둔다.
- mention parser는 `@w`/`@workspace`, `@d`/`@doc`/`@document`, `@tickets`, `@t:AKW-26`/`@ticket:AKW-26`을 지원한다.
- 티켓번호만 단독으로 등장하는 텍스트는 scope control로 해석하지 않고 자연어로 보존한다.
- UI 진입점이 default scope를 제공한다. Ticket drawer는 `ticket`, document reader/board entry는 `document`, project/sidebar entry는 `workspace`가 기본값이다.
- 기존 ticket drawer `Run with Codex` composer를 shared ChatComposer로 교체하거나 adapter로 감싼다.
- `Run with Codex` preview/run prompt에는 raw mention을 직접 해석시키지 않고 `Resolved scope`, `Target document`, `Target ticket`, `Mode` block을 삽입한다.
- ticket drawer에서는 기본 write target을 현재 ticket으로 유지한다.
- ticket drawer에서 `@t:`와 `@d`/`@tickets`는 허용하되, `@w` edit handoff는 workspace chat/spec grilling으로 전환하거나 명시 확인을 요구한다.
- parser가 해석한 scope chip을 composer 주변에 표시하고, disallowed scope는 조용히 무시하지 않고 사용자에게 안내한다.
- `$plan-ticketing` skill은 raw mention을 직접 파싱하지 않고 Alpha Kanban이 생성한 normalized scope block을 신뢰한다.

제외 범위:

- Workspace Chat entry 자체
- Spec grilling workflow
- workspace 전체 코드 semantic index
- rich chat thread UI redesign
- plan/ticket 생성 handoff 실행

완료 기준:

- [x] `@w`, `@workspace`, `@d`, `@doc`, `@document`, `@tickets`, `@t:ID`, `@ticket:ID`가 구조화된 scope로 파싱된다.
- [x] bare ticket id는 scope override로 파싱되지 않는다.
- [x] 기존 ticket drawer `Run with Codex` 기본 동작은 현재 ticket scope로 유지된다.
- [x] prompt preview에 normalized scope block이 표시된다.
- [x] disallowed scope override는 사용자에게 안내되고 잘못된 write target으로 실행되지 않는다.
- [x] parser 결과와 chat/run log 저장 단위가 일치한다.

검증:

- [x] mention parser unit test
- [x] ticket drawer default scope regression test
- [x] prompt preview normalized scope test
- [x] disallowed scope UI/API test
- [x] desktop browser smoke

사용자 지시:

- 2026-06-22: 카드별 입력뿐 아니라 현재 Markdown 파일 전체를 두고 자유 질문이나 논의를 할 수 있는 전체 입력이 있으면 좋겠다.
- 2026-06-22: document chat은 board 우측 panel에 두는 방향이 좋다.
- 2026-06-23: `@workspace`, `@tickets`, `@ticket:XXX-000` 같은 parser를 도입해 prompt에 자동 삽입할지 검토한다.
- 2026-06-23: 특정 ticket scope 문법은 너무 길지 않게 `@t:AKW-26` 같은 짧은 alias를 허용하고, 티켓번호만 덩그러니 있는 경우는 scope control로 보지 않는 쪽이 안전하다.
- 2026-06-23: 기존 ticket drawer의 `Run with Codex`에도 같은 scope parser를 붙이되, 기본 scope는 현재 ticket으로 유지한다.
- 2026-06-23: raw mention 문법은 plan-ticketing skill이 직접 해석하지 않고 Alpha Kanban parser가 normalized scope block으로 정리해 전달한다.
- 2026-06-23: AKW-07/08은 완전히 별도 채팅창 두 개라기보다 공통 scope-aware chat 기반으로 통합 설계한다.
- 2026-06-23: 진행.
- 2026-06-23: textarea 영역에서 scope token이 Codex 채팅 입력처럼 한 단어 단위로 삭제되면 좋겠다.
- 2026-06-23: textarea keydown 보정보다 Tiptap처럼 DOM 기반 inline token으로 처리한다.
- 2026-06-23: `@` 입력 시 scope/ticket 후보 선택 목록이 추천되면 더 좋다.
- 2026-06-23: `@` 후보 영역은 직접 만든 absolute list보다 shadcn/Radix 기반 surface로 정리하는 게 낫다. 기존 후보 UI는 키보드 navigation, focus 처리, z-index가 허술해 보인다.
- 2026-06-23: `@` 후보 목록에서 키보드 Up/Down 이동 시 active row를 따라 내부 스크롤도 이동해야 한다.
- 2026-06-23: `@` 후보 Popover 영역의 스크롤바도 다른 app scroll region과 같은 디자인 시스템 scrollbar를 따라야 한다.
- 2026-06-23: AKW-07의 ticket body 상태/progress와 Progress Board가 불일치하므로 정합성을 맞춘다.

진행 메모:

- 2026-06-22: 초안 작성.
- 2026-06-23: 기존 Document Chat 티켓을 공통 `ScopeResolver`/`ChatComposer` 기반 티켓으로 재정의했다. Document/Workspace chat surface는 같은 composer를 사용하는 후속 티켓으로 남긴다.
- 2026-06-23: `packages/shared`에 `resolveCodexChatScope`, scope resolution schema, edit/workspace guard helper를 추가했다. `@w`/`@workspace`, `@d`/`@doc`/`@document`, `@tickets`, `@t:ID`/`@ticket:ID`를 파싱하고 bare ticket id는 자연어로 보존한다.
- 2026-06-23: `apps/server` Codex prompt preview/run에 `scopeResolution`을 연결하고 `Resolved scope` prompt block을 삽입했다. edit mode에서 workspace scope는 `CODEX_SCOPE_NOT_ALLOWED`로 차단하며, ticket chat message와 run snapshot에 resolved scope를 남긴다.
- 2026-06-23: `apps/web` ticket drawer `Run with Codex` 입력 아래에 scope chip/warning을 표시했다. `@t:AKW-26`은 ticket scope로 preview되고, `@w`는 edit mode에서 warning과 함께 run button이 비활성화되며 read-only mode에서는 허용된다.
- 2026-06-23: 검증 완료: `pnpm --filter @alpha-kanban/server test`, `pnpm --filter @alpha-kanban/web typecheck`, Chrome smoke. Chrome smoke에서는 AKW-07 direct modal URL에서 `@t:AKW-26` scope chip과 preview prompt의 `Resolved scope`/`Target ticket id: AKW-26`/cleaned message를 확인했고, `@w` edit guard와 read-only 허용 상태를 확인했다. Chrome console error는 없었다.
- 2026-06-23: textarea `Backspace`/`Delete`에서 커서가 scope mention token 내부, token 끝, 또는 token 바로 뒤 공백에 있을 때 token 전체를 원자적으로 삭제하도록 shared helper와 web keydown handler를 추가했다. native textarea라 inline chip 렌더링은 아니지만 삭제 동작은 Codex chat input에 가깝게 맞췄다.
- 2026-06-23: textarea stopgap을 Tiptap 기반 `ScopeComposer`로 대체했다. `scopeMention` inline atom node를 사용해 mention이 DOM pill로 렌더링되고, editor 내용은 기존 API 계약에 맞춰 plain text `instructionDraft`로 serialize된다. `@` 입력 중에는 Workspace, Tickets, Document, 현재 ticket document의 ticket 후보가 추천되고, 선택 시 atom node로 삽입된다.
- 2026-06-23: Tiptap atom node 삭제 UX를 보정했다. 자동 삽입된 trailing space 뒤에서 `Backspace`를 눌러도 ProseMirror document range 기준으로 직전 `scopeMention` atom과 공백을 함께 삭제한다. Chrome smoke에서 `@t:AKW-26` 후보 선택, atom pill 렌더링, preview prompt serialization, Backspace 1회 삭제, console error 없음까지 확인했다.
- 2026-06-23: scope suggestion surface를 `@radix-ui/react-popover` 기반 shadcn-style `Popover` wrapper로 교체했다. 후보 목록은 portal에서 z-index `90`으로 렌더링되고, editor focus는 유지한 채 `aria-controls`/`aria-activedescendant`/`aria-selected`로 active row를 추적한다. Chrome smoke에서 `@` 후보 Popover 표시, ArrowDown navigation, `@t:AKW-26` 필터링, Enter atom 삽입, Backspace 삭제, console error 없음까지 확인했다.
- 2026-06-23: scope suggestion active option이 바뀔 때 `scrollIntoView({ block: "nearest" })`로 Popover 내부 스크롤을 따라가게 했다. Chrome smoke에서 `@` 후보 8개 목록에서 ArrowDown 7회 후 list `scrollTop`이 `0`에서 `158`로 변하고 selected row가 visible 상태임을 확인했다.
- 2026-06-23: Popover 후보 목록에도 공용 `ak-scroll-area`를 적용해 scrollbar width, gutter, thumb 색상이 다른 내부 scroll region과 같은 디자인 시스템 토큰을 따르도록 맞췄다.
- 2026-06-23: AKW-07 ticket body의 `Status`/`Progress`를 구현 완료 상태와 Progress Board에 맞춰 `DONE`/`100%`로 보정했다.

### AKW-08. Workspace-level chat entry와 project-wide scope 적용

Status: DONE
Progress: 100%
Completed at: 2026-06-23T18:19:45+09:00
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

- AKW-07의 shared ChatComposer와 ScopeResolver를 사용해 selected workspace 전체를 대상으로 질문, 논의, 새 plan/ticket 생성 논의를 시작할 수 있는 workspace-level chat entry를 제공한다.

현재 문제:

- ticket drawer와 document-level entry는 특정 document/ticket context가 강하다.
- 새 기능 논의, 여러 Markdown document 간 비교, workspace 전체 현황 질문은 project scope entry가 더 적합하다.
- tickets 문서가 없거나 아직 어떤 문서에 기록해야 할지 모르는 상태에서는 workspace scope에서 시작해야 한다.

구현 범위:

- sidebar의 project switcher 아래에 `Workspace Chat` entry를 추가한다.
- entry sublabel에 현재 selected workspace와 전체 docs scope를 표시한다.
- desktop에서는 command-palette style modal 또는 sidebar 확장 panel로 연다.
- mobile에서는 fullscreen sheet로 연다.
- workspace chat은 AKW-07의 shared ChatComposer를 사용하고 default scope를 `workspace`로 주입한다.
- workspace chat prompt는 selected workspace root, discovered plan/ticket/inventory docs 목록, recent selected document를 context로 포함한다.
- workspace chat에서도 `@t:`, `@d`, `@tickets` override를 허용하되, scope chip과 target metadata를 명확히 표시한다.
- `$plan-ticketing` 명시 호출이나 plan/ticket 생성 요청을 workspace chat의 primary flow로 지원하되, 실제 생성 실행은 preview/confirm boundary를 둔다.
- chat 결과가 Markdown 변경을 제안할 때는 대상 문서 생성/수정 범위를 preview하고 명시 실행으로 분리한다.

제외 범위:

- workspace 전체 코드베이스 semantic indexing
- 외부 issue tracker 동기화
- 여러 workspace를 동시에 대상으로 하는 cross-workspace chat
- spec grilling 질문 workflow의 완성

완료 기준:

- [x] selected workspace가 있으면 sidebar에서 workspace chat entry가 보인다.
- [x] workspace chat은 현재 document가 없어도 project scope로 열 수 있다.
- [x] workspace chat prompt가 project docs 목록을 기반으로 구성된다.
- [x] workspace chat은 AKW-07 scope parser 결과를 사용한다.
- [x] plan/ticket 생성 요청은 `$plan-ticketing`을 사용할 수 있는 normalized scope/prompt boundary를 가진다.
- [x] document chat과 workspace chat의 scope label이 명확히 구분된다.

검증:

- [x] workspace chat prompt preview/unit test
- [x] workspace default scope resolver test
- [x] `$plan-ticketing` trigger prompt smoke
- [x] desktop browser smoke

사용자 지시:

- 2026-06-22: workspace chat은 project switcher 아래 sidebar entry에서 열고, project 전체 docs를 기준으로 질문하거나 새 plan/ticket 생성을 논의하는 방향이 좋다.
- 2026-06-23: 7/8은 Codex 채팅창에서는 전체를 봐달라고 지시하던 일을 scope만 다르게 제품화하는 느낌이므로, 별도 기능 두 개보다 scope-aware chat으로 정리한다.
- 2026-06-23: 08 진행.
- 2026-06-23: 모바일 smoke는 사용자 니즈가 아니므로 AKW-08 검증 항목에서 제거하고 완료 처리한다.

진행 메모:

- 2026-06-22: 초안 작성.
- 2026-06-23: Workspace Chat은 별도 parser를 만들지 않고 AKW-07의 shared scope parser/composer를 사용하는 entry로 재정의했다. AKW-26은 이 workspace scope 위의 spec grilling/handoff workflow로 유지한다.
- 2026-06-23: AKW-08 구현 착수. Workspace Chat entry, workspace-scope prompt preview, project docs context, workspace chat log 저장을 기존 AKW-07 scope parser와 AKW-24 chat 모델 위에 추가한다.
- 2026-06-23: `packages/shared`에 workspace chat/prompt preview 스키마를 추가하고, `apps/server`에 workspace chat JSONL 저장소, `/workspace-chat` API, workspace prompt builder를 구현했다. Prompt에는 selected workspace root, discovered document sets, optional current document, normalized scope block이 포함된다.
- 2026-06-23: `apps/web` sidebar project switcher 아래에 `Workspace Chat` entry를 추가하고, Tiptap 기반 `ScopeComposer`를 재사용하는 command modal을 연결했다. 메시지는 workspace chat log에 저장하고 `Save and preview`로 prompt boundary를 확인한다.
- 2026-06-23: 검증 완료: `pnpm --filter @alpha-kanban/server test`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `git diff --check`. Chrome desktop smoke에서 Workspace Chat entry, modal, default workspace scope, 저장+프리뷰를 확인했다.
- 2026-06-23: 사용자 확인에 따라 AKW-08의 mobile browser smoke 검증 항목을 제거하고, 남은 완료 기준과 검증이 충족되어 `DONE` 처리했다.

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

Status: DONE
Progress: 100%
Completed at: 2026-06-24T00:30:45+09:00
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

- [x] 외부 CLI/editor가 selected ticket document를 수정하면 UI가 변경을 감지한다.
- [x] board/detail query가 자동 refetch되거나 stale banner가 표시된다.
- [x] detail 편집 중 외부 변경이 생기면 사용자가 reload/keep editing을 판단할 수 있다.
- [x] watcher는 allowlist/doc roots 밖 파일을 감시하지 않는다.
- [x] stale write guard와 UI 메시지가 같은 정책을 따른다.

검증:

- [x] file watcher unit/integration test
- [x] external Markdown change API/SSE test
- [x] focus refetch fallback smoke
- [x] desktop browser stale banner smoke

사용자 지시:

- 2026-06-22: CLI가 Markdown을 갱신했을 때 UI가 자동 갱신되는지, 아니면 새로고침해야 하는지 문제가 있다. 이 문제를 먼저 티켓과 플랜에 반영한다.
- 2026-06-24: WebUI run이 서버 source edit/HMR 중 run tracking을 잃을 수 있으므로 AKW-10은 현재 Codex 채팅 세션에서 직접 구현한다.

진행 메모:

- 2026-06-22: 초안 작성.
- 2026-06-24: 중단된 AKW-10 run의 partial edit를 검토한 뒤 이 세션에서 이어받았다.
- 2026-06-24: `MarkdownFileEventHub` polling watcher와 `/api/workspaces/:workspaceId/files/events` SSE endpoint를 추가했다. watcher는 workspace `docRoots`에서 `listFiles()`로 보이는 Markdown만 snapshot/hash/mtime 기준으로 비교하고, `describeFileChange()`로 allowlist 밖 파일을 제외한다.
- 2026-06-24: Web UI가 workspace별 EventSource를 구독해 document sets를 invalidate하고, 열린 ticket drawer가 현재 selected file 변경을 감지하면 `File changed externally` banner와 `Reload` action을 표시하도록 구현했다. stale 상태에서는 status save, prompt preview, Codex run을 비활성화한다.
- 2026-06-24: window focus/visibility regain 시 document sets와 현재 문서 query를 refetch하는 fallback을 추가했다.
- 2026-06-24: 검증 완료: `pnpm --filter @alpha-kanban/server test`, `pnpm typecheck`, `pnpm build`, Chrome desktop smoke. Chrome smoke에서 외부 Markdown append 후 stale banner, Reload action, stale 상태의 save/preview/run disabled, reload 후 banner 해제를 확인하고 임시 변경을 원복했다.

### AKW-27. Project switcher modal 재배치와 URL route state 복원

Status: DONE
Progress: 100%
Repository:

- `apps/web`
- `alpha-kanban`

Priority: P1
Type: UX / Routing
Depends on:

- `AKW-04`
- `AKW-13`
- `AKW-15`

목표:

- 사이드바에서 프로젝트 recent/open path 목록을 항상 펼쳐두지 않고, 현재 project 표시와 switch action만 남긴다.
- 새로고침 또는 URL 공유 시 마지막으로 보던 project, Markdown document, ticket detail open state를 복원한다.

현재 문제:

- 기존 project switcher가 사이드바 상단에 recent/open path/discovered 목록을 계속 노출해 ticket document 목록처럼 오인된다.
- 사용자가 실수로 project를 바꾸기 쉽고, 새로고침하면 마지막으로 보던 Markdown document 대신 첫 ticket document로 돌아갈 수 있다.
- 모든 state를 hash에 넣으면 URL이 지저분하고 project routing boundary가 모호하다.

구현 범위:

- sidebar project 영역은 현재 project compact button으로 축소한다.
- recent/discovered project, open path, browse folder UX는 `Switch project` modal 안으로 이동한다.
- URL route state를 `path=/w/:workspaceId`, `query=file:{workspaceRelativePath}`, `hash=ticket/detail`로 분리한다.
- 직접 URL 진입과 browser refresh에서 selected workspace, selected Markdown document, ticket detail modal/side state를 복원한다.
- ticket detail을 닫으면 hash의 ticket/detail state를 제거한다.

제외 범위:

- React Router 도입
- server-side route registry
- browser history stack을 ticket/card click마다 push하는 세밀한 back/forward UX
- project 변경 전 draft/active run confirm guard

완료 기준:

- [x] 사이드바에는 현재 project compact switcher만 보인다.
- [x] recent/open path/browse는 modal 안에서만 보인다.
- [x] project는 URL path로 표현된다.
- [x] selected Markdown document는 query string으로 복원된다.
- [x] ticket detail open state는 hash로 복원되고 닫을 때 제거된다.

검증:

- [x] `pnpm typecheck`
- [x] `pnpm test`
- [x] `pnpm build`
- [x] Chrome direct route/reload smoke

사용자 지시:

- 2026-06-23: project recent/open path 영역이 항상 펼쳐져 있을 필요가 없고, ticket으로 오인해 project를 잘못 바꾸기 쉬우므로 위치를 옮긴다.
- 2026-06-23: 새로고침 시 마지막으로 보던 Markdown file을 기억한다.
- 2026-06-23: 가능하면 `#`로 ticket modal open 여부까지 복원한다.
- 2026-06-23: 모든 것을 hashbang으로 처리하지 말고 project 정도는 router 주소로 처리한다.
- 2026-06-23: `?file=...#ticket=...&detail=modal` 직접 URL에서 selected file state가 비면 modal/detail이 빈 화면처럼 보일 수 있으므로, URL file path를 렌더 단계에서도 복구해야 한다.
- 2026-06-25: `Open last project automatically` 체크는 누르자마자 현재 화면을 project로 이동시키면 안 되고, 다음 root/startup부터 적용한다. 체크 해제 상태에서 빈 Start page로 이동할 명시 route action도 필요하다.

진행 메모:

- 2026-06-23: sidebar project 영역을 현재 project compact button으로 축소하고, `Switch project` Dialog 안으로 recent/discovered/open path/browse 진입점을 이동했다.
- 2026-06-23: manual History API 기반 route state를 추가했다. Project는 `/w/:workspaceId`, Markdown document는 `?file=docs%2F...md`, ticket detail state는 `#ticket=AKW-25&detail=modal|side`로 유지한다.
- 2026-06-23: 직접 URL 진입, ticket modal close 시 hash 제거, 새로고침 후 selected Markdown document 복원을 Chrome smoke로 확인했다.
- 2026-06-23: 검증 완료: `pnpm typecheck`, `pnpm test`, `pnpm build`. `pnpm build`는 기존과 같이 Vite chunk-size warning을 표시하지만 build는 통과했다.
- 2026-06-23: route state 보정을 추가했다. `selectedFileId` state가 비거나 stale이어도 URL `file=` path로 `selectedFile`과 file id를 derive해 ticket board/detail query와 modal direct route가 즉시 복원되게 했다.
- 2026-06-25: startup auto-open effect를 initial root load 시점에 이미 켜져 있던 경우로 제한하고, `Switch project` modal에 현재 project를 비우고 `/` Start page로 돌아가는 action을 추가했다.

### AKW-28. Document Set navigator와 type-specific document view mode 구현

Status: DONE
Progress: 100%
Repository:

- `apps/server`
- `apps/web`
- `packages/shared`
- `alpha-kanban`

Priority: P1
Type: UX / Parser / API / Routing
Depends on:

- `AKW-02`
- `AKW-03`
- `AKW-04`
- `AKW-27`

목표:

- selected workspace의 plan/tickets/inventory Markdown 문서를 flat file list가 아니라 작업 단위 document set으로 묶어 보여준다.
- `tickets` 문서를 선택하면 Kanban board를 유지하고, `plan` 또는 `inventory` 문서를 선택하면 해당 문서에 맞는 reader view를 보여준다.
- Sparkone처럼 실제 사용 중인 docs 구조에서 plan/tickets pair, plan/tickets/inventory set, standalone inventory가 섞여 있어도 보수적으로 탐색할 수 있게 한다.

현재 문제:

- 현재 UI는 selected document를 ticket document로 전제하고 Kanban board를 렌더링한다.
- plan-ticketing skill은 plan, tickets, inventory 문서를 생성하지만 UI는 ticket documents만 주요 navigation 대상으로 다룬다.
- `{NN}_{slug}_...` 번호는 생성 순서에 가깝고, inventory가 standalone이거나 번호가 떨어진 경우가 있어 파일 번호만으로 관계를 확정하기 어렵다.
- 문서 본문에는 `기준 문서`, `연결 문서`, Markdown link, absolute/relative path 언급이 섞여 있지만 아직 관계 evidence로 정규화하지 않는다.

구현 범위:

- shared/server에 Markdown document type schema를 추가하거나 기존 summary를 확장한다.
- file scan 결과를 `{ type: "plan" | "tickets" | "inventory" | "other", workspaceRelativePath, directory, slug, sequenceNumber }` 형태로 분류한다.
- 같은 directory와 slug를 strong key로 사용해 document set을 만든다.
- `NN`은 sorting/timeline hint로만 사용하고 관계 판단의 필수 조건으로 쓰지 않는다.
- 본문 link evidence를 보조 정보로 추출해 set confidence와 linked documents를 표시한다.
- `GET /api/workspaces/:workspaceId/document-sets` 또는 기존 file API 확장으로 document set 목록을 제공한다.
- sidebar의 ticket document list를 document set navigator로 교체한다.
- document set row에서 plan/tickets/inventory presence와 selected type을 명확히 표시한다.
- selected `tickets` document는 기존 Kanban board를 렌더링한다.
- selected `plan` document는 Markdown outline, 목표/비목표/현재 상태/검증 계획, linked ticket progress summary를 보여주는 plan reader를 렌더링한다.
- selected `inventory` document는 Matrix/Register/Repository details 섹션을 읽기 쉬운 outline 또는 table-like reader로 보여준다.
- selected `other` Markdown은 generic reader mode로 열고 ticket mutation/run affordance는 비활성화한다.
- URL `?file=` route state는 모든 Markdown type을 복원하고, ticket detail hash는 tickets view에서만 의미 있게 해석한다.

제외 범위:

- 모든 Markdown 문서 관계를 LLM으로 자동 추론하는 기능
- target repository에 강제 metadata frontmatter를 삽입하는 migration
- rich Markdown editor
- document graph visualization
- plan/inventory 문서의 ticket-level mutation

완료 기준:

- [x] Sparkone docs fixture에서 plan/tickets pair와 plan/tickets/inventory set이 같은 document set으로 묶인다.
- [x] standalone inventory나 suffix 미해석 문서는 `Unlinked` 또는 `Standalone` 영역에 남는다.
- [x] sidebar에서 document set 단위로 plan/tickets/inventory presence가 보인다.
- [x] plan 선택 시 Kanban이 아니라 plan reader가 열린다.
- [x] inventory 선택 시 Kanban이 아니라 inventory reader가 열린다.
- [x] tickets 선택 시 기존 board/detail/run 기능이 회귀 없이 동작한다.
- [x] 직접 URL 또는 새로고침으로 plan/inventory/tickets 선택 상태가 복원된다.

검증:

- [x] document type parser unit test
- [x] document set grouping unit test with Sparkone-style fixtures
- [x] alpha-kanban docs grouping regression test
- [x] plan/tickets/inventory 선택 UI smoke
- [x] direct route reload smoke

사용자 지시:

- 2026-06-23: plan-ticketing skill은 plan/ticket/inventory를 생성하지만 UI는 티켓 문서에 특화되어 있으므로, 인벤토리와 플랜도 살펴볼 UX가 필요하다.
- 2026-06-23: 파일 내부 본문에는 연관 파일 나열 방식이 규격화되어 있지 않고, 절대주소/상대주소/파일명만 언급되는 경우가 섞일 수 있다.
- 2026-06-23: 주로 사용하던 참고 프로젝트의 docs 구조를 기준으로 판단한다.
- 2026-06-23: `{NN}_{slug}_`는 skill에 명시된 생성 규칙이지만, 번호 자체는 관계의 강한 기준으로 보지 않는다.
- 2026-06-23: plan을 선택하면 Kanban이 아니라 다른 view mode가 필요하다.
- 2026-06-23: AKW-28을 먼저 시작한다.
- 2026-06-23: Markdown renderer는 직접 구현보다 rich open-source renderer를 쓰는 방향이 좋고, reader code block 컬러링이 읽기 어렵다. Outline 항목을 클릭하면 해당 heading 위치로 스크롤되면 좋겠다.
- 2026-06-23: plan/inventory Markdown reader에서 바깥 스크롤과 본문 내부 스크롤이 중첩되어 보이는 UX가 불편하므로, 내부 스크롤을 풀거나 sticky 처리로 정리한다.
- 2026-06-23: Markdown reader title/header 영역도 상단 sticky로 유지하고, linked docs/outline 패널은 창 높이가 줄 때 내부 스크롤은 허용하되 padding 때문에 부모 스크롤을 유발하지 않게 정리한다.
- 2026-06-23: sticky header가 카드 상단과 rounded clipping을 깨고, 좌측 docs 영역 하단이 잘려 보이므로 sticky 대신 내부 스크롤바를 쓰되 외부 스크롤이 생기지 않도록 viewport 높이 계산으로 정리한다.
- 2026-06-23: Outline 클릭으로 이동한 anchor heading이 어디인지 알 수 있게, 스크롤 후 해당 라인에 은은한 shadow 반짝임을 1회 표시한다.

진행 메모:

- 2026-06-23: 초안 작성. Sparkone docs baseline은 Markdown 76개, typed `{NN}_{slug}_{plan|tickets|inventory}.md` 61개, directory+slug group 35개, plan+tickets pair 18개, plan+tickets+inventory set 4개, standalone/lonely group 13개로 확인했다.
- 2026-06-23: 구현 착수. Document set API, generic Markdown reader, sidebar document set navigator, type-specific document view mode 순서로 진행한다.
- 2026-06-23: 구현 완료. `packages/shared`에 document set/Markdown reader schema를 추가하고, `apps/server`에 document set grouping과 generic Markdown read route를 추가했다. `apps/web`은 sidebar를 Document Set navigator로 교체하고 tickets는 Kanban, plan/inventory/markdown은 reader mode로 분기한다.
- 2026-06-23: 검증 완료: `pnpm --filter @alpha-kanban/shared build`, `pnpm --filter @alpha-kanban/server typecheck`, `pnpm --filter @alpha-kanban/server test`, `pnpm --filter @alpha-kanban/web typecheck`, `pnpm test`, `pnpm build`, Chrome smoke. Chrome smoke는 alpha-kanban plan reader, alpha-kanban tickets Kanban, Sparkone inventory reader direct route를 확인했다. `pnpm build`는 기존 Vite chunk-size warning만 표시하고 성공했다.
- 2026-06-23: Markdown reader polish를 반영했다. 기존 `react-markdown`/`remark-gfm` renderer는 유지하되 `ak-markdown` 스타일로 inline code와 fenced code block 색상 충돌을 분리했고, outline 항목 클릭 시 line 기반 heading id로 smooth scroll되도록 연결했다.
- 2026-06-23: Markdown reader의 오른쪽 본문 내부 스크롤을 제거하고 바깥 document body 스크롤로 통합했다. 왼쪽 linked docs/outline 패널은 sticky sidebar로 유지해 긴 plan/inventory 문서 탐색을 보조한다.
- 2026-06-23: Reader title/header를 sticky로 변경했다. 왼쪽 linked docs/outline 패널은 sticky `flex-col` container와 `min-h-0 flex-1 overflow-auto` body로 재구성해 내부 padding이 부모 높이를 넘겨 추가 스크롤을 만들지 않게 했다.
- 2026-06-23: Sticky 방식이 panel clipping과 충돌해 reader layout을 `h-full min-h-0` grid로 되돌렸다. 좌측 linked docs/outline과 우측 Markdown body만 각각 내부 스크롤을 갖고, article header는 sticky가 아닌 카드 내부 고정 header로 유지한다.
- 2026-06-23: Outline heading click 후 scroll completion 또는 fallback delay에 맞춰 target heading에 `ak-markdown-heading-highlight` class를 1회 부여하고, CSS keyframes로 은은한 background/shadow flash를 표시하도록 구현했다.

### AKW-29. Workspace Chat fullscreen modal shell로 재배치

Status: DONE
Progress: 100%
Completed at: 2026-06-23T18:22:52+09:00
Repository:

- `apps/web`
- `alpha-kanban`

Priority: P1
Type: UX / Layout
Depends on:

- `AKW-08`
- `AKW-24`

목표:

- Workspace Chat을 작은 설정/프리뷰 모달이 아니라 Codex 채팅창에 가까운 fullscreen 대화 surface로 재배치한다.
- AKW-26 spec grilling mode를 얹을 수 있도록 history 중심, bottom composer 중심의 안정적인 chat shell을 만든다.

현재 문제:

- 현재 Workspace Chat modal은 입력/설정 영역이 상단, chat history와 prompt preview가 하단이라 일반적인 chat mental model과 반대다.
- `Save and preview`가 폼 액션처럼 보이고, project-wide 대화 surface라는 인상이 약하다.
- AKW-26에서 spec grilling 질문/응답을 붙이면 현재 배치에서는 대화 흐름보다 설정 패널이 먼저 보여 리워크 가능성이 높다.

구현 범위:

- Workspace Chat dialog를 viewport 대부분을 차지하는 fullscreen modal shell로 변경한다.
- 상단 header에는 workspace root, docs count, current document, scope/mode 요약, close affordance를 둔다.
- 중앙 영역은 workspace chat history를 먼저 보여주고, 빈 상태에서도 프로젝트 전체 대화 surface임이 드러나게 한다.
- 하단 sticky composer에 `ScopeComposer`, mode selector, scope resolution, primary action을 배치한다.
- prompt preview는 항상 펼친 하단 블록이 아니라 대화 흐름 아래의 접힘/보조 preview 영역으로 배치한다.
- `Send`는 단순 저장/preview가 아니라 workspace Codex run을 시작하고 running 상태를 표시한다.
- run이 완료되면 assistant answer를 workspace chat log에 append한다.
- Notion design token과 `ak-scroll-area` internal scroll model을 유지한다.

제외 범위:

- AKW-26 spec grilling 질문 workflow 구현
- plan-ticketing handoff 실행
- mobile 전용 별도 검증

완료 기준:

- [x] Workspace Chat이 fullscreen modal에 가까운 chat shell로 열린다.
- [x] chat history가 composer보다 위에 배치된다.
- [x] composer가 modal 하단에 sticky로 유지된다.
- [x] mode/scope controls가 composer 주변에 있어 chat 입력과 한 덩어리로 보인다.
- [x] prompt preview가 대화 흐름을 밀어내지 않는 보조 영역으로 보인다.
- [x] 기존 workspace chat 저장과 prompt preview 기능이 유지된다.
- [x] `Send` 후 running 표시가 보이고 assistant answer가 workspace chat history에 저장된다.

검증:

- [x] `pnpm typecheck`
- [x] `pnpm --filter @alpha-kanban/server test`
- [x] `pnpm build`
- [x] `git diff --check`
- [x] Chrome desktop smoke

사용자 지시:

- 2026-06-23: 채팅창 배치가 입력 상단, 기록 하단인 게 생경하므로 Codex 채팅창처럼 fullscreen modal로 연출하는 방향이 좋아 보인다.
- 2026-06-23: AKW-26보다 이 UI 후속이 먼저이며, 후속 티켓을 작성하고 진행한다.
- 2026-06-23: 프롬프트 프리뷰가 채팅 입력과 내역 사이에 뜨는 것은 채팅 타임라인 의미에 맞지 않으므로, 대화 흐름 밖의 composer utility로 숨긴다.
- 2026-06-23: Workspace Chat에 `안녕`을 입력해도 running 표시와 assistant 응답이 없어 목업처럼 보이므로, 실제 동작 범위를 명확히 하거나 실제 run을 연결한다.

진행 메모:

- 2026-06-23: 초안 작성. AKW-29는 AKW-26을 담을 workspace chat shell을 먼저 안정화하는 선행 UX 티켓으로 둔다.
- 2026-06-23: `apps/web` Workspace Chat dialog를 fullscreen shell로 재배치했다. Header, central scroll thread, bottom composer 3행 구조로 바꾸고, history와 prompt preview를 composer 위에 배치했다.
- 2026-06-23: `apps/web/src/styles.css`에 `ak-workspace-chat-dialog`, thread, composer utility를 추가해 Notion-like surface와 internal scroll model을 유지했다.
- 2026-06-23: 검증 완료: `pnpm typecheck`, `pnpm build`, `git diff --check`, Chrome desktop smoke. Chrome smoke에서 Workspace Chat modal 크기, history-before-composer 배치, bottom composer 유지, `Send and preview` 후 message 저장과 prompt preview 노출을 확인했다.
- 2026-06-23: 사용자 피드백에 따라 prompt preview를 central chat thread에서 제거했다. `Send` 후 타임라인에는 message만 남기고, preview는 composer toolbar의 `Prompt` 버튼으로만 열리는 보조 affordance로 변경했다. Composer도 full-width footer가 아니라 floating input surface에 가깝게 축소했다.
- 2026-06-23: Workspace Chat `Send`를 실제 Codex run 시작으로 연결했다. 서버에 `/api/workspaces/:workspaceId/workspace-chat/runs`를 추가하고, runner finish 시 assistant answer를 workspace chat log에 append하도록 ticket/workspace chat 분기를 추가했다. UI는 running badge와 last run status를 표시하고, EventSource 종료 시 chat history를 refetch한다.
- 2026-06-23: 검증 추가 완료: `pnpm --filter @alpha-kanban/server test`, `pnpm typecheck`. API 테스트는 workspace chat run이 `user -> assistant` 메시지를 같은 runId로 저장하는지 확인한다.

### AKW-30. Codex CLI model catalog와 run defaults 설정 구현

Status: DONE
Progress: 100%
Completed at: 2026-06-24T00:06:41+09:00
Repository:

- `apps/server`
- `apps/web`
- `packages/shared`

Priority: P1
Type: Feature / API / UX
Depends on:

- `AKW-05`
- `AKW-25`
- `AKW-29`

목표:

- Alpha Kanban의 `Run with Codex`가 Codex.app UI의 Fast 토글과 별개로 어떤 CLI model/reasoning/speed tier로 실행되는지 명확히 보여주고, Web UI에서 전역 기본값을 설정할 수 있게 한다.
- 사용 가능한 model/reasoning/fast capability는 OpenAI API가 아니라 현재 설치된 Codex CLI catalog를 기준으로 가져온다.

현재 문제:

- Alpha Kanban은 현재 `codex exec --json ...`만 호출하고 `-m`, `-c model_reasoning_effort=...`, speed tier 관련 config override를 넘기지 않는다.
- 사용자는 Codex.app UI의 Fast 토글이 켜져 있다고 생각하지만, Alpha Kanban이 띄우는 Codex CLI child process는 별도 설정을 사용한다.
- 현재 CLI 기본값은 `~/.codex/config.toml`에 위임되어 실행 preview만 봐서는 실제 model/reasoning/fast 여부를 직관적으로 알기 어렵다.
- 모델 목록을 OpenAI API에서 직접 가져오면 Codex CLI가 실제로 지원하는 model slug, reasoning level, speed tier와 어긋날 수 있다.
- `codex debug models`는 현재 설치된 CLI의 model catalog를 JSON으로 제공하고 `supported_reasoning_levels`, `additional_speed_tiers`, `service_tiers` 정보를 포함한다.

구현 범위:

- 서버에 `GET /api/codex/models`를 추가해 `codex debug models` JSON을 래핑한다.
- API response는 큰 `base_instructions` 등 실행에 불필요한 필드를 제거하고 `slug`, `displayName`, `defaultReasoning`, `supportedReasoning`, `supportsFast`, `serviceTiers`, `visibility`, `supportedInApi` 같은 UI/실행 설정 필드만 반환한다.
- `codex debug models` 실패 시 `codex debug models --bundled` fallback을 시도하고, 둘 다 실패하면 명확한 API error를 반환한다.
- `.alpha-kanban/state.json`에 전역 `codexRunDefaults`를 저장한다.
- Codex run defaults에는 `model`, `reasoningEffort`, `speedTier` 또는 `fast` 선택 값을 둔다.
- 서버 preview/run args 생성 시 저장된 defaults를 `-m`과 `-c` override로 반영한다.
- ticket run, workspace chat run, prompt preview가 모두 같은 defaults를 사용한다.
- ticket `Run with Codex`와 Workspace Chat composer에서 model select, reasoning effort select, fast/speed tier toggle을 제공하고 변경 즉시 전역 defaults에 저장한다.
- Prompt preview와 run summary에 실제 적용된 model/reasoning/speed tier와 최종 CLI args가 보이게 한다.

제외 범위:

- OpenAI API model list 직접 호출
- Codex.app UI Fast 토글 상태 읽기
- 사용자 계정별 entitlement/usage quota 판정
- speed tier config key가 CLI에서 확인되지 않을 경우 임의 추정 적용
- per-workspace/per-ticket override

완료 기준:

- [x] `GET /api/codex/models`가 현재 Codex CLI catalog를 sanitized JSON으로 반환한다.
- [x] model별 supported reasoning level과 fast/speed tier 가능 여부가 UI에서 보인다.
- [x] run defaults를 저장하면 새로고침 후 유지된다.
- [x] prompt preview args에 선택한 model/reasoning/speed tier가 반영된다.
- [x] ticket run과 workspace chat run이 같은 defaults를 사용한다.
- [x] fast speed tier는 `features.fast_mode=true`와 `service_tier="fast"`로 CLI args에 반영된다.

검증:

- [x] `codex debug models` parser unit test
- [x] bundled fallback API test
- [x] run defaults state read/write test
- [x] prompt preview args integration test
- [x] composer settings UI smoke
- [x] run preview smoke

사용자 지시:

- 2026-06-23: Codex.app UI에는 Fast가 켜져 있으나 Alpha Kanban의 Codex CLI 실행은 별도 설정을 보는 것 같으므로, Web UI에서 모델/추론레벨/Fast 여부를 전역 저장하는 방향을 검토한다.
- 2026-06-23: OpenAI API가 아니라 Codex CLI 명령으로 사용 가능한 model, reasoning level, fast mode capability를 알아내고, 그것을 Alpha Kanban API로 래핑하는 방향이 좋아 보인다.
- 2026-06-24: Codex 실행 설정은 별도 모달과 저장 버튼이 아니라, 채팅/실행 입력창 하단에서 매번 즉시 바꿀 수 있어야 한다.

진행 메모:

- 2026-06-23: 초안 작성. 로컬 확인 결과 `codex debug models`는 `{ models: [...] }` JSON을 반환하며 각 model에 `slug`, `display_name`, `default_reasoning_level`, `supported_reasoning_levels`, `additional_speed_tiers`, `service_tiers`, `visibility`, `supported_in_api`가 포함된다. `gpt-5.5`와 `gpt-5.4`는 `additional_speed_tiers: ["fast"]`, `service_tiers: [{ id: "priority", name: "Fast" }]`를 제공한다.
- 2026-06-23: `packages/shared`에 Codex model catalog, run defaults, applied defaults schema를 추가했다. prompt preview, run snapshot, run summary는 실행 기본값을 포함해 UI와 log가 실제 적용값을 볼 수 있게 했다.
- 2026-06-23: `apps/server`에 `GET /api/codex/models`, `GET/PUT /api/codex/run-defaults`를 추가했다. 모델 catalog는 `codex debug models`를 우선 사용하고 실패 시 `--bundled` fallback을 시도하며, `base_instructions` 같은 큰 필드는 제거한다.
- 2026-06-23: `.alpha-kanban/state.json`의 `codexRunDefaults`를 read/write하도록 확장했다. ticket run, workspace chat run, prompt preview는 같은 전역 defaults를 읽고 `-m`, `-c model_reasoning_effort=...`를 CLI args에 반영한다.
- 2026-06-23: speed tier는 `codex debug models`에서 fast capability를 감지하고, Codex manual의 Fast mode 계약에 따라 `features.fast_mode=true`와 `service_tier="fast"`를 `codex exec` config override로 전달한다. 이전 `not applied by v1` 표시는 제거했다.
- 2026-06-23: `apps/web` 사이드바 하단에 Codex settings dialog를 추가했다. 모델 select, reasoning select, fast capability 표시를 제공하고, Prompt preview와 Run log에는 CLI defaults/model/reasoning/speed tier 적용 상태 배지를 표시한다.
- 2026-06-23: 검증 완료: `pnpm --filter @alpha-kanban/server test` 48 passed, `pnpm typecheck`, `pnpm build`, `git diff --check`, Chrome desktop smoke. Chrome smoke에서 settings dialog catalog 표시, defaults 저장, prompt preview args 반영, defaults reset을 확인했다.
- 2026-06-24: 별도 Codex settings dialog와 사이드바 하단 진입점을 제거하고, ticket `Run with Codex`와 Workspace Chat composer 하단에 Radix/shadcn `Select`/`Checkbox` 기반 model, reasoning, Fast 컨트롤을 추가했다. 변경 시 `PUT /api/codex/run-defaults`로 즉시 저장하고 기존 preview는 stale 방지를 위해 초기화한다.
- 2026-06-24: Chrome smoke에서 ticket composer와 Workspace Chat composer 모두 `GPT-5.5`, `매우 높음`, `Fast` 컨트롤이 보이고 사이드바 `Codex settings` 버튼이 없는 것을 확인했다. model을 `GPT-5.4`로 선택하면 API state가 즉시 `gpt-5.4`로 바뀌는 것을 확인한 뒤 원래 `gpt-5.5`/`xhigh`/`fast`로 복구했다.
- 2026-06-24: 사용자가 별도 터미널에서 `pnpm dev`를 실행하면 서버 `PATH`에 `codex`가 없어 `GET /api/codex/models`와 실제 `Run with Codex`가 각각 catalog 실패 또는 `spawn codex ENOENT`로 실패할 수 있음을 확인했다. `apps/server/src/codexCommand.ts`로 command resolution을 중앙화해 설정값, `ALPHA_KANBAN_CODEX_COMMAND_FALLBACKS`, 로그인 셸 `command -v codex`, macOS Codex.app 번들 경로를 공통 후보로 사용한다. 모델 catalog는 후보별 `debug models`를 재시도하고, prompt preview/run은 `--version` probe로 실제 실행 가능한 command를 선택한다. `pnpm --filter @alpha-kanban/server test -- codexModels`, `pnpm --filter @alpha-kanban/server typecheck`, 실제 `/api/codex/models` 200 응답, dodge-web DGE-06 prompt preview command가 `/Applications/Codex.app/Contents/Resources/codex`로 resolve되는 것을 확인했다.

### AKW-31. Runtime workspaceRoots settings와 restartless allowlist 적용

Status: DONE
Progress: 100%
Completed at: 2026-06-26T15:06:30+09:00
Repository:

- `apps/server`
- `apps/web`
- `packages/shared`

Priority: P1
Type: Feature / API / UX / Policy
Depends on:

- `AKW-01`
- `AKW-02`
- `AKW-13`
- `AKW-27`
- `AKW-32`
- `AKW-33`

목표:

- 사용자가 UI에서 Alpha Kanban이 접근할 target workspace root 범위를 명시적으로 확인하고 수정할 수 있게 한다.
- `workspaceRoots` 변경은 서버 재시작 없이 project discovery, folder picker, project 생성, Codex cwd routing에 즉시 반영한다.

현재 문제:

- 현재 dogfooding 설정은 `alpha-kanban.config.json`의 `workspaceRoots: [".."]` 때문에 Alpha Kanban clone 위치의 부모 directory가 암묵적인 allowlist처럼 보인다.
- `loadServerConfig()`는 서버 시작 시 config snapshot을 만들고 `WorkspaceStore`, `MarkdownFileStore`, `CodexRunner`가 그 값을 들고 있어 config 파일 수정만으로는 런타임에 반영되지 않는다.
- UI에는 현재 적용 중인 root 범위가 정책인지, 설정값인지, 사용자가 언제 바꿀 수 있는지 명확히 보이는 surface가 없다.

구현 범위:

- 서버에 runtime config/settings store를 추가해 static config default와 user override를 분리한다.
- `workspaceRoots` settings `GET/PUT` API를 추가하고, directory existence와 `realpath` normalization을 적용한다.
- `GET /api/workspaces`, folder picker, `POST /api/workspaces/create`, `POST /api/workspaces/select`, Codex prompt/run cwd 검증이 최신 runtime roots를 읽도록 바꾼다.
- user override는 `.alpha-kanban/state.json` 또는 별도 local settings file에 저장해 재시작 후에도 유지한다.
- 현재 선택된 workspace가 새 roots 밖으로 벗어나면 Start page로 이동시키고, UI에 unavailable/stale 상태를 명확히 표시한다.
- Start page 또는 Settings surface에서 현재 roots 목록, 추가/제거, 저장 결과를 보여준다.

제외 범위:

- OS-level permission sandbox
- 원격 multi-user admin policy
- target project repository 안에 Alpha Kanban state 쓰기
- workspaceRoots 밖 파일을 임시 허용하는 escape hatch

완료 기준:

- [x] UI에서 현재 `workspaceRoots`를 볼 수 있다.
- [x] UI에서 root를 추가/제거하면 서버 재시작 없이 workspace 목록과 folder picker가 갱신된다.
- [x] 새 project 생성 Location은 변경된 roots를 즉시 사용한다.
- [x] 선택 중인 workspace가 새 roots 밖이면 안전하게 Start page로 돌아간다.
- [x] 재시작 후에도 user override가 유지된다.

검증:

- [x] runtime settings API unit/integration test
- [x] workspace discovery/folder picker refetch test
- [x] selected workspace invalidation route test
- [x] project creation root selection smoke

사용자 지시:

- 2026-06-25: `workspaceRoots`가 UI로 명시 지정되지 않고 clone 위치의 부모가 지정되는 것처럼 보이므로, 사용자가 선택할 수 있는 설정 UX가 필요하다.
- 2026-06-25: UI에서 선택을 넣는다면 서버 재시작 없이 반영되는 구조가 맞다.
- 2026-06-25: AKW-31 구현진행.
- 2026-06-26: root 선택 UI를 마저 구현한다.
- 2026-06-26: 메인페이지가 세로 스택으로 너무 길고, recent와 프로젝트 browse가 아래로 밀려 UX가 나쁘다. recent를 더 위로 옮기고 전체 배치를 조정한다.
- 2026-06-26: Start 설명 영역은 카드 하나를 차지할 가치가 없고, auto-open은 카드 밖 체크박스 정도로 충분하다.
- 2026-06-26: 헤더의 Open last project 버튼도 Recent 최상단과 중복이므로 제거한다. 프로젝트 browse는 헤더의 작은 버튼 하나로 충분하고, Recent는 full-width로 둔다.
- 2026-06-26: New project 설명이 부정확하다. workspace folder가 아니라 workspace root 아래 원하는 project folder를 만드는 기능이다. 이것도 카드보다 browse처럼 팝오버/다이얼로그 액션이 적절하다.
- 2026-06-26: New project dialog padding을 맞추고 Location select는 shadcn Select로 써야 한다.
- 2026-06-26: New project dialog body padding이 여전히 보이지 않는다. Header/Footer와 같은 좌우 padding으로 맞춘다.
- 2026-06-26: Workspace roots의 Add root는 역할이 불명확하므로 제거한다. 사용자가 직접 타이핑할 기대는 없고, Browse root로 선택하면 즉시 저장되는 흐름이 맞다.
- 2026-06-26: 상단 Alpha Kanban / Plan-ticketing workspace 브랜드 영역을 클릭하면 Start page(`/`)로 돌아올 수 있어야 한다.
- 2026-06-26: Workspace Chat 버튼을 사이드바 내부가 아니라 우하단 floating button으로 배치한다.
- 2026-06-26: AKW-31은 runtime workspaceRoots 설정 범위가 충족됐고 후속 shell/header UX는 AGH 문서로 분리됐으므로 완료 처리한다.

진행 메모:

- 2026-06-25: 초안 작성. 현재 config 파일 직접 수정은 재시작이 필요하므로 runtime settings store/API를 별도 후속으로 분리한다.
- 2026-06-25: runtime workspaceRoots settings API와 Start page roots 편집 UI를 구현했다. .alpha-kanban/state.json runtimeSettings.workspaceRoots override를 저장하고, workspace discovery/folder picker/project creation/select가 최신 runtime roots를 읽도록 변경했다. 현재 선택 workspace가 새 roots 밖으로 벗어나면 Start page로 돌아가게 했다. 검증 완료: pnpm --filter @alpha-kanban/server test -- api codexState, pnpm --filter @alpha-kanban/web typecheck, pnpm build, git diff --check. 남은 작업은 사용자 visual/project creation smoke다.
- 2026-06-26: workspaceRoots 설정 전용 Browse modal/API를 추가했다. 새 GET /api/settings/workspace-root-browser endpoint는 기존 allowlist 밖 parent/child directory 탐색을 허용해 root 자체를 선택할 수 있고, Start page Workspace roots 패널의 Browse root 버튼에서 같은 directory table UI로 선택한 root를 local root 목록에 추가한 뒤 Save roots로 적용한다. 검증 완료: pnpm --filter @alpha-kanban/server test -- api, pnpm --filter @alpha-kanban/web typecheck, pnpm build, git diff --check, pnpm ticket-md check docs/04_alpha_kanban_multi_workspace_tickets.md. 남은 작업은 사용자 visual smoke다.
- 2026-06-26: Start page를 2열 대시보드형으로 재배치했다. 상단은 Start/Recent projects, 중단은 Open project/New project, 하단은 Workspace roots/Guide로 나눠 프로젝트 browse와 recent가 첫 화면 위쪽에 보이게 했다. 검증 완료: pnpm --filter @alpha-kanban/web typecheck, pnpm --filter @alpha-kanban/server test -- api, pnpm build, git diff --check.
- 2026-06-26: Start 카드 제거 후 페이지 헤더로 축소했다. auto-open은 카드 밖 inline checkbox로 낮추고, 첫 카드 줄은 Open project와 Recent projects가 차지하도록 조정했다. 검증 완료: pnpm --filter @alpha-kanban/web typecheck, git diff --check.
- 2026-06-26: Start header의 Open last project 버튼과 Open project 카드를 제거했다. 헤더에는 Browse project 버튼만 남기고, Recent projects를 첫 번째 full-width 카드로 올렸다. 검증 완료: pnpm --filter @alpha-kanban/web typecheck, git diff --check.
- 2026-06-26: New project 카드를 제거하고 Start header 액션 버튼으로 축소했다. 버튼 클릭 시 Dialog에서 configured root 아래 새 project folder 이름과 git init 여부를 입력한다. 설명은 'Create a new project folder under a configured root.'로 정리했다. 검증 완료: pnpm --filter @alpha-kanban/web typecheck, pnpm build, git diff --check.
- 2026-06-26: New project Dialog form padding을 조정하고 native select를 local shadcn Select/SelectTrigger/SelectContent/SelectItem으로 교체했다. 검증 완료: pnpm --filter @alpha-kanban/web typecheck, pnpm build, git diff --check.
- 2026-06-26: New project form body를 px-5/pb-5 wrapper로 감싸 DialogHeader/DialogFooter와 같은 좌우 padding rhythm을 쓰게 했다. 검증 완료: pnpm --filter @alpha-kanban/web typecheck, pnpm build, git diff --check.
- 2026-06-26: Workspace roots 패널에서 수동 path 입력과 Add root/Save roots 단계를 제거했다. Browse root에서 폴더를 선택하면 즉시 settings 저장을 실행하고, root 제거와 Use defaults도 즉시 저장된다. 사이드바 브랜드 영역은 버튼화해 클릭 시 handleGoToStartPage로 `/` Start 상태에 복귀한다. 검증 완료: pnpm --filter @alpha-kanban/web typecheck, git diff --check.
- 2026-06-26: 사이드바의 Workspace Chat 블록을 제거하고, selected workspace가 사용 가능한 경우에만 우하단 fixed floating button을 렌더링하도록 변경했다. 버튼은 기존 WorkspaceChatDialog를 그대로 열며 문서/티켓 탐색 사이드바와 분리된다. 검증 완료: pnpm --filter @alpha-kanban/web typecheck, git diff --check.
- 2026-06-26: runtime workspaceRoots 설정, Browse root 즉시 저장, project creation root 선택, selected workspace invalidation, Start page/root UX가 구현 및 검증됐다. Global header/shell 재정리는 docs/08_alpha_kanban_global_header_plan.md와 docs/09_alpha_kanban_global_header_tickets.md로 분리했으므로 본 티켓은 DONE으로 닫는다.

### AKW-32. TanStack Router 기반 route state 정리

Status: DONE
Progress: 100%
Completed at: 2026-06-25T20:08:46+09:00
Repository:

- `apps/web`

Priority: P0
Type: UX / Routing / Refactor
Depends on:

- `AKW-27`

목표:

- 이미 app shell에 있는 TanStack Router를 실제 route state source로 사용하고, `App.tsx`의 manual History API 라우팅을 제거한다.
- Start page, workspace route, selected document, ticket detail presentation을 router route/search/hash 계약으로 일관되게 복원한다.

현재 문제:

- `apps/web/src/main.tsx`는 `@tanstack/react-router`의 `RouterProvider`를 사용하지만 route tree는 root/index 수준에 머문다.
- 실제 URL state는 `App.tsx`의 `readAppRouteState`, `buildAppRoute`, `replaceAppRoute`, `window.history.replaceState`, `hashchange`, `popstate`로 직접 관리된다.
- route state가 Start page, auto-open, selected workspace, selected Markdown file, ticket detail modal/side, 향후 settings/chat state로 늘어나면서 React state와 URL state의 책임이 중복되고 있다.

구현 범위:

- `main.tsx` 또는 별도 router module에 `/`와 `/w/$workspaceId` route를 명시한다.
- selected Markdown file은 TanStack Router search param으로 관리하고 schema/parse fallback을 둔다.
- ticket detail open state와 `detail=side|modal`은 현재 hash 계약을 유지할지 search param으로 이전할지 결정하고 한 곳에서만 관리한다.
- `App.tsx`의 `readAppRouteState`, `buildAppRoute`, `replaceAppRoute`, `hashchange`/`popstate` listener를 router state/navigate 기반으로 대체한다.
- workspace select, open path, create project, Start page 이동, ticket open/close, detail mode 변경이 모두 router navigate를 사용하게 한다.
- 기존 direct URL `/w/:workspaceId?file=...#ticket=...&detail=modal`이 깨지지 않게 migration fallback을 제공한다.

제외 범위:

- backend route 변경
- server-side rendering
- browser history stack을 모든 card click마다 세밀하게 push하는 UX
- `workspaceRoots` settings API와 UI 구현
- workspace chat modal deep link

완료 기준:

- [x] TanStack Router route tree가 `/`와 `/w/$workspaceId`를 명시적으로 가진다.
- [x] selected workspace와 file이 router state에서 복원된다.
- [x] ticket detail modal/side direct URL 계약이 route helper에서 보존된다.
- [x] `App.tsx`에서 direct `window.history.replaceState`와 route event listener가 제거된다.
- [x] Start page 이동과 auto-open last project가 router navigate 기반으로 동작한다.
- [x] browser direct URL smoke에서 `/`, `/w/:id`, `?file=...`, `#ticket=...&detail=...` 복원이 확인된다.

검증:

- [x] `pnpm --filter @alpha-kanban/web typecheck`
- [x] route helper/unit test 또는 component-level route parse test
- [x] `pnpm --filter @alpha-kanban/web build`
- [x] direct URL smoke: `/`, `/w/:id`, `/w/:id?file=...`, ticket detail URL
- [x] Start page/auto-open smoke

사용자 지시:

- 2026-06-25: 앱이 애초에 TanStack Router 기반인데 manual History API로 충분하다고 본 판단이 잘못됐으므로, 라우팅 정리부터 진행한다.
- 2026-06-25: AKW-32 스모크 완료.

진행 메모:

- 2026-06-25: 초안 작성. AKW-31 runtime settings는 route state가 더 늘어나기 전에 이 티켓 이후로 진행하는 선행 관계로 정리한다.
- 2026-06-25: `apps/web/src/main.tsx` route tree에 `/w/$workspaceId`를 추가하고, route helper를 `apps/web/src/appRoute.ts`로 분리했다. `App.tsx`는 TanStack Router `useLocation`/`useNavigate`로 URL state를 읽고 쓰며, 기존 `window.history.replaceState`, `hashchange`, `popstate` 기반 동기화를 제거했다.
- 2026-06-25: 검증 완료: `pnpm --filter @alpha-kanban/web typecheck`, `pnpm --filter @alpha-kanban/web test -- appRoute`, `pnpm --filter @alpha-kanban/web build`, `git diff --check`. `pnpm build`는 기존처럼 Vite chunk-size warning만 표시하고 성공했다. 브라우저 direct URL smoke는 아직 미실행이다.
- 2026-06-25: 사용자 브라우저 스모크 완료 확인을 반영했다. 라우팅 구현 검증과 direct URL/Start page smoke evidence가 모두 충족되어 DONE 처리한다.

### AKW-33. ticket-md Markdown safe patch CLI 구현

Status: DONE
Progress: 100%
Completed at: 2026-06-25T19:22:35+09:00
Repository:

- `alpha-kanban`
- `scripts`

Priority: P0
Type: Tooling / Safety / Test
Depends on:

- `AKW-32`

목표:

- plan-ticketing Markdown에서 특정 ticket body만 구조적으로 찾아 안전하게 상태, 진행률, 사용자 지시, 진행 메모를 수정하는 CLI를 제공한다.
- Codex가 반복 텍스트를 잘못 매칭해 다른 ticket의 `Status`/`Progress`나 로그를 바꾸는 실수를 줄인다.

현재 문제:

- ticket 문서는 같은 `Status:`, `Progress:`, `사용자 지시:`, `진행 메모:` field가 반복되므로 본문 텍스트 기반 patch context가 잘못 잡히면 인접 ticket을 수정할 수 있다.
- 사람이 line number를 눈으로 확인해도 실제 patch는 전체 문서 텍스트 매칭으로 적용될 수 있어, 패치 전후 대상 line range를 기계적으로 확인하는 절차가 없다.

구현 범위:

- root `pnpm ticket-md` CLI를 추가한다.
- `show` 명령은 ticket heading 기준 line range와 주요 field line을 출력한다.
- `status` 명령은 unique ticket id를 찾아 해당 ticket range 안의 `Status`, `Progress`, `Completed at`만 수정하고 top-level `현재 진행률`을 재계산한다.
- `append-user`, `append-note` 명령은 해당 ticket의 `사용자 지시`, `진행 메모` section에만 append한다.
- `check` 명령은 duplicate ticket id, top-level progress 불일치, status/progress 필드 문제를 검출한다.
- 모든 write 명령은 patch 전후 line range와 field line을 출력한다.

제외 범위:

- 범용 Markdown AST editor
- Codex `apply_patch` 자체 대체
- UI에서 직접 이 CLI 호출
- plan/inventory 문서 수정

완료 기준:

- [x] `pnpm ticket-md show`가 대상 ticket line range를 출력한다.
- [x] `pnpm ticket-md status`가 지정 ticket range 안에서만 status/progress를 바꾼다.
- [x] `pnpm ticket-md append-user`와 `append-note`가 지정 section에 append한다.
- [x] `pnpm ticket-md check`가 현재 ticket 문서를 검증한다.
- [x] 문서 갱신 작업에 CLI를 dogfood해 전후 line report를 확인한다.

검증:

- [x] `pnpm ticket-md check docs/04_alpha_kanban_multi_workspace_tickets.md`
- [x] `pnpm ticket-md show docs/04_alpha_kanban_multi_workspace_tickets.md AKW-33`
- [x] `pnpm ticket-md status ... AKW-33 --status DONE --progress 100`
- [x] `git diff --check`

사용자 지시:

- 2026-06-25: 패치 위치를 잘못 잡는 문제를 줄이기 위해, 대상 ticket line number를 정확히 점검하고 patch 후 바뀐 line까지 다시 점검하는 전용 script/program을 만든다.
- 2026-07-01: 전역 plan-ticketing 스킬이 설치된 사람은 Alpha Kanban WebUI와 별개로 ticket-md helper를 사용할 수 있어야 한다.

진행 메모:

- 2026-06-25: 초안 작성. 구현은 static line number 입력이 아니라 unique ticket heading으로 range를 계산하고, 그 range 안에서만 field line index를 수정하는 방식으로 진행한다.
- 2026-06-25: pnpm ticket-md check/show로 대상 ticket line range와 field line 출력이 정상 동작함을 확인했다.
- 2026-06-25: append-user dry-run도 전후 line range와 field line을 출력하며 파일을 쓰지 않는 것을 확인했다.
- 2026-07-01: ticket-md 본체를 skills/plan-ticketing/scripts/ticket-md.mjs로 번들링하고, root scripts/ticket-md.mjs는 해당 helper를 호출하는 wrapper로 축소했다. pnpm install:skill로 전역 ~/.codex/skills/plan-ticketing/scripts/ticket-md.mjs 설치와 직접 실행을 확인했다.
