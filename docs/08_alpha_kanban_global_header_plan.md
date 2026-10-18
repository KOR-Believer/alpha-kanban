# Alpha Kanban Global Header 구현 계획 초안

작성일: 2026-06-26
수정일: 2026-06-26

## 영향 범위

대상 repository:

- `apps/web`
- `docs`

참고 자료:

- `docs/03_alpha_kanban_multi_workspace_plan.md`
- `docs/04_alpha_kanban_multi_workspace_tickets.md`
- `AGENTS.md`
- 기존 전역 탐색 시안의 구조 참고

이 문서는 Alpha Kanban app shell의 전역 navigation, 문서 탐색 sidebar, 현재 문서 header 역할을 분리하기 위한 UX/구현 계획이다. 참고 시안은 구조 아이디어만 추출하고 그대로 복제하지 않는다.

## 목표

- 앱 상단 line mismatch를 근본적으로 줄이기 위해 전역 topbar를 app 전체 폭으로 둔다.
- `/` Start page를 VS Code welcome/main page처럼 workspace shell 밖 full-page route로 분리한다.
- workspace route에서는 `Alpha Kanban` brand/home과 current project selector를 topbar로 올린다.
- 좌측 sidebar는 문서 탐색 전용 영역으로 제한한다.
- 현재 workspace path, document title, document type/path, summary badge는 main content header에 남긴다.
- Workspace Chat은 우하단 floating button으로 유지해 navigation과 문서 탐색을 방해하지 않는다.
- `New project`와 `workspaceRoots` 설정은 Start page 성격의 action으로 유지하고 workspace 작업 header에 상시 노출하지 않는다.
- 기존 project switcher, document set navigator, ticket drawer/modal, responsive behavior를 깨지 않으면서 shell 구조를 정리한다.

## 비목표

- 참고 HTML 시안을 그대로 구현하지 않는다.
- 색상, font, board 배경 texture 같은 별도 visual theme를 새로 도입하지 않는다.
- Workspace Chat modal 자체의 대대적 redesign은 이 계획의 주목표가 아니다.
- Ticket drawer/chat composer의 정보 구조 개편은 별도 후속으로 둔다.
- backend API 변경은 원칙적으로 포함하지 않는다.
- mobile navigation drawer의 완전한 IA redesign은 1차 구현 이후 필요할 때 분리한다.
- workspace 작업 화면 topbar에 `New project`나 `workspaceRoots` 설정 entry를 직접 노출하지 않는다.

## 현재 상태 요약

### 1. 상단 chrome 역할이 섞여 있다

- 현재 sidebar 상단에는 `Alpha Kanban / Plan-ticketing workspace` brand가 있다.
- main content 상단에는 workspace path, document title, document type/path, summary badge가 있다.
- 두 영역이 모두 상단 header처럼 보이지만 서로 다른 padding, height, border rhythm을 가져 좌상단과 우상단 line이 맞지 않아 보인다.

### 2. sidebar에 전역 기능과 문서 탐색 기능이 섞여 있다

- project switcher와 project context가 sidebar 안에 있고, document list도 같은 column 안에 있다.
- 최근 변경으로 Workspace Chat은 우하단 floating button으로 분리됐지만, project-level navigation은 아직 sidebar에 남아 있다.
- 사용자는 sidebar를 문서 탐색 영역으로 기대하지만, project-level action이 섞이면 탐색 hierarchy가 흐려진다.

### 3. Start page와 project action이 점점 전역화되고 있다

- Start page에는 recent, browse project, new project, workspaceRoots 설정이 있다.
- `New project`와 workspaceRoots 설정은 프로젝트 선택 전 또는 설정 성격이 강한 Start page action이다.
- project browse/switch는 workspace 작업 중에도 필요할 수 있지만, 새 project 생성은 현재 workspace header에 상시 노출할 이유가 약하다.
- `Alpha Kanban` brand는 이미 home 역할을 요구받았고, Start page(`/`)로 돌아가는 affordance가 필요하다.
- 현재 `/` Start page도 기존 app shell 안에서 렌더링되어 sidebar와 document header placeholder가 남아 “비어 있는 작업대”처럼 보이는 문제가 있다.

### 4. 참고 시안에서 추출할 아이디어

- topbar가 전체 폭을 차지하고, sidebar는 topbar 아래에서 시작한다.
- sidebar는 document set search/filter/sort/list에 집중한다.
- main content는 자체 document header와 board/reader scroll area를 가진다.
- document set context strip은 plan/tickets/inventory linked file 상태를 더 가볍게 보여줄 수 있는 후보 UI다.

## 제안 아키텍처

### 1. Route-level Shell 구조

route에 따라 shell을 먼저 분리한다.

```text
/ Start Page
  - full-page welcome/start layout
  - no workspace topbar
  - no document sidebar
  - no document header placeholders
  - recent projects, browse project, new project, workspaceRoots settings, guide

/w/:workspaceId Workspace Page
  - global workspace topbar
  - document sidebar
  - main content document header
  - board / markdown reader
```

workspace page shell은 다음 계층으로 구성한다.

```text
Global Topbar
  - Alpha Kanban home button
  - Current project selector
  - Project switch/open affordance

Body
  - Documents Sidebar
    - Document search
    - Sort/filter controls
    - Document set list
  - Main Content
    - Document header
    - Context strip or linked-doc affordance
    - Kanban board / Markdown reader

Floating Layer
  - Workspace Chat FAB
  - Ticket drawer/modal
  - Folder/project dialogs
```

핵심 원칙은 다음이다.

- Start page는 project 선택과 설정을 위한 full-page route다.
- workspace topbar는 앱/현재 project 단위만 담당한다.
- sidebar는 문서 탐색 단위만 담당한다.
- content header는 현재 문서 단위만 담당한다.
- floating layer는 장시간 작업 또는 modal workflow만 담당한다.

### 2. Global Topbar

Workspace route topbar는 전체 app width를 차지한다.

좌측:

- `Alpha Kanban` brand button
- 클릭 시 Start page(`/`)로 이동
- 작은 logo/icon과 앱 이름만 노출

중앙 또는 좌측 다음:

- current project selector
- selected project label과 root/path 축약 표시
- 클릭 시 현재 `ProjectSwitcher` dialog를 연다.
- workspace route에서 project가 unavailable이면 unavailable 상태를 표시한다.

우측:

- 현재 project refresh 같은 lightweight workspace-level action만 후보로 둔다.
- project switch/open/browse flow는 `ProjectSwitcher` dialog 안으로 넣는다.

Topbar에는 넣지 않을 것:

- 현재 문서 title
- ticket run button
- Workspace Chat primary action
- document search/filter
- `New project`
- workspaceRoots settings entry

### 3. Documents Sidebar

Sidebar는 topbar 아래에서 시작하고 `height: calc(100dvh - topbar height)` 내부 scroll model을 가진다.

포함:

- `Documents` section title
- document set search
- type filter
- sort option and direction
- document set list
- selected document set/file state

제거:

- Alpha Kanban brand
- project switcher card
- workspace path card
- Workspace Chat button
- health pill이 필요하면 footer 또는 topbar secondary status로 이동

Resize handle은 sidebar와 main content 사이에 유지한다.

### 4. Main Content Header

Main content header는 현재 문서만 설명한다.

포함:

- workspace root/path breadcrumb 또는 muted path
- document title
- document type badge
- selected file workspace-relative path
- ticket progress/date/run summary badges

조정:

- 과한 hero scale을 피하고 작업 도구에 맞게 compact하게 유지한다.
- topbar와 같은 global header처럼 보이지 않게 main content 내부 header로 둔다.
- Markdown reader와 kanban board 모두 같은 header contract를 쓴다.

### 5. Document Context Strip 후속 후보

선택 document set의 plan/tickets/inventory/markdown 연결 상태는 main body 상단의 context strip 후보로 두되, 1차 shell migration에는 포함하지 않는다.

역할:

- 현재 열린 file이 속한 document set 표시
- linked docs chip 제공
- missing file 상태 표시
- plan reader에서 tickets로, tickets board에서 plan/inventory로 빠르게 이동

1차 구현에서는 기존 linked docs UI를 그대로 유지하고, shell 안정화 이후 `AGH-05`에서 별도로 검토한다.

### 6. Responsive Policy

Desktop:

- topbar fixed/sticky one row
- sidebar left internal scroll
- main content internal scroll

Tablet/mobile:

- 최적 mobile IA는 아직 확정하지 않는다.
- 1차 구현은 desktop shell을 망가뜨리지 않는 최소 responsive fallback으로 처리한다.
- document sidebar는 좁은 viewport에서 접근 가능한 임시 toggle, stacked panel, 또는 overlay 중 구현 리스크가 가장 낮은 방식을 택한다.
- project selector와 global actions는 overflow menu 또는 compact buttons로 줄인다.
- main content header는 2줄 이하로 유지하고 badges는 wrap 또는 overflow menu로 관리한다.

## 보안/운영 원칙

- 이 계획은 UI shell 구조 변경이며 workspaceRoots, file write 권한, Codex cwd 검증 정책을 변경하지 않는다.
- Start page의 browse/new project/workspaceRoots 설정은 기존 API와 permission boundary를 그대로 사용한다.
- workspace topbar의 project selector는 기존 project switch/open path boundary를 그대로 사용한다.
- topbar action은 target workspace 안 파일을 직접 수정하지 않는다.
- visual shell 변경 중에도 ticket drawer, chat run, route state가 현재 선택 workspace/file/ticket을 잃지 않게 한다.
- design token은 `apps/web/src/styles.css`와 local `components/ui/*` wrapper를 사용한다. 새 색상/spacing 체계를 만들지 않는다.

## 에러 정책

- 선택된 workspace가 unavailable이면 topbar project selector에 unavailable state를 표시하고 main content는 기존 error state를 유지한다.
- project selector dialog가 workspace list를 못 불러오면 topbar 전체가 깨지지 않고 selector 내부에서 error를 표시한다.
- `/` Start page에서는 workspace/file/ticket placeholder를 렌더링하지 않고, Start page 자체 error/loading state로만 표현한다.
- sidebar document list가 실패하면 sidebar 내부 state로 표시하고 topbar는 계속 동작한다.
- responsive sidebar open state가 route state와 충돌하지 않게 local UI state로만 관리한다.
- shell migration 중 direct URL(`/`, `/w/:workspaceId`, `?file=...`, `#ticket=...`) 복원 실패는 P0 regression으로 취급한다.

## 검증 계획

Automated:

- `pnpm --filter @alpha-kanban/web typecheck`
- `pnpm --filter @alpha-kanban/web test -- appRoute`
- 가능하면 shell component-level smoke 또는 layout state unit test 추가
- `pnpm build`
- `git diff --check`

Manual / browser smoke:

- `/` Start page에서 workspace topbar/sidebar/document header가 보이지 않고 recent/browse/new/settings/guide만 보이는지 확인한다.
- `/w/:workspaceId` direct URL에서 selected project와 document list가 복원되는지 확인한다.
- `?file=...` direct URL에서 main content header와 selected document set이 맞는지 확인한다.
- `#ticket=...&detail=modal` direct URL에서 ticket modal과 topbar/sidebar layout이 충돌하지 않는지 확인한다.
- sidebar resize, ticket drawer resize, Workspace Chat FAB가 서로 겹치지 않는지 확인한다.
- 좁은 viewport에서 topbar action과 document sidebar 접근이 깨지지 않는지 확인한다.

## Open Questions

- 없음. Mobile 최종 layout polish는 1차 shell migration 이후 실제 visual smoke를 보고 별도 조정한다.

## 결정된 사항

- `/` Start page는 workspace shell 밖 full-page route로 둔다.
- workspace topbar에는 `New project`를 상시 노출하지 않는다.
- workspaceRoots 설정은 Start page 설정 영역에 유지하고 topbar에 직접 노출하지 않는다.
- workspace 작업 화면의 topbar는 `Alpha Kanban` home과 current project selector 중심으로 둔다.
- topbar의 current project selector는 inline popover가 아니라 기존 `ProjectSwitcher` dialog를 연다.
- Document context strip은 1차 shell migration에 포함하지 않고 후속 `AGH-05`로 둔다.
- Mobile sidebar 최종 형태는 지금 확정하지 않고, 1차는 임시 responsive fallback으로 처리한다.
