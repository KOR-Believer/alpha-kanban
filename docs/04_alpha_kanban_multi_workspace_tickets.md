# Alpha Kanban Multi Workspace 티켓

## Status

- 작성일: 2026-06-22
- 기준 문서: `docs/03_alpha_kanban_multi_workspace_plan.md`
- 목적: Alpha Kanban이 자기 repository docs에 고정되지 않고 사용자가 선택한 target workspace의 plan-ticketing 문서를 탐색, 수정, 실행하도록 확장한다.
- 범위: `alpha-kanban`
- 현재 진행률: `1 / 9 tickets`

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
| AKW-01 | READY | 25% | `packages/shared`, `apps/server` | AKW-00 |
| AKW-02 | READY | 25% | `apps/server`, `packages/shared` | AKW-01 |
| AKW-03 | READY | 25% | `apps/server`, `packages/shared` | AKW-01, AKW-02 |
| AKW-04 | TODO | 0% | `apps/web`, `packages/shared` | AKW-02, AKW-03 |
| AKW-05 | TODO | 0% | `apps/server`, `apps/web` | AKW-03, AKW-04 |
| AKW-06 | TODO | 0% | `alpha-kanban`, `apps/server`, `apps/web` | AKW-01, AKW-02, AKW-03, AKW-04, AKW-05, AKW-07, AKW-08 |
| AKW-07 | TODO | 0% | `apps/web`, `apps/server`, `packages/shared` | AKW-03, AKW-04, AKW-05 |
| AKW-08 | TODO | 0% | `apps/web`, `apps/server`, `packages/shared` | AKW-02, AKW-03, AKW-04, AKW-05, AKW-07 |

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
- [x] 새 티켓 문서 top-level 진행률이 `1 / 9 tickets`로 Progress Board와 일치한다.

사용자 지시:

- 2026-06-22: Alpha Kanban이 자기 프로젝트 docs가 아니라 workspace를 골라 그 project의 docs를 리스팅하고 진행을 지시하는 구조로 바꾸고 싶다.
- 2026-06-22: recent 관리는 칸반 앱의 local state JSON에 유지하는 방향이 맞다.
- 2026-06-22: 기존 MVP 티켓은 완료 상태로 두고 새 plan/ticket을 만들어 진행한다.

진행 메모:

- 2026-06-22: 초안 작성.
- 2026-06-22: 기존 AKB-00부터 AKB-07까지 DONE 상태를 확인하고 multi-workspace phase를 별도 문서로 분리했다.

### AKW-01. Config/state schema를 multi-workspace 기준으로 확장

Status: READY
Progress: 25%
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

- [ ] server config가 `workspaceRoots`와 `defaultDocRoots`를 구분한다.
- [ ] local state가 recent workspace와 workspace-scoped document session을 저장할 수 있다.
- [ ] 기존 state 파일이 있어도 server boot가 실패하지 않는다.
- [ ] target project에는 state 파일을 쓰지 않는다.

검증:

- [ ] config loader unit test
- [ ] state migration unit test
- [ ] backward compatibility test

사용자 지시:

- 2026-06-22: recent는 대상 project docs/config가 아니라 Alpha Kanban local state JSON에 유지한다.

진행 메모:

- 2026-06-22: 초안 작성.

### AKW-02. Workspace discovery와 allowlist path 검증 API 구현

Status: READY
Progress: 25%
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

- [ ] allowlist 내부 project만 API에 반환된다.
- [ ] allowlist 밖 absolute path는 거부된다.
- [ ] symlink가 allowlist 밖을 가리키면 거부된다.
- [ ] recent workspace가 삭제된 경우 unavailable 상태로 표현된다.

검증:

- [ ] API integration test
- [ ] symlink/path traversal test
- [ ] unavailable recent workspace test

사용자 지시:

- 2026-06-22: allowlist는 OS 접근권한이 아니라 앱 내부 workspace root 정책으로 이해한다.

진행 메모:

- 2026-06-22: 초안 작성.

### AKW-03. Per-workspace Markdown file API와 FileStore 분리

Status: READY
Progress: 25%
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

- [ ] selected workspace의 docs만 file list에 나온다.
- [ ] 같은 relative path를 가진 두 workspace가 서로 다른 file id로 처리된다.
- [ ] ticket write가 selected workspace 파일에만 반영된다.
- [ ] stale write protection이 workspace-scoped로 유지된다.

검증:

- [ ] two-workspace file list integration test
- [ ] two-workspace same relative path collision test
- [ ] ticket patch/instruction/progress note API test

사용자 지시:

- 2026-06-22: workspace를 골라 그 project에 있는 docs를 리스팅하고 그 project에 진행을 지시하는 구조가 필요하다.

진행 메모:

- 2026-06-22: 초안 작성.

### AKW-04. Project switcher와 recent workspace UX 구현

Status: TODO
Progress: 0%
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

- [ ] last workspace가 있으면 앱 진입 시 해당 project board가 열린다.
- [ ] workspace가 없으면 project selection empty state가 표시된다.
- [ ] switcher에서 project를 바꾸면 ticket documents와 board가 바뀐다.
- [ ] selected project가 unavailable이면 복구 가능한 UI가 표시된다.
- [ ] UI가 Notion-like flat board 구조를 유지한다.

검증:

- [ ] component/API mocked smoke
- [ ] desktop browser smoke
- [ ] mobile browser smoke

사용자 지시:

- 2026-06-22: 운영 UX 기준으로는 프로젝트 선택 UI가 먼저 있고, 마지막 선택 프로젝트가 있으면 바로 그 칸반으로 들어가는 방식이 좋다.

진행 메모:

- 2026-06-22: 초안 작성.

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

목표:

- multi-workspace flow가 기존 single-workspace dogfooding을 깨지 않고 실제 다른 project 문서에도 적용되는지 검증한다.

현재 문제:

- 기존 검증은 Alpha Kanban 자기 docs와 sample fixture 중심이다.
- target workspace 선택, recent state, workspace-scoped session, Codex cwd routing을 묶은 regression check가 없다.

구현 범위:

- README의 config/state 설명을 multi-workspace 기준으로 갱신한다.
- sample 또는 test fixture로 두 개 workspace를 구성한다.
- API, UI, Codex mocked integration 검증을 실행한다.
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
- [ ] README와 티켓 문서가 실제 구현 상태와 일치한다.

검증:

- [ ] automated test suite
- [ ] desktop browser smoke
- [ ] mobile browser smoke
- [ ] document/workspace chat smoke
- [ ] manual checklist

사용자 지시:

- 2026-06-22: 샘플 fixture와 실제 제품 진행률은 구분하고, 새 phase는 별도 티켓으로 추적한다.

진행 메모:

- 2026-06-22: 초안 작성.

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
