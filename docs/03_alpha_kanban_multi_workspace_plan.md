# Alpha Kanban Multi Workspace 구현 계획 초안

작성일: 2026-06-22
수정일: 2026-06-22

## 영향 범위

대상 repository:

- `alpha-kanban`

예정 package/module:

- `apps/server`: workspace allowlist, project discovery, per-workspace file API, Codex cwd/session routing
- `apps/web`: project switcher, recent workspace UI, selected workspace scoped board
- `packages/shared`: workspace/config/state/API DTO schema
- `docs`: multi-workspace phase plan/ticket 문서

참고 문서:

- `docs/01_alpha_kanban_plan.md`: 기존 single-workspace MVP 설계
- `docs/02_alpha_kanban_tickets.md`: 기존 AKB-00부터 AKB-07까지 완료된 MVP 티켓

## 목표

- Alpha Kanban 앱 자체 repository가 아니라, 사용자가 선택한 target project의 plan-ticketing 문서를 탐색한다.
- 설정된 workspace root allowlist 아래의 project를 선택할 수 있게 한다.
- 선택된 project의 `docs` 등 configured doc roots에서 `*_tickets.md`, `*_plan.md`, `*_inventory.md`를 리스팅한다.
- ticket board, detail drawer, Markdown write, `Run with Codex`가 모두 선택된 target project 기준으로 동작하게 한다.
- Codex CLI 실행이 진행 중인지, 끝났는지, 실패했는지 사용자가 터미널 로그를 보지 않아도 알 수 있는 상태 신호를 제공한다.
- 외부 Codex CLI, Cursor, editor가 Markdown 문서를 직접 수정했을 때 UI가 stale 상태를 인지하고 갱신할 수 있게 한다.
- 선택된 ticket, 선택된 Markdown document, 선택된 workspace 전체를 구분해 각각 다른 대화/실행 입력 surface를 제공한다.
- recent project, last selected project, project별 last selected ticket document, Codex session id를 local-only state에 저장한다.
- 기존 Alpha Kanban 자기 문서 dogfooding 흐름은 target project 중 하나로 유지한다.

## 비목표

- OS filesystem permission을 변경하거나 macOS 권한 요청을 관리하지 않는다.
- 사용자가 입력한 임의 절대 경로를 제한 없이 열지 않는다.
- 대상 project repository에 Alpha Kanban 전용 state 파일을 쓰지 않는다.
- 여러 사용자가 공유하는 원격 workspace registry나 SaaS 동기화는 만들지 않는다.
- target project의 dependency install, bootstrap, git branch 생성 자동화는 이번 phase의 기본 범위에서 제외한다.
- `examples/sample_tickets.md` fixture를 운영 project 목록으로 승격하지 않는다.

## 현재 상태 요약

- 현재 `alpha-kanban.config.json`은 `docRoots: ["docs", "examples"]`, `workspaceRoots: ["."]`, `codexCommand: "codex"`를 가진다.
- `apps/server/src/config.ts`는 server 실행 root를 `workspaceRoot`로 잡고, `docRoots`와 `workspaceRoots`를 모두 이 root 기준 절대 경로로 변환한다.
- `apps/server/src/config.ts`는 `defaultDocRoots`와 `workspaceRoots`를 분리해 읽으며, 기존 `docRoots`는 backward-compatible alias로 유지한다.
- `apps/server/src/files.ts`는 현재 config의 `docRoots`만 scan하고, file id도 단일 `workspaceRoot` 상대 경로를 기반으로 만든다.
- `apps/server/src/codexRunner.ts`는 Codex process `cwd`를 config의 `workspaceRoot`로 고정하고, prompt에도 같은 root를 project path로 넣는다.
- `.alpha-kanban/state.json`은 이미 local-only Codex session state 용도로 사용되고 있으며 gitignore 대상이다.
- `packages/shared`와 `apps/server/src/codexState.ts`는 state schema v2를 사용한다. Recent workspace, last workspace, workspace-scoped document session, run read-state는 control app `.alpha-kanban/state.json`에 저장한다.
- 기존 v1 document session key인 `docs/foo_tickets.md`는 읽을 수 있고, 다음 state write 시 `workspaceId::docs/foo_tickets.md` 형태로 마이그레이션된다.
- `apps/server/src/workspaces.ts`는 `workspaceRoots` allowlist를 `realpath` 기준으로 검증하고, `GET /api/workspaces`, `POST /api/workspaces/select`로 candidate listing과 recent workspace 기록을 제공한다.
- `POST /api/workspaces/select`는 allowlist 밖 absolute path, `..` traversal, allowlist 내부 symlink가 외부를 가리키는 escape를 모두 `WORKSPACE_OUTSIDE_ALLOWLIST`로 거부한다.
- `apps/server/src/files.ts`는 control app용 legacy `MarkdownFileStore`와 target workspace용 store를 같은 구현으로 생성할 수 있다. Workspace-scoped file summary는 `workspaceId`, `workspaceRelativePath`를 포함하고 file id도 workspace id를 포함해 같은 relative path 충돌을 피한다.
- `apps/server/src/app.ts`는 `GET /api/workspaces/:workspaceId/files`, workspace-scoped ticket read/write/instruction/progress-note route를 제공한다. 기존 `/api/files` route는 frontend switcher 전환 전 compatibility route로 유지한다.
- UI는 시작 시 바로 `/api/files`를 호출하고 첫 ticket document를 선택한다. project 선택 단계는 없다.
- 현재 UI는 app 내부 mutation 후에는 query invalidation으로 갱신되지만, 외부 CLI/editor가 Markdown을 직접 수정한 경우 server push나 watcher 기반 invalidation이 없어 사용자가 새로고침해야 한다.
- 현재 Codex run 로그는 `.alpha-kanban/runs/*.jsonl`에 저장되지만, UI에 ticket/document/workspace 단위 실행 상태 신호가 없어 실행 중인지, 중단됐는지, 완료됐는지 판단하기 어렵다.
- 기존 본 프로젝트 티켓 문서는 `docs/02_alpha_kanban_tickets.md` 기준 `8 / 8 tickets`로 완료 상태다.

## 제안 아키텍처

### 1. Control app과 target workspace 분리

Alpha Kanban repository는 control app이다. 사용자가 실제로 작업할 target workspace는 별도 entity로 관리한다.

```text
alpha-kanban/
  apps/server
  apps/web
  .alpha-kanban/state.json

/Users/kiseong.park/workspace/
  alpha-kanban/       # target workspace로도 선택 가능
  sparkone/
  other-project/
```

서버의 own root와 target workspace root를 혼동하지 않는다. server config의 workspace allowlist는 target project 후보의 상위 경계를 뜻한다.

### 2. Config와 local state 역할 분리

`alpha-kanban.config.json`은 정적 정책만 가진다.

```json
{
  "workspaceRoots": ["/Users/kiseong.park/workspace"],
  "defaultDocRoots": ["docs"],
  "codexCommand": "codex"
}
```

`.alpha-kanban/state.json`은 사용자별 동적 상태를 가진다.

```json
{
  "recentWorkspaces": [
    {
      "id": "hash-or-stable-id",
      "root": "/Users/kiseong.park/workspace/sparkone",
      "label": "sparkone",
      "lastOpenedAt": "2026-06-22T00:00:00.000Z"
    }
  ],
  "lastWorkspaceId": "hash-or-stable-id",
  "documents": {
    "hash-or-stable-id::docs/02_tickets.md": {
      "codexSessionId": "thread-id",
      "lastTicketId": "SPK-04"
    }
  }
}
```

State 파일은 Alpha Kanban control app 아래에만 저장하고, target project에는 쓰지 않는다.

### 3. Workspace discovery and allowlist

1. server가 `workspaceRoots` allowlist를 읽는다.
2. 각 allowlist root 아래 1-depth directory를 project 후보로 scan한다.
3. candidate는 Git repository, `docs` directory, 또는 plan-ticketing 문서 존재 여부를 기준으로 표시 우선순위를 정한다.
4. 사용자가 project를 선택하면 server는 해당 absolute path가 allowlist 내부인지 `realpath` 기준으로 검증한다.
5. symlink, `..`, path traversal로 allowlist 밖으로 나가는 경로는 거부한다.

### 4. Per-workspace file API

API는 selected workspace id를 route boundary에 포함한다.

```text
GET /api/workspaces
POST /api/workspaces/select
GET /api/workspaces/:workspaceId/files
GET /api/workspaces/:workspaceId/files/:fileId/tickets
PATCH /api/workspaces/:workspaceId/files/:fileId/tickets/:ticketId
POST /api/workspaces/:workspaceId/files/:fileId/tickets/:ticketId/instructions
POST /api/workspaces/:workspaceId/files/:fileId/tickets/:ticketId/progress-notes
POST /api/workspaces/:workspaceId/codex/prompt-preview
POST /api/workspaces/:workspaceId/codex/runs
```

File id는 `workspaceId`와 workspace-relative path를 함께 검증한다. 같은 relative path가 다른 project에 있어도 충돌하지 않아야 한다.

### 5. UI flow

- 앱 시작 시 local state의 `lastWorkspaceId`가 유효하면 해당 project board로 바로 진입한다.
- last workspace가 없거나 allowlist 밖이면 board 대신 project selection empty state를 보여준다.
- 좌측 상단에 project switcher를 둔다.
- switcher는 recent project와 allowlist 아래 discovered project를 함께 보여준다.
- project 선택 후 기존 file browser는 selected project의 ticket documents만 표시한다.
- board/detail drawer는 현재처럼 유지하되, header와 prompt preview에 target project context를 명확히 표시한다.
- ticket drawer 안의 `Run with Codex` draft는 선택 ticket 하나를 실행하는 입력으로 유지한다.
- selected ticket document 전체에 대한 질문/논의는 board 우측 collapsible `Document Chat` panel에서 처리한다.
- selected workspace 전체 docs에 대한 질문/논의와 새 plan/ticket 생성 논의는 sidebar project 영역의 `Workspace Chat` entry에서 modal 또는 sheet로 연다.
- chat 입력은 기본적으로 Markdown을 바로 수정하지 않는다. 사용자가 명시적으로 기록하거나 실행할 때만 `사용자 지시` append, 새 plan/ticket 생성, 또는 ticket 실행으로 전환한다.

### 6. Chat scope model

Alpha Kanban에는 세 가지 입력 scope가 공존한다.

```text
Ticket Run Draft  -> selected ticket 하나의 실행 지시
Document Chat     -> selected *_tickets.md 문서 전체에 대한 질문/논의
Workspace Chat    -> selected project 전체 docs에 대한 질문/논의와 새 plan/ticket 생성
```

- `Ticket Run Draft`는 ticket detail drawer 내부에 둔다.
- `Document Chat`은 board 우측 panel에 둔다. 현재 선택한 ticket document path를 명확히 표시한다.
- `Workspace Chat`은 project switcher 아래 entry에서 연다. 현재 project root와 전체 plan/ticket/inventory docs scope를 명확히 표시한다.
- chat transcript는 초기에는 local-only state 또는 run log로 관리하고, Markdown에는 사용자가 명시적으로 선택한 요약만 append한다.
- `$plan-ticketing` 또는 plan/ticket 생성 요청은 `Workspace Chat`에서 가장 자연스러운 primary flow로 다룬다.

### 7. Codex runner flow

1. `Run with Codex` 요청은 `workspaceId`, `fileId`, `ticketId`, `instructionDraft`를 포함한다.
2. server는 `workspaceId`를 검증해 target workspace root를 구한다.
3. 실행 지시 summary는 target ticket 문서의 `사용자 지시`에 append한다.
4. prompt에는 target workspace root, ticket file absolute path, plan file absolute path, selected ticket id, ticket range hint를 넣는다.
5. `spawn(codexCommand, args, { cwd: targetWorkspaceRoot })`로 실행한다.
6. Codex session id는 `.alpha-kanban/state.json`의 `workspaceId::ticketRelativePath` 단위로 저장한다.
7. run log는 control app의 `.alpha-kanban/runs/`에 저장하되, log entry에는 target workspace와 ticket file relative path를 포함한다.

### 8. Run status signal model

자세한 terminal log는 debug 용도로 유지하되, 제품 UX에는 간단한 실행 상태 신호를 제공한다.

```text
Idle
Running
Succeeded
Failed
Canceled
Needs auth
Unknown / stale
```

- ticket card에는 해당 ticket에 active run이 있을 때만 작은 dot/badge를 표시한다.
- selected document 안에 active run이 있으면 board header 또는 document header에 document-level run indicator를 표시한다.
- workspace switcher 이후에는 selected workspace 어딘가에 active run이 있을 때 workspace-level indicator로 확장한다.
- detail drawer를 닫았다 다시 열어도 active run summary는 다시 볼 수 있어야 한다.
- full terminal log replay는 필수 제품 기능이 아니라 debug affordance로 둔다. 우선순위는 status summary와 failure/auth/cancel 신호다.
- MVP의 실행 정책은 같은 plan/ticket Markdown document session 안에서 active run 하나만 허용한다.
- 새 run 요청 시 같은 document에 `queued` 또는 `running` run이 있으면 서버가 거부하고 기존 active run summary를 반환한다.
- Codex가 실행 중 내부적으로 subagent나 병렬 tool call을 사용하는 것은 하나의 outer run으로 취급한다.
- 향후 병렬 실행 확장을 위해 run history는 여러 개 저장할 수 있게 두되, 제품 UX의 기본 action은 document-scoped single active run으로 유지한다.
- `succeeded`, `failed`, `cancelled`, `needs_auth` 같은 finished run은 사용자가 명시적으로 읽음 처리하기 전까지 unread result로 남긴다.
- unread/read state는 browser localStorage가 아니라 control app의 `.alpha-kanban/state.json`에 `runId -> readAt` 형태로 저장한다.
- 시간 기반 자동 만료는 사용하지 않는다. 주말이나 장기 휴식 후에도 읽지 않은 결과는 계속 보여야 한다.
- ticket card에는 active run 또는 unread finished result만 표시하고, read 처리된 finished run은 drawer history에서만 확인한다.

### 9. Markdown change sync model

외부 CLI/editor가 target Markdown을 수정하는 것은 정상 workflow로 취급한다. Alpha Kanban은 이를 감지하거나 최소한 stale 상태를 명확히 보여줘야 한다.

- server는 selected workspace의 configured doc roots에 대해 Markdown file watcher를 운영한다.
- file watcher는 `*_tickets.md`, `*_plan.md`, `*_inventory.md`, 일반 `.md` 변경을 감지한다.
- 변경 이벤트는 SSE 또는 websocket으로 UI에 전달한다.
- UI는 현재 열린 file이 바뀌면 query를 invalidate/refetch하거나, 사용자가 편집 중이면 stale banner와 `Reload` action을 보여준다.
- focus regain, manual refresh button, 짧은 interval polling은 watcher가 놓친 변경을 보완하는 fallback으로 둔다.
- 외부 변경과 UI stale write guard는 같은 정책으로 연결되어야 한다. 오래된 hash/mtime으로 write하면 `STALE_FILE`을 유지한다.

## 보안/운영 원칙

- allowlist는 OS 권한이 아니라 Alpha Kanban 앱 내부 policy boundary다.
- `workspaceRoots` 밖의 project 선택, file read, file write, Codex cwd 실행을 모두 거부한다.
- `realpath` 기반으로 symlink와 traversal을 검증한다.
- target project에는 `.alpha-kanban/state.json` 같은 앱 state를 쓰지 않는다.
- Codex command는 shell string이 아니라 argument array로 실행한다.
- target workspace path, ticket path, instruction draft는 shell interpolation에 사용하지 않는다.
- local server는 계속 `127.0.0.1` bind를 기본으로 유지한다.
- stale write protection은 workspace별 file hash/mtime 기준으로 유지한다.
- file watcher는 allowlist와 selected workspace doc roots 내부만 감시한다.
- run status indicator는 local app state와 in-memory active run registry를 표시할 뿐, Codex process를 암묵적으로 cancel하거나 재시작하지 않는다.
- 같은 document session의 active run은 하나만 허용해 Markdown 동시 쓰기와 Codex session context 섞임을 피한다.
- run result read state는 control app의 local state로 취급하고 target project repository에는 쓰지 않는다.

## 에러 정책

- `WORKSPACE_NOT_FOUND`: 요청한 workspace id가 state와 discovery 결과에서 찾을 수 없다.
- `WORKSPACE_OUTSIDE_ALLOWLIST`: workspace path가 configured allowlist 밖이다.
- `WORKSPACE_UNAVAILABLE`: recent workspace가 삭제되었거나 접근할 수 없다.
- `DOC_ROOT_NOT_FOUND`: selected workspace 안의 configured doc root가 없다.
- `FILE_OUTSIDE_WORKSPACE`: file id가 selected workspace 밖을 가리킨다.
- `FILE_NOT_FOUND`: selected workspace의 Markdown 파일이 삭제되었다.
- `STALE_FILE`: selected workspace의 Markdown 파일이 사용자가 열어둔 이후 변경되었다.
- `CODEX_RUN_FAILED`: target workspace cwd에서 Codex process가 실패했다.
- `RUN_STATUS_UNKNOWN`: UI가 알고 있는 active run과 server registry/log state가 불일치한다.
- `FILE_CHANGED_EXTERNALLY`: 현재 열려 있는 Markdown 파일이 외부 process에 의해 변경되어 refetch가 필요하다.

## 검증 계획

API:

- workspace discovery가 allowlist 내부 project만 반환하는지 검증한다.
- symlink, `..`, absolute path traversal이 allowlist 밖으로 나갈 때 거부되는지 검증한다.
- 같은 relative ticket path를 가진 두 workspace가 독립 file id/session id를 갖는지 검증한다.
- workspace별 file scan, ticket read, status/progress patch, instruction append, progress note append를 검증한다.
- Codex prompt preview와 run이 target workspace cwd/path를 사용하는지 mocked process로 검증한다.
- active run registry가 running/succeeded/failed/canceled/auth-required 상태를 ticket/document/workspace scope로 요약하는지 검증한다.
- Markdown watcher가 외부 파일 변경을 감지하고 workspace/file-scoped event를 내보내는지 검증한다.

UI:

- last workspace 없음 상태에서 project selection empty state가 표시되는지 확인한다.
- recent workspace가 있으면 바로 해당 project board가 열리는지 확인한다.
- project switcher로 target project를 바꾸면 file list와 board가 workspace scope로 갱신되는지 확인한다.
- selected project가 unavailable일 때 recover UI가 표시되는지 확인한다.
- Codex 실행 중/완료/실패 상태가 ticket card, document header, workspace scope에서 명확히 표시되는지 확인한다.
- 외부 CLI/editor가 Markdown을 바꾼 뒤 현재 board/detail이 stale 상태를 표시하거나 자동 refetch되는지 확인한다.
- desktop/mobile viewport에서 sidebar switcher와 board가 겹치지 않는지 확인한다.

Manual smoke:

- `alpha-kanban` 자신을 target workspace로 선택해 기존 문서가 계속 동작하는지 확인한다.
- 다른 project의 `docs/*_tickets.md`를 선택해 board/detail/write가 그 project 파일에만 반영되는지 확인한다.
- `Run with Codex` preview가 target project root와 target ticket file을 표시하는지 확인한다.
- 별도 CLI에서 selected Markdown을 수정한 뒤 UI가 변경 감지 신호 또는 refresh를 제공하는지 확인한다.
- Codex run 중 drawer를 닫았다 다시 열어도 run status indicator가 유지되는지 확인한다.

## Open Questions

- project candidate scan은 allowlist root 아래 1-depth로 시작할지, configured depth를 둘지 결정한다.
- target workspace별 doc roots override를 UI에서 편집할지, 이번 phase에서는 `defaultDocRoots`만 사용할지 결정한다.
- unavailable recent workspace를 자동 제거할지, 사용자가 직접 dismiss하게 할지 결정한다.
