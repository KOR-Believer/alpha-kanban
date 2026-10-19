# Alpha Kanban Multi Workspace 구현 계획 초안

> 2026-10-18 적용 상태: 서버형 multi-workspace의 설계 이력이다. 프로젝트 구분·정렬·문서 탐색의 사용자 요구는 유지하지만 서버 allowlist/API·Codex 세션·채팅·실행 로그 UI는 현재 범위가 아니다. 폴더 권한·ID·설정은 AKL-01~06의 브라우저 계약을 따른다. [현재 작업 구분](21_alpha_kanban_browser_transition_inventory.md)

작성일: 2026-06-22
수정일: 2026-06-23

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
- `DESIGN-notion.md`: Notion 계열 app chrome, surface, typography, spacing, scrollbar 정렬 기준

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

- 현재 `alpha-kanban.config.json`은 `workspaceRoots: [".."]`, `defaultDocRoots: ["docs", "examples"]`, `codexCommand: "codex"`를 가진다.
- `apps/server/src/config.ts`는 server 실행 root를 control app root로 잡고, `defaultDocRoots`와 `workspaceRoots`를 이 root 기준 절대 경로로 변환한다.
- `apps/server/src/config.ts`는 `defaultDocRoots`와 `workspaceRoots`를 분리해 읽으며, 기존 `docRoots`는 backward-compatible alias로 유지한다.
- legacy `/api/files` route는 control app의 default doc roots를 scan하고, workspace-scoped file API는 selected target workspace의 default doc roots를 scan한다.
- `apps/server/src/codexRunner.ts`는 target workspace용 `MarkdownFileStore`를 받아 prompt root, ticket path, plan path, `spawn` cwd를 selected target workspace 기준으로 구성한다.
- `.alpha-kanban/state.json`은 이미 local-only Codex session state 용도로 사용되고 있으며 gitignore 대상이다.
- `packages/shared`와 `apps/server/src/codexState.ts`는 state schema v2를 사용한다. Recent workspace, last workspace, workspace-scoped document session, run read-state는 control app `.alpha-kanban/state.json`에 저장한다.
- 기존 v1 document session key인 `docs/foo_tickets.md`는 읽을 수 있고, 다음 state write 시 `workspaceId::docs/foo_tickets.md` 형태로 마이그레이션된다.
- `apps/server/src/workspaces.ts`는 `workspaceRoots` allowlist를 `realpath` 기준으로 검증하고, `GET /api/workspaces`, `POST /api/workspaces/select`로 candidate listing과 recent workspace 기록을 제공한다.
- `POST /api/workspaces/select`는 allowlist 밖 absolute path, `..` traversal, allowlist 내부 symlink가 외부를 가리키는 escape를 모두 `WORKSPACE_OUTSIDE_ALLOWLIST`로 거부한다.
- `apps/server/src/app.ts`는 `GET /api/workspace-directories`를 제공한다. 이 API는 allowlist root, 현재 directory, parent path, child directories를 반환하고, traversal/symlink escape를 `realpath` 기준으로 거부한다.
- `apps/server/src/files.ts`는 control app용 legacy `MarkdownFileStore`와 target workspace용 store를 같은 구현으로 생성할 수 있다. Workspace-scoped file summary는 `workspaceId`, `workspaceRelativePath`, `directory`, `sequenceNumber`를 포함하고 file id도 workspace id를 포함해 같은 relative path 충돌을 피한다.
- `apps/server/src/files.ts`는 같은 workspace/directory/slug를 기준으로 plan/tickets/inventory/markdown file을 `DocumentSet`으로 묶고, `NN`은 정렬 hint로만 사용한다. Tickets document가 포함된 set은 `parseTicketDocument`로 done/total progress summary를 제공한다.
- `apps/server/src/app.ts`는 `GET /api/workspaces/:workspaceId/files`, `GET /api/workspaces/:workspaceId/document-sets`, `GET /api/workspaces/:workspaceId/files/:fileId/markdown`, workspace-scoped ticket read/write/instruction/progress-note route를 제공한다. 기존 `/api/files`, `/api/document-sets`, `/api/files/:fileId/markdown` route는 compatibility route로 유지한다.
- `apps/server/src/app.ts`는 `POST /api/workspaces/:workspaceId/codex/prompt-preview`, `POST /api/workspaces/:workspaceId/codex/runs`, `GET /api/workspaces/:workspaceId/files/:fileId/codex-run-summary`를 제공한다. Global run detail/event/cancel/read route는 run id로 해당 in-memory scoped runner를 찾아 이어진다.
- `apps/web/src/App.tsx`는 project switcher를 통해 `/api/workspaces`와 workspace-scoped document set API를 사용한다. Last workspace가 유효하면 바로 board로 진입하고, URL route state가 있으면 route state가 우선한다.
- project switcher는 sidebar에서 현재 project compact button으로 표시되고, recent/discovered project 선택, absolute path 직접 입력 fallback, server-backed `Browse` folder picker는 `Switch project` modal 안에서 제공한다. Folder picker는 shadcn 스타일 Dialog 안에서 allowlist roots, path bar, details-view folder list, `Select Folder` action으로 구성된다. Native folder input은 browser privacy policy 때문에 absolute path를 제공하지 않으므로 selected workspace cwd를 정하는 primary mechanism으로 쓰지 않는다.
- browser route state는 project를 `/w/:workspaceId` path로, selected Markdown document를 `?file={workspaceRelativePath}` query로, ticket detail open state를 `#ticket={ticketId}&detail={side|modal}` hash로 분리한다. 새로고침 또는 직접 URL 진입 시 selected project/document/ticket detail 상태를 복원한다.
- sidebar documents 영역은 flat ticket list가 아니라 Document Set navigator를 표시한다. `tickets` type은 기존 Kanban board와 ticket detail/run affordance를 렌더링하고, `plan`, `inventory`, `markdown` type은 outline, linked docs, ticket progress summary를 포함한 Markdown reader mode를 렌더링한다.
- app shell은 desktop에서 `100dvh` 높이 안에 고정되고, sidebar width는 280px-560px 범위에서 resize handle로 조절한다. Width는 browser localStorage에 저장하며, sidebar ticket document list는 sidebar 내부에서만 스크롤된다.
- `DESIGN-notion.md`를 local design reference로 두고, `AGENTS.md`가 frontend visual/layout 작업 전 이를 읽도록 지시한다. `apps/web/src/styles.css`는 Notion 계열 canvas/surface/hairline/spacing/radius/focus/control/panel/row/card token과 shared `ak-scroll-area`, `ak-scroll-content`, `ak-sidebar-scroll-content`, `ak-drawer-*` utilities를 제공한다.
- `apps/web/src/components/ui/button.tsx`, `badge.tsx`, `dialog.tsx`는 Notion-like foundation utility를 사용한다. Primary action만 blue accent를 쓰고, outline/ghost/default utility controls는 white surface와 hairline 중심으로 낮춘다.
- `apps/web/src/App.tsx`의 app shell, sidebar, folder picker, board columns/cards, ticket detail drawer, prompt preview, run log는 shared `ak-*` utility를 사용해 warm canvas, white surface, hairline border, quiet row/card state를 공유한다.
- ticket detail은 Notion-like local preference로 `side`와 `modal` presentation mode를 제공한다. 마지막 mode와 side panel width는 browser localStorage에 저장되고, side mode는 resize handle로 폭을 조절한다.
- Workspace-scoped board에서 ticket drawer의 `Run with Codex` preview/run/summary API는 selected workspace route를 사용한다. Preview prompt는 target workspace root, target ticket file path, plan file path, selected ticket range를 표시한다.
- ticket drawer의 `Run with Codex` 입력과 Codex final assistant answer는 control app `.alpha-kanban/chats/{workspaceId}/{fileKey}/{ticketId}.jsonl`에 ticket-scoped chat log로 저장된다. UI는 `Ticket chat` history를 Markdown으로 렌더링하고, raw `.alpha-kanban/runs/{runId}.jsonl`은 디버그/감사용 원본으로 유지한다.
- successful wrapper result note는 ticket Markdown `진행 메모`에 자동 append하지 않는다. Run status와 logPath는 run summary/raw log가 보존하고, 사람이 읽는 최종 답변은 chat log가 보존한다.
- `Run with Codex`는 단일 실행 버튼을 유지하고 `Edit files`/`Read-only` mode control로 의도를 구분한다. Edit mode는 기본값이며 기존 plan-ticketing append 정책을 유지하고, read-only mode는 prompt 계약으로 파일 수정과 Markdown append를 금지하며 답변만 ticket chat log에 저장한다.
- `CodexRunner`는 run 종료 후 assistant chat 저장과 read-only diff check를 먼저 수행한 뒤 terminal `exit`/`error` event를 발행해 UI가 종료 이벤트를 받은 시점에는 후처리 결과를 refetch할 수 있게 한다.
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

/workspace/
  alpha-kanban/       # target workspace로도 선택 가능
  example-project/
  other-project/
```

서버의 own root와 target workspace root를 혼동하지 않는다. server config의 workspace allowlist는 target project 후보의 상위 경계를 뜻한다.

### 2. Config와 local state 역할 분리

`alpha-kanban.config.json`은 정적 정책만 가진다.

```json
{
  "workspaceRoots": ["/workspace"],
  "defaultDocRoots": ["docs"],
  "codexCommand": "codex"
}
```

`workspaceRoots`는 target project가 정하는 값이 아니라 Alpha Kanban 앱 사용자 또는 운영자가 정하는 최대 allowlist다. 초기에는 config 파일로 관리하고, 제품 UX가 성숙하면 최초 실행 setup 또는 Settings 화면에서 같은 정책을 편집한다. 서버는 이 allowlist 밖 path를 `realpath` 기준으로 항상 거부한다.

`.alpha-kanban/state.json`은 사용자별 동적 상태를 가진다.

```json
{
  "recentWorkspaces": [
    {
      "id": "hash-or-stable-id",
      "root": "/workspace/example-project",
      "label": "example-project",
      "lastOpenedAt": "2026-06-22T00:00:00.000Z"
    }
  ],
  "lastWorkspaceId": "hash-or-stable-id",
  "documents": {
    "hash-or-stable-id::docs/02_tickets.md": {
      "codexSessionId": "thread-id",
      "lastTicketId": "DEMO-04"
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
GET /api/workspace-directories?root={absolutePath}
POST /api/workspaces/select
GET /api/workspaces/:workspaceId/files
GET /api/workspaces/:workspaceId/files/:fileId/tickets
PATCH /api/workspaces/:workspaceId/files/:fileId/tickets/:ticketId
POST /api/workspaces/:workspaceId/files/:fileId/tickets/:ticketId/instructions
POST /api/workspaces/:workspaceId/files/:fileId/tickets/:ticketId/progress-notes
GET /api/workspaces/:workspaceId/document-sets
POST /api/workspaces/:workspaceId/codex/prompt-preview
POST /api/workspaces/:workspaceId/codex/runs
```

File id는 `workspaceId`와 workspace-relative path를 함께 검증한다. 같은 relative path가 다른 project에 있어도 충돌하지 않아야 한다.

### 5. Document set and type-specific view model

Plan-ticketing skill은 보통 plan, tickets, inventory 문서를 한 작업 묶음으로 생성한다. Alpha Kanban은 flat Markdown file list만 보여주지 않고, 같은 작업 묶음을 `Document Set`으로 표시한다.

Grouping 규칙:

1. Strong match: 같은 directory 안에서 파일명이 `{NN}_{slug}_{plan|tickets|inventory}.md` 형태이고 `slug`가 같으면 같은 set으로 묶는다.
2. Weak hint: `NN`은 생성 순서와 정렬 hint로만 사용한다. Inventory가 plan/tickets보다 먼저 생기거나 번호가 떨어져 있어도 `slug`와 suffix가 우선이다.
3. Secondary evidence: 본문 안의 `기준 문서`, `연결 문서`, Markdown link, backtick path, absolute/relative path 언급은 set 관계를 보강하는 link evidence로 수집한다.
4. Unlinked / Standalone: suffix를 해석할 수 없거나 link evidence가 부족한 문서는 독립 문서로 유지한다.

View mode 규칙:

- `tickets` document를 선택하면 현재 Kanban board와 ticket detail interaction을 렌더링한다.
- `plan` document를 선택하면 Kanban이 아니라 plan reader를 렌더링한다. Plan reader는 Markdown outline, 목표/비목표/현재 상태/검증 계획 같은 주요 섹션, 연결된 tickets document의 progress summary를 함께 보여준다.
- `inventory` document를 선택하면 inventory reader를 렌더링한다. Inventory reader는 Matrix/Register/Repository details 같은 반복 섹션을 읽기 쉬운 outline 또는 table-like surface로 보여주고, 연결된 plan/tickets 문서를 함께 표시한다.
- `other` Markdown document는 generic Markdown reader로 열고, ticket mutation과 `Run with Codex` ticket prompt는 비활성화한다.

이 모델은 Sparkone처럼 실제 docs 안에서 `{NN}_{slug}_plan.md`, `{NN+1}_{slug}_tickets.md`, `{NN+2}_{slug}_inventory.md`가 대체로 지켜지지만 일부 inventory가 standalone이거나 번호가 떨어진 경우를 보수적으로 처리한다.

### 6. UI flow

- 앱 시작 시 local state의 `lastWorkspaceId`가 유효하면 해당 project board로 바로 진입한다.
- last workspace가 없거나 allowlist 밖이면 board 대신 project selection empty state를 보여준다.
- 좌측 상단에 project switcher를 둔다.
- switcher는 현재 project compact button으로만 보이고, recent/open path/discovered 목록은 항상 펼쳐두지 않는다.
- switcher modal은 recent project와 allowlist 아래 discovered project를 함께 보여준다.
- switcher modal은 absolute path 직접 입력을 power-user fallback으로 제공하고, 기본 선택 UX로 allowlist 내부 directory를 탐색하는 server-backed `Browse` modal을 제공한다.
- native folder input 또는 `webkitdirectory`는 absolute path를 노출하지 않으므로 selected workspace cwd를 정하는 primary mechanism으로 쓰지 않는다.
- desktop sidebar는 사용자가 폭을 조절할 수 있게 하고, recent path가 좁은 sidebar에서만 잘리지 않도록 path wrapping과 hover title을 제공한다.
- app 전체가 브라우저 document scroll에 의존하지 않도록 desktop shell을 viewport 높이에 맞추고, sidebar 문서 목록과 board body가 각각 내부 scroll 영역을 가진다.
- scrollable region은 `ak-scroll-area`를 사용해 scrollbar gutter, thumb weight, right-edge alignment를 공통화한다. 같은 sidebar column 안의 project list와 ticket document list는 scrollbox 자체를 같은 outer edge에 두고, padding은 `ak-scroll-content` 또는 `ak-sidebar-scroll-content` 같은 inner wrapper에 둔다.
- project 선택 후 sidebar documents 영역은 flat ticket file list가 아니라 `Document Sets` navigator를 표시한다.
- 각 document set row는 plan/tickets/inventory/other presence를 작은 type chip 또는 segmented affordance로 보여준다.
- 사용자가 document set 안의 `tickets`를 선택하면 board mode로 진입하고, `plan` 또는 `inventory`를 선택하면 document reader mode로 진입한다.
- selected Markdown document는 URL query에 남겨 새로고침 후에도 마지막으로 보던 문서를 복원한다.
- selected ticket detail open state는 URL hash에 남겨 직접 URL 진입 시 side/modal detail을 복원하고, detail을 닫으면 hash를 제거한다.
- board/detail drawer는 현재처럼 유지하되, header와 prompt preview에 target project context를 명확히 표시한다. Drawer header/body/action affordance는 `ak-drawer-*` utility로 묶어 panel padding rhythm과 action 위치를 일관되게 유지한다.
- ticket detail은 `side`와 `modal` presentation을 토글할 수 있고, side mode width와 마지막 presentation mode를 localStorage에 저장한다. Side mode resize handle은 desktop에서만 보이며 keyboard resize와 double-click reset을 지원한다.
- ticket drawer 안의 `Run with Codex` draft는 선택 ticket 하나를 실행하는 입력으로 유지한다.
- `Run with Codex` draft는 ticket-scoped chat log의 `role: "user"` message로도 저장하고, run 종료 후 assistant answer를 Markdown message로 저장한다.
- `Run with Codex` 버튼은 하나로 유지하되, read-only answer와 file edit run은 mode 표시와 prompt/permission boundary로 구분한다.
- selected Markdown document 전체에 대한 질문/논의는 document view 우측 collapsible `Document Chat` panel에서 처리한다.
- selected workspace 전체 docs에 대한 질문/논의와 새 plan/ticket 생성 논의는 sidebar project 영역의 `Workspace Chat` entry에서 modal 또는 sheet로 연다.
- ticket이 아직 없을 때는 workspace-level `Spec grilling` chat으로 요구사항을 질문/정리한 뒤 `$plan-ticketing` handoff로 plan/ticket 생성을 실행한다.
- chat 입력은 기본적으로 Markdown을 바로 수정하지 않는다. 사용자가 명시적으로 기록하거나 실행할 때만 `사용자 지시` append, 새 plan/ticket 생성, 또는 ticket 실행으로 전환한다.

### 7. Chat scope model

Alpha Kanban의 chat은 별도 제품 세 개가 아니라 하나의 `ChatComposer`와 `ScopeResolver`를 공유한다. UI 진입점은 기본 scope를 제공하고, 사용자는 짧은 mention 문법으로 scope를 덮어쓸 수 있다.

```text
Ticket scope     -> selected ticket 하나의 Q/A, 실행 지시, assistant answer
Document scope   -> selected Markdown document 전체에 대한 질문/논의
Workspace scope  -> selected project 전체 docs에 대한 질문/논의와 새 plan/ticket 생성
Spec Grilling    -> workspace scope에서 구현 요구사항을 질문으로 구체화한 뒤 plan-ticketing handoff
```

- 기본 scope는 UI 위치로 정한다. Ticket drawer의 `Run with Codex`는 `ticket`, board/document reader의 discussion entry는 `document`, project/sidebar entry는 `workspace`가 기본값이다.
- Scope override parser는 server/API boundary에서 raw user input을 먼저 해석한다. 지원 문법은 `@w`/`@workspace`, `@d`/`@doc`/`@document`, `@tickets`, `@t:AKW-26`/`@ticket:AKW-26`이다.
- bare ticket id, 예를 들어 `AKW-26`만 단독으로 등장하는 텍스트는 scope control로 보지 않고 자연어 언급으로 처리한다.
- parser 결과는 `{ scope, targetWorkspaceId, targetFileId, targetTicketId?, rawMessage, cleanedMessage }`처럼 정규화하고, prompt에는 raw mention 대신 `Resolved scope` block을 삽입한다.
- `$plan-ticketing` skill은 raw `@w`/`@d`/`@t:` mention을 직접 파싱하지 않는다. Alpha Kanban이 제공하는 `Resolved scope`, `Target document`, `Target ticket`, `Mode` block을 우선 신뢰한다.
- `Run with Codex`는 같은 parser를 사용하되 기본 write target은 현재 ticket이다. `@t:`와 `@d`/`@tickets`는 ticket drawer 안에서도 허용하고, `@w` edit handoff는 workspace chat/spec grilling surface로 전환하거나 명시 확인을 요구한다.
- `Run with Codex`는 버튼을 늘리지 않고 `Read-only answer`와 `Edit files` mode를 제공한다. Read-only mode는 파일 수정과 Markdown append를 금지하고 답변만 chat log에 저장한다.
- chat transcript는 control app local state에 scope별로 저장하고, Markdown에는 사용자가 명시적으로 선택한 요약만 append한다.
- `$plan-ticketing` 또는 plan/ticket 생성 요청은 workspace scope에서 가장 자연스러운 primary flow로 다룬다.

### 8. Codex runner flow

1. `Run with Codex` 요청은 `workspaceId`, `fileId`, `ticketId`, `instructionDraft`, `mode`를 포함한다.
2. server는 `workspaceId`를 검증해 target workspace root를 구한다.
3. `edit` mode에서는 실행 지시 summary를 target ticket 문서의 `사용자 지시`에 append한다. `read_only` mode에서는 ticket Markdown append를 하지 않는다.
4. prompt에는 target workspace root, ticket file absolute path, plan file absolute path, selected ticket id, ticket range hint, mode별 정책을 넣는다.
5. `spawn(codexCommand, args, { cwd: targetWorkspaceRoot })`로 실행한다.
6. Codex session id는 `.alpha-kanban/state.json`의 `workspaceId::ticketRelativePath` 단위로 저장한다.
7. user draft와 assistant answer는 control app `.alpha-kanban/chats/{workspaceId}/{fileKey}/{ticketId}.jsonl`에 저장한다.
8. read-only mode는 run 전후 `git status --short --untracked-files=all` 비교 결과를 system event로 남긴다.
9. run log는 control app의 `.alpha-kanban/runs/`에 저장하되, log entry에는 target workspace와 ticket file relative path를 포함한다.

### 9. Run status signal model

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

### 10. Markdown change sync model

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
- document set parser가 실제 Sparkone docs의 plan/tickets/inventory pair와 standalone inventory를 보수적으로 grouping하는지 fixture로 검증한다.
- Codex prompt preview와 run이 target workspace cwd/path를 사용하는지 mocked process로 검증한다.
- active run registry가 running/succeeded/failed/canceled/auth-required 상태를 ticket/document/workspace scope로 요약하는지 검증한다.
- Markdown watcher가 외부 파일 변경을 감지하고 workspace/file-scoped event를 내보내는지 검증한다.

UI:

- last workspace 없음 상태에서 project selection empty state가 표시되는지 확인한다.
- recent workspace가 있으면 바로 해당 project board가 열리는지 확인한다.
- project switcher로 target project를 바꾸면 file list와 board가 workspace scope로 갱신되는지 확인한다.
- document set navigator에서 plan/tickets/inventory를 각각 선택하면 type-specific view mode가 열리는지 확인한다.
- selected project가 unavailable일 때 recover UI가 표시되는지 확인한다.
- Codex 실행 중/완료/실패 상태가 ticket card, document header, workspace scope에서 명확히 표시되는지 확인한다.
- 외부 CLI/editor가 Markdown을 바꾼 뒤 현재 board/detail이 stale 상태를 표시하거나 자동 refetch되는지 확인한다.
- desktop/mobile viewport에서 sidebar switcher와 board가 겹치지 않는지 확인한다.

Manual smoke:

- `alpha-kanban` 자신을 target workspace로 선택해 기존 문서가 계속 동작하는지 확인한다.
- 다른 project의 `docs/*_tickets.md`를 선택해 board/detail/write가 그 project 파일에만 반영되는지 확인한다.
- 다른 project의 `docs/*_plan.md`와 `docs/*_inventory.md`를 선택했을 때 Kanban 대신 reader mode가 열리는지 확인한다.
- `Run with Codex` preview가 target project root와 target ticket file을 표시하는지 확인한다.
- 별도 CLI에서 selected Markdown을 수정한 뒤 UI가 변경 감지 신호 또는 refresh를 제공하는지 확인한다.
- Codex run 중 drawer를 닫았다 다시 열어도 run status indicator가 유지되는지 확인한다.

## Open Questions

- 없음. 이 서버형 계획의 적용은 종료했다. 아래 질문은 당시 이력으로 보존하며 현재 사용자에게 다시 답을 요구하지 않는다. 프로젝트 탐색·권한·재연결의 현재 계약은 docs/13_alpha_kanban_browser_local_plan.md와 AKL-01/03을 따른다.

### 전환 전 질문 이력

- project candidate scan은 allowlist root 아래 1-depth로 시작할지, configured depth를 둘지 결정한다.
- target workspace별 doc roots override를 UI에서 편집할지, 이번 phase에서는 `defaultDocRoots`만 사용할지 결정한다.
- unavailable recent workspace를 자동 제거할지, 사용자가 직접 dismiss하게 할지 결정한다.
