# Alpha Kanban Global Header 티켓

## Status

- 작성일: 2026-06-26
- 기준 문서: `docs/08_alpha_kanban_global_header_plan.md`
- 목적: Alpha Kanban app shell을 global topbar, document sidebar, main document header로 분리해 navigation hierarchy와 상단 line alignment를 정리한다.
- 범위: `apps/web`, `docs`
- 현재 진행률: `1 / 7 tickets`

- 적용 상태: 2026-10-18 브라우저 전환 후에도 header/sidebar/상세창 배치와 미검증 UI 항목은 유효하다. 앱 내 Workspace Chat 안내·FAB만 폐기하며 과거 체크박스는 당시 검증 이력으로 읽는다.
- 현재 구현: BrowserConnections, WorkspaceNavigation, ProjectGuide, TicketDetailFrame을 사용한다. 서버형 ProjectSwitcher·Workspace Chat을 복원하지 않는다. AGH-05는 폐기가 아닌 기존 후속 후보 보류다.

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
- `75%`: 단위 검증 완료, visual/manual smoke 전
- `100%`: 구현, 검증, 문서/운영 메모 완료

## 운영 원칙

- topbar는 앱/프로젝트 단위만 담당한다.
- `/` Start page는 workspace shell 밖 full-page route로 둔다.
- sidebar는 문서 탐색 단위만 담당한다.
- content header는 현재 문서 단위만 담당한다.
- Workspace Chat과 해당 floating button은 폐기했다. AI 논의·구현은 외부 도구에서 하며 앱은 ProjectGuide와 문서 입력만 제공한다.
- workspace topbar에 `New project`와 workspaceRoots 설정 entry를 상시 노출하지 않는다.
- `New project`와 workspaceRoots 설정은 Start page 성격의 action으로 유지한다.
- 기존 route state와 direct URL 복원을 깨지 않는다.
- shadcn b1 preset 기반 token과 local `components/ui/*` wrapper를 사용하고 새 visual system을 만들지 않는다.
- 참고 HTML은 구조 아이디어만 참고하고 복제하지 않는다.
- Progress를 올릴 때는 완료 기준/검증 체크박스도 같이 갱신한다. 구현된 항목과 남은 visual/manual smoke가 분리되어 보여야 한다.

## Ticket Template

새 티켓을 추가할 때는 아래 형식을 따른다.

```md
### AGH-000. Ticket Title

Status: READY
Progress: 25%
Repository:

- `apps/web`

Priority: P0
Type: UX / Feature / Test / Policy
Depends on:

- `AGH-000`

목표:

- 이 티켓이 끝났을 때 달라져야 하는 상태를 적는다.

현재 문제:

- 지금 없는 것, 위험한 것, 결정되지 않은 것을 적는다.

구현 범위:

- 실제로 수정할 component, route, style, state를 적는다.

제외 범위:

- 이번 티켓에서 하지 않을 일을 적는다.

완료 기준:

- [ ] 기능 관점의 완료 조건
- [ ] 회귀 방지 조건

검증:

- [ ] automated check
- [ ] browser smoke

사용자 지시:

- 2026-06-26: 사용자 요청 또는 작업 방향을 기록한다.

진행 메모:

- 2026-06-26: 초안 작성.
```

## Ticket List

### AGH-00. App shell navigation 원칙 확정

Status: DONE
Progress: 100%
Completed at: 2026-06-26T14:43:12+09:00
Repository:

- `docs`

Priority: P0
Type: Policy / UX
Depends on:

- 없음

목표:

- Start page, global topbar, document sidebar, main content header의 역할 분리 원칙을 확정한다.

현재 문제:

- 좌측 sidebar brand 영역과 우측 main document header가 모두 상단 chrome처럼 보이지만 line, padding, height가 달라 어색하다.
- project-level navigation과 document navigation이 sidebar 안에 섞여 app hierarchy가 흐려진다.
- `/` Start page도 workspace shell 안에서 렌더링되어 sidebar/header placeholder가 남고, welcome/main page처럼 보이지 않는다.

구현 범위:

- 전역 topbar는 앱/프로젝트 단위만 담당한다는 원칙을 문서화한다.
- `/` Start page는 workspace shell 밖 full-page route로 둔다는 원칙을 문서화한다.
- sidebar는 문서 탐색 전용으로 둔다는 원칙을 문서화한다.
- main content header는 현재 문서 정보만 담당한다는 원칙을 문서화한다.
- workspace topbar에는 `New project`와 workspaceRoots 설정을 상시 노출하지 않는다고 기록한다.
- 참고 HTML은 구조 아이디어만 보고 visual/theme는 복제하지 않는다고 기록한다.

제외 범위:

- 실제 shell code 변경
- visual token 변경
- backend API 변경

완료 기준:

- [x] `docs/08_alpha_kanban_global_header_plan.md`가 생성된다.
- [x] `docs/09_alpha_kanban_global_header_tickets.md`가 생성된다.
- [x] Start page/topbar/sidebar/content header의 책임 경계가 문서화된다.

검증:

- [x] 계획 문서에 목표, 비목표, 현재 상태, 제안 아키텍처, 검증 계획이 포함된다.
- [x] 티켓 문서에 후속 구현 단위가 나뉜다.

사용자 지시:

- 2026-06-26: 좌상단과 우상단 line mismatch가 거슬리므로 navigation을 상단 가로로 하고 문서 탐색 영역만 sidebar로 두는 방향을 논의했다.
- 2026-06-26: Open Design으로 프롬프팅한 HTML은 따라하지 말고 참고만 하며, 아이디어만 추출해 논의한 뒤 이대로 plan/ticket을 작성한다.
- 2026-06-26: Start page는 VS Code main page 같은 개념이므로 workspace sidebar/header가 보이는 것은 불필요하다. `New project`와 workspaceRoots 설정은 Start page action으로 두고, 이미 프로젝트에 들어온 workspace header에는 굳이 노출하지 않는다.
- 2026-06-26: progress만 올리고 체크박스를 비워두면 구현된 범위를 알기 어려우므로, AGH active 티켓의 완료 기준/검증 체크박스와 진행 메모를 실제 구현 상태에 맞게 정리한다.

진행 메모:

- 2026-06-26: 초안 작성. Start page full-page route, workspace global topbar, document-only sidebar, compact content header 원칙으로 새 plan/ticket 문서 쌍을 분리했다.

### AGH-01. Start page full-page route와 workspace shell 분리

Status: IN_PROGRESS
Progress: 75%
Repository:

- `apps/web`

Priority: P0
Type: UX / Refactor
Depends on:

- `AGH-00`

목표:

- `/` Start page를 workspace 작업 shell 밖의 full-page welcome/main page로 분리한다.

현재 문제:

- Start page가 현재 app shell 안에 렌더링되어 sidebar, document header, placeholder state가 함께 보인다.
- project를 아직 고르지 않은 상태인데도 문서 작업 화면의 chrome이 남아 있어 “빈 작업대” 또는 깨진 상태처럼 느껴진다.

구현 범위:

- `App.tsx` 또는 route-level component에서 selected workspace가 없는 `/` route와 workspace route shell을 분리한다.
- Start page에는 recent projects, browse project, new project, workspaceRoots settings, auto-open setting, guide만 둔다.
- Guide는 빈 프로젝트에서 외부 AI와 범위를 논의하고 implementation-ledger로 티켓을 작성·검토하는 흐름을 안내한다. 공통 안내의 현재 구현·검증은 AKL-05/13에서 추적한다.
- Start page에는 document sidebar, workspace document header, document placeholder를 렌더링하지 않는다.
- Start page에서 project를 선택하면 기존 `/w/:workspaceId` route와 selected file 복원 흐름으로 진입한다.
- 계획 문서가 없는 프로젝트는 ProjectGuide를 기본으로 보여준다. 앱 내 채팅 CTA는 복원하지 않으며 일반 Markdown 직접 선택과 안내로 복귀를 유지한다.

제외 범위:

- Start page visual redesign 전체
- workspace topbar 구현
- document sidebar redesign
- backend API 변경

완료 기준:

- [x] `/` route에서 workspace sidebar가 렌더링되지 않는다.
- [x] `/` route에서 workspace document header와 document placeholder가 렌더링되지 않는다.
- [x] Start page에서 recent projects, Browse project, New project, workspaceRoots 설정에 접근할 수 있다.
- [x] Guide가 `open/create project -> Workspace Chat에서 논의 -> plan/ticket/inventory 생성 -> 리뷰/수정 -> ticket 진행` 흐름을 설명한다.
- [x] Start page에서 project 선택 시 `/w/:workspaceId` workspace route로 진입한다.
- [x] auto-open last project setting은 즉시 이동하지 않고 다음 root URL load부터 적용된다.
- [x] 빈 project를 열었을 때 Workspace Chat으로 시작하는 primary CTA가 main content에 보인다.

검증:

- [x] `pnpm --filter @alpha-kanban/web typecheck`
- [x] `pnpm --filter @alpha-kanban/web test -- appRoute`
- [x] `pnpm build`
- [x] `git diff --check`
- [ ] `/` Start page visual smoke
- [ ] recent project open visual smoke
- [ ] browse project open visual smoke
- [ ] new project dialog visual smoke

사용자 지시:

- 2026-06-26: Start page는 VS Code 메인페이지 개념이고, sidebar/header가 보이는 것은 불필요하다.
- 2026-06-26: 전체 AGH active 티켓을 구현하고 커밋은 하지 않는다. 산출물 visual 확인은 사용자가 나중에 수행한다.
- 2026-06-26: 대부분의 사용자는 호환 Markdown을 이미 갖고 있지 않다. 빈 project를 열고 Workspace Chat에서 스펙을 논의한 뒤 plan/ticket/inventory를 생성하고, 문서를 리뷰/수정한 다음 ticket을 하나씩 진행하는 흐름이 primary scenario다.
- 2026-06-26: 빈 프로젝트에서 `No documents`만 보여주면 안 되고, Workspace Chat으로 시작해 plan/ticket을 만들라는 primary affordance가 보여야 한다.

진행 메모:

- 2026-06-26: 초안 작성.
- 2026-06-26: Start page를 workspace shell 밖 full-page route로 분리했다. `!selectedWorkspaceId` 상태에서는 `StartWorkspacePage`만 렌더링하고, workspace sidebar/document header/document placeholder는 렌더링하지 않는다.
- 2026-06-26: Start page는 recent projects, Browse project, New project, workspaceRoots settings, auto-open setting을 유지한다. auto-open checkbox는 설정만 바꾸고 즉시 project로 이동하지 않으며, 다음 root URL load부터 적용된다.
- 2026-06-26: Start page Guide 문구를 빈 프로젝트 기준 primary flow로 수정했다. `Select workspace/Open document set` 중심 설명을 제거하고, `Open or create a project -> Discuss the work -> Generate planning docs -> Review, revise, and run` 흐름으로 바꿨다.
- 2026-06-26: 선택된 project에 document set이 없으면 main content에서 `Start with Workspace Chat` CTA를 보여주고, 버튼으로 기존 Workspace Chat dialog를 열도록 했다.
- 2026-06-26: 검증 완료: `pnpm --filter @alpha-kanban/web typecheck`, `pnpm --filter @alpha-kanban/web test -- appRoute`, `pnpm build`, `git diff --check`. 남은 것은 사용자 visual smoke다.
- 2026-10-18: 브라우저 전환에 맞춰 빈 프로젝트 안내를 외부 AI와 implementation-ledger를 사용하는 ProjectGuide로 정리했다. Workspace Chat CTA는 폐기하고 헤더 분리·문서 선택·남은 화면 검증은 유지한다. 기존 진행률과 검증 이력은 변경하지 않았다.

### AGH-02. Workspace global topbar shell 구현

Status: IN_PROGRESS
Progress: 75%
Repository:

- `apps/web`

Priority: P0
Type: UX / Feature
Depends on:

- `AGH-01`

목표:

- Workspace route 전체 폭을 차지하는 global topbar를 만들고, Alpha Kanban home button과 current project selector를 이 영역으로 이동한다.

현재 문제:

- Alpha Kanban brand가 sidebar 내부에 있어 main header와 line rhythm이 맞지 않는다.
- project selector가 전역 workspace action이면서 sidebar 내부에 남아 있다.
- `New project`는 Start page action인데 workspace 작업 header에 상시 노출되면 노이즈가 된다.

구현 범위:

- `App.tsx` app shell grid를 topbar + body 구조로 재배치한다.
- 기존 brand home button을 topbar 좌측으로 이동한다.
- current project selector entry를 topbar에 배치하고 기존 `ProjectSwitcher` dialog를 열 수 있게 연결한다.
- project switch/open/browse flow는 topbar inline popover가 아니라 기존 `ProjectSwitcher` dialog에서 제공한다.
- workspace unavailable 상태를 topbar에서 안전하게 표현한다.
- `New project`와 workspaceRoots settings entry는 workspace topbar에 상시 노출하지 않는다.

제외 범위:

- ProjectSwitcher dialog 자체의 대대적 redesign
- WorkspaceRoots settings 전체 redesign
- 폐기된 Workspace Chat 또는 서버형 ProjectSwitcher 복원

완료 기준:

- [x] topbar가 app 전체 폭을 차지한다.
- [x] `Alpha Kanban` brand click이 Start page(`/`)로 이동한다.
- [x] selected project label/path가 topbar에서 확인 가능하다.
- [x] topbar project selector가 기존 `ProjectSwitcher` dialog를 연다.
- [x] workspace topbar에 `New project`와 workspaceRoots settings가 상시 노출되지 않는다.
- [x] sidebar는 topbar 아래 body grid에서 시작한다.

검증:

- [x] `pnpm --filter @alpha-kanban/web typecheck`
- [x] `pnpm --filter @alpha-kanban/web test -- appRoute`
- [x] `pnpm build`
- [x] `git diff --check`
- [ ] `/w/:workspaceId` selected project visual smoke
- [ ] project switch/open project visual smoke

사용자 지시:

- 2026-06-26: 좌측에 Alpha Kanban logo 정도만 남겨 홈버튼으로 쓰는 방향을 논의했다.
- 2026-06-26: 프로젝트에 이미 들어온 header에는 `New project`를 굳이 보여줄 필요가 없다.
- 2026-06-26: project selector는 작은 popover보다 기존 `ProjectSwitcher` dialog 유지가 마음에 든다고 결정했다.
- 2026-06-26: 전체 AGH active 티켓을 구현하고 커밋은 하지 않는다. 산출물 visual 확인은 사용자가 나중에 수행한다.

진행 메모:

- 2026-06-26: 초안 작성.
- 2026-06-26: Workspace shell을 `topbar + body` grid로 재배치했다. Topbar 좌측에는 `Alpha Kanban` home button을 두고, 클릭 시 Start page(`/`)로 돌아가게 했다.
- 2026-06-26: current project selector를 topbar 중앙으로 이동했고, selector trigger는 기존 `ProjectSwitcher` dialog를 연다. ProjectSwitcher dialog 자체의 browse/open flow는 유지했다.
- 2026-06-26: `New project`와 workspaceRoots settings는 workspace topbar에 상시 노출하지 않는다. 해당 기능은 Start page 쪽 action으로 유지한다.
- 2026-06-26: 검증 완료: `pnpm --filter @alpha-kanban/web typecheck`, `pnpm --filter @alpha-kanban/web test -- appRoute`, `pnpm build`, `git diff --check`. 남은 것은 selected project/project switch visual smoke다.
- 2026-10-18: 서버형 ProjectSwitcher와 Workspace Chat은 복원하지 않는다. 현재 WorkspaceNavigation과 브라우저 폴더 연결 UI를 기준으로 topbar 범위와 남은 화면 검증을 유지하며 과거 체크박스는 당시 이력으로 보존했다.

### AGH-03. Document-only sidebar 정리

Status: IN_PROGRESS
Progress: 75%
Repository:

- `apps/web`

Priority: P0
Type: UX / Refactor
Depends on:

- `AGH-02`

목표:

- 좌측 sidebar를 document set 탐색 전용 panel로 정리한다.

현재 문제:

- sidebar에 brand/project context/document list가 함께 있어 문서 탐색 영역의 역할이 흐려진다.
- topbar 도입 후 sidebar 내부 brand/project block이 남으면 중복 navigation이 된다.

구현 범위:

- sidebar에서 brand/project switcher/project context block을 제거한다.
- `DocumentListHeader`, search/sort/filter controls, `DocumentSetNavigator`를 sidebar 상단과 scroll 영역에 맞게 재배치한다.
- sidebar resize handle과 internal scroll model을 유지한다.
- empty/loading/error state를 document navigation context에 맞게 조정한다.

제외 범위:

- document set sorting algorithm 변경
- linked docs grouping parser 변경
- document set visual card redesign 전체

완료 기준:

- [x] sidebar에는 document 탐색 관련 요소만 남는다.
- [x] sidebar 내부에는 `DocumentListHeader`와 `DocumentSetNavigator` 중심의 document navigation만 남는다.
- [x] document list internal scroll이 topbar 아래 body grid 안에서 동작한다.
- [x] sidebar resize handle과 width state가 유지된다.
- [x] selected document set/file 표시가 유지된다.

검증:

- [x] `pnpm --filter @alpha-kanban/web typecheck`
- [x] `pnpm build`
- [x] `git diff --check`
- [ ] 문서 검색/filter/sort visual smoke
- [ ] sidebar resize visual smoke
- [ ] document direct URL selected state smoke

사용자 지시:

- 2026-06-26: 문서탐색 영역만 sidebar로 놔두는 방향을 논의했다.
- 2026-06-26: 전체 AGH active 티켓을 구현하고 커밋은 하지 않는다. 산출물 visual 확인은 사용자가 나중에 수행한다.

진행 메모:

- 2026-06-26: 초안 작성.
- 2026-06-26: sidebar에서 brand/project switcher/project context block을 제거했다. Sidebar는 document 탐색 전용 영역으로 낮추고, `DocumentListHeader`와 `DocumentSetNavigator`를 topbar 아래 body grid에 배치했다.
- 2026-06-26: sidebar resize handle과 `--sidebar-width` 기반 width state는 유지했다. Document list는 `ak-scroll-area` 내부 scroll 구조를 유지한다.
- 2026-06-26: 검증 완료: `pnpm --filter @alpha-kanban/web typecheck`, `pnpm build`, `git diff --check`. 남은 것은 검색/filter/sort, resize, direct URL selected state visual smoke다.

### AGH-04. Main content document header compact 정리

Status: IN_PROGRESS
Progress: 75%
Repository:

- `apps/web`

Priority: P1
Type: UX / Refactor
Depends on:

- `AGH-02`
- `AGH-03`

목표:

- 현재 문서 title/header 영역을 main content 안의 compact document header로 정리한다.

현재 문제:

- 현재 main header가 전역 header처럼 보이고 sidebar top과 시각적으로 경쟁한다.
- document title, file path, badges가 넓은 공간을 쓰지만 header hierarchy가 명확하지 않다.

구현 범위:

- `workspace path -> document title -> type/path/badges` 구조를 compact하게 유지한다.
- plan/tickets/inventory/markdown 모두 같은 header contract를 사용한다.
- `DocumentSummary` badge 영역을 main content header 우측에 안정적으로 배치한다.
- text overflow/wrap 정책을 정리해 좁은 width에서도 깨지지 않게 한다.

제외 범위:

- Markdown renderer 변경
- Kanban board column/card redesign
- Ticket drawer redesign

완료 기준:

- [x] main header는 현재 문서 정보만 표시한다.
- [x] workspace path, document title, document type/path badge를 compact 구조로 표시한다.
- [x] tickets/plan/inventory/markdown view가 같은 `DocumentSummary` contract를 사용한다.
- [x] summary badge가 title/path와 겹치지 않도록 flex/truncate/wrap 정책을 적용했다.
- [x] content scroll area와 header border가 body grid 안에서 이어진다.

검증:

- [x] `pnpm --filter @alpha-kanban/web typecheck`
- [x] `pnpm build`
- [x] `git diff --check`
- [ ] tickets board visual smoke
- [ ] plan reader visual smoke
- [ ] inventory/markdown reader visual smoke
- [ ] narrow viewport text overflow visual smoke

사용자 지시:

- 2026-06-26: 문서 제목 header를 전역 header로 승격하지 말고 content 영역 안에 두는 방향을 논의했다.
- 2026-06-26: 전체 AGH active 티켓을 구현하고 커밋은 하지 않는다. 산출물 visual 확인은 사용자가 나중에 수행한다.

진행 메모:

- 2026-06-26: 초안 작성.
- 2026-06-26: main content header를 compact document header로 줄였다. Header는 workspace root label, document title, document type/path만 표시하고 전역 navigation 역할은 topbar로 넘겼다.
- 2026-06-26: `DocumentSummary`를 header 우측에 유지하되, title/path 영역은 `min-w-0`, `truncate`, `flex-wrap`을 사용해 summary badge와 겹치지 않도록 했다.
- 2026-06-26: 검증 완료: `pnpm --filter @alpha-kanban/web typecheck`, `pnpm build`, `git diff --check`. 남은 것은 tickets/plan/inventory/markdown view visual smoke와 narrow viewport overflow 확인이다.

### AGH-05. Document set context strip 후보 구현

Status: DEFERRED
Progress: 0%
Repository:

- `apps/web`

Priority: P2
Type: UX / Feature
Depends on:

- `AGH-04`

목표:

- 1차 shell migration 이후 선택 document set의 plan/tickets/inventory linked file 상태를 main body 상단의 context strip으로 보여줄지 검증한다.

현재 문제:

- 현재 linked docs UI는 view별 위치와 밀도가 달라 plan/tickets/inventory 전환 affordance가 일관되지 않다.
- 참고 시안의 context strip은 같은 document set 안의 연결 파일을 가볍게 보여주는 후보가 될 수 있다.

구현 범위:

- 기존 linked docs data를 재사용해 context strip prototype을 만든다.
- active file, missing file, file type chip을 표현한다.
- chip click으로 같은 document set의 다른 file로 이동한다.
- tickets board와 markdown reader에서 모두 동작하게 한다.

제외 범위:

- document set parser 변경
- sidebar document card redesign
- context strip을 1차 shell migration에 포함하는 것

완료 기준:

- [ ] context strip이 선택 document set과 active file을 보여준다.
- [ ] linked file chip으로 plan/tickets/inventory 전환이 가능하다.
- [ ] missing file 상태가 비침습적으로 표시된다.
- [ ] context strip이 main header와 board/reader 사이에서 과하게 공간을 차지하지 않는다.

검증:

- [ ] `pnpm --filter @alpha-kanban/web typecheck`
- [ ] plan -> tickets 전환 smoke
- [ ] tickets -> inventory 전환 smoke
- [ ] missing linked file smoke

사용자 지시:

- 2026-06-26: 참고 HTML의 선택 그룹/context strip 아이디어는 그대로 복제하지 않고, linked docs UX 후보로만 검토한다.
- 2026-06-26: Document context strip은 현재 의미가 명확하지 않으므로 1차 구현에는 포함하지 않고 후속으로 둔다.

진행 메모:

- 2026-06-26: 초안 작성.

### AGH-06. Responsive fallback과 floating layer 충돌 검증

Status: IN_PROGRESS
Progress: 75%
Repository:

- `apps/web`

Priority: P1
Type: UX / Test
Depends on:

- `AGH-02`
- `AGH-03`
- `AGH-04`

목표:

- topbar + document sidebar + main content 구조가 좁은 화면과 ticket drawer/modal에서 충돌하지 않도록 responsive fallback을 유지한다. 폐기된 Workspace Chat FAB는 대상에서 제외한다.

현재 문제:

- shell 구조를 바꾸면 existing ticket drawer side/modal, sidebar resize, Workspace Chat FAB, project dialog가 서로 겹칠 수 있다.
- mobile layout 니즈는 있지만 지금 최적 형태를 확정하기 어렵다.
- narrow viewport에서 text overlap과 broken layout은 desktop resizing에서도 드러날 수 있다.

구현 범위:

- topbar height를 기준으로 sidebar/main height를 계산한다.
- narrow viewport에서는 구현 리스크가 낮은 임시 sidebar 접근 방식을 택한다.
- overlay drawer와 collapsible inline panel 중 최적 형태 확정은 후속 visual polish로 미룬다.
- Workspace Chat FAB의 충돌 정책은 폐기한다. 현재 Help·투어·PWA 메뉴와 ticket detail의 focus/overlay 경계는 기존 공통 컴포넌트를 따른다.
- ticket detail side/modal과 topbar/sidebar가 함께 열리는 direct URL을 확인한다.

제외 범위:

- 모바일 전용 navigation 완성도 높은 redesign
- 최종 mobile IA 확정
- touch gesture navigation
- PWA/mobile app packaging

완료 기준:

- [x] topbar 높이를 기준으로 sidebar/main body grid가 분리된다.
- [x] narrow viewport에서는 sidebar가 main 위에 쌓이고 `max-height`를 가져 전체 layout overflow를 줄인다.
- [x] Workspace Chat FAB는 sidebar 내부가 아니라 fixed floating layer로 렌더링된다.
- [x] Workspace Chat FAB 위치를 화면 가장자리에서 한 단계 안쪽으로 조정했다.
- [ ] desktop visual smoke에서 topbar/sidebar/main scroll이 안정적으로 보인다.
- N/A: Workspace Chat FAB와 drawer의 겹침 검증은 앱 내 채팅 제거로 적용하지 않는다. 아래 side drawer 자체의 검증은 유지한다.
- [ ] ticket modal direct URL에서 topbar와 modal z-index가 안정적인지 visual smoke로 확인한다.
- [ ] narrow viewport에서 임시 sidebar 접근 방식과 layout 파손 여부를 visual smoke로 확인한다.

검증:

- [x] `pnpm --filter @alpha-kanban/web typecheck`
- [x] `pnpm build`
- [x] `git diff --check`
- [ ] desktop Chrome visual smoke
- [ ] narrow viewport visual smoke
- [ ] ticket side drawer visual smoke
- [ ] ticket modal direct URL visual smoke

사용자 지시:

- 2026-06-26: 비주얼 스모크는 대부분 사용자가 하므로 agent는 코드와 구조 검증을 우선하고, 필요한 smoke 포인트를 명확히 남긴다.
- 2026-06-26: 모바일 레이아웃은 니즈가 없지는 않지만 최적 형태의 감이 아직 없으므로, 1차는 대충 깨지지 않는 수준으로 처리한다.
- 2026-06-26: 전체 AGH active 티켓을 구현하고 커밋은 하지 않는다. 산출물 visual 확인은 사용자가 나중에 수행한다.
- 2026-06-26: Workspace Chat floating button을 화면 가장자리에서 조금 더 안쪽으로 배치한다.

진행 메모:

- 2026-06-26: 초안 작성.
- 2026-06-26: Workspace shell을 topbar와 body grid로 분리하면서 topbar 아래에 sidebar/main 영역이 놓이도록 했다. Narrow viewport에서는 body grid를 1열로 접고 sidebar에 `max-height`를 둬 전체 layout이 깨지는 위험을 낮췄다.
- 2026-06-26: Workspace Chat은 sidebar 내부 block이 아니라 selected workspace에서만 보이는 fixed floating button으로 분리했다. 이후 사용자 피드백에 따라 위치를 `bottom/right 5`에서 `6`으로, narrow viewport에서는 `4`에서 `5`로 조정해 화면 가장자리에서 조금 더 안쪽으로 들어오게 했다.
- 2026-06-26: 검증 완료: `pnpm --filter @alpha-kanban/web typecheck`, `pnpm build`, `git diff --check`. 남은 것은 desktop/narrow viewport, ticket drawer, ticket modal direct URL visual smoke다.
- 2026-10-18: 앱 내 채팅 제거로 Workspace Chat FAB 충돌 검증만 N/A로 전환했다. 상세창·좁은 화면·스크롤 검증은 유지하며 기존 체크된 FAB 항목은 과거 증거이지 복원 요구가 아니다. 새 화면 검증을 수행하거나 진행률을 올리지는 않았다.
