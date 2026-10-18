# Alpha Kanban 티켓

## Status

- 작성일: 2026-06-22
- 기준 문서: `docs/01_alpha_kanban_plan.md`
- 목적: plan-ticketing Markdown 문서를 로컬 칸반으로 탐색, 수정, Codex 실행까지 연결하는 MVP 구현
- 범위: `alpha-kanban`
- 현재 진행률: `8 / 8 tickets`

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

- 모든 작업은 `alpha-kanban` repository를 실행 컨텍스트로 둔다.
- local-only 도구이므로 server는 기본값으로 `127.0.0.1`에만 bind한다.
- 파일 접근은 config allowlist 내부로 제한한다.
- Codex 실행은 shell string이 아니라 argument array 기반 process spawn만 사용한다.
- Markdown 수정 시 개별 ticket body, `Progress Board`, top-level `현재 진행률`을 함께 갱신한다.
- `사용자 지시`와 `진행 메모`는 append-only log로 다루고, 같은 날짜의 항목 순서는 문서 라인 순서로 해석한다.

## Ticket Template

새 티켓을 추가할 때는 아래 형식을 따른다.

```md
### AKB-000. Ticket Title

Status: READY
Progress: 25%
Repository:

- `alpha-kanban`

Priority: P0
Type: Feature / API / UX / Test / Policy / Security
Depends on:

- `AKB-000`

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
| AKB-00 | DONE | 100% | `alpha-kanban` | - |
| AKB-01 | DONE | 100% | `alpha-kanban` | AKB-00 |
| AKB-02 | DONE | 100% | `packages/shared`, `apps/server` | AKB-01 |
| AKB-03 | DONE | 100% | `apps/server`, `packages/shared` | AKB-02 |
| AKB-04 | DONE | 100% | `apps/web`, `packages/shared` | AKB-03 |
| AKB-05 | DONE | 100% | `apps/web`, `apps/server` | AKB-03, AKB-04 |
| AKB-06 | DONE | 100% | `apps/server`, `apps/web` | AKB-03, AKB-05 |
| AKB-07 | DONE | 100% | `alpha-kanban` | AKB-01, AKB-02, AKB-03, AKB-04, AKB-05, AKB-06 |

## Ticket List

### AKB-00. 스택 정책 확정 및 영향 범위 분석

Status: DONE
Progress: 100%
Repository:

- `alpha-kanban`

Priority: P0
Type: Policy / Design
Depends on:

- 없음

목표:

- Alpha Kanban의 기본 스택과 local-only 운영 원칙을 확정한다.

현재 문제:

- 프로젝트가 Git repository로만 초기화되어 있고 구현 구조는 아직 없다.
- TanStack Start와 React/Vite + Express 중 선택이 필요했다.

구현 범위:

- React/Vite + Express를 기본 구조로 결정한다.
- TanStack Router/Query는 프론트엔드 개발 경험을 위해 채택한다.
- `alpha-kanban`을 대상 repository로 확정한다.
- `docs/01_alpha_kanban_plan.md`, `docs/02_alpha_kanban_tickets.md`에 구현 방향과 티켓 경계를 기록한다.

제외 범위:

- 실제 package scaffold
- 실제 API 구현
- 실제 UI 구현
- 실제 Codex runner 구현

완료 기준:

- [x] 대상 repository와 참고 repository를 문서화한다.
- [x] React/Vite + Express 선택 이유를 문서화한다.
- [x] local-only 보안 원칙을 문서화한다.
- [x] 구현 ticket prefix와 작업 경계를 문서화한다.

검증:

- [x] `alpha-kanban` repository 상태를 확인한다.
- [x] `plan-ticketing` canonical plan/ticket pattern을 확인한다.
- [x] `참고용 관리 앱`의 TanStack Start 사용 사실을 확인한다.

진행 메모:

- 2026-06-22: 사용자 결정에 따라 React/Vite + Express를 기본 스택으로 선택하고 ticket prefix를 임시 `AKB`로 정했다.

### AKB-01. 프로젝트 scaffold 및 개발 스크립트 구성

Status: DONE
Progress: 100%
Repository:

- `alpha-kanban`

Priority: P0
Type: Feature
Depends on:

- `AKB-00`

목표:

- React/Vite web app, Express server, shared package를 실행 가능한 초기 구조로 만든다.

현재 문제:

- 현재 repository에는 `package.json`, workspace config, TypeScript config, app source 구조가 없다.
- 이후 ticket이 의존할 shared schema와 dev command 기준이 없다.

구현 범위:

- `package.json`, `pnpm-workspace.yaml`, root `tsconfig.json`을 추가한다.
- `apps/web`에 Vite React app scaffold를 추가한다.
- `apps/server`에 Express server scaffold를 추가한다.
- `packages/shared`에 TypeScript package scaffold를 추가한다.
- root script로 `dev`, `build`, `typecheck`, `test`를 구성한다.
- Vite dev proxy로 `/api/*`를 Express server에 연결한다.

제외 범위:

- 실제 Markdown parser 구현
- 실제 칸반 UI 구현
- 실제 Codex runner 구현

완료 기준:

- [x] `pnpm install` 후 root `pnpm dev`로 web/server를 함께 실행할 수 있다.
- [x] `apps/web`이 browser에서 기본 화면을 렌더링한다.
- [x] `apps/server`가 `/api/health`를 제공한다.
- [x] `packages/shared` 타입을 web/server에서 import할 수 있다.

검증:

- [x] `pnpm typecheck`
- [x] `pnpm build`
- [x] `/api/health` manual smoke

진행 메모:

- 2026-06-22: 초안 작성.
- 2026-06-22: `package.json`, `pnpm-workspace.yaml`, root TypeScript config, `apps/web`, `apps/server`, `packages/shared` scaffold를 추가했다.
- 2026-06-22: `pnpm install`, `pnpm typecheck`, `pnpm build`, `pnpm test`를 통과했고, `pnpm dev`로 Vite web과 Express server를 함께 실행했다.
- 2026-06-22: `http://127.0.0.1:5174/api/health`와 Vite proxy `http://127.0.0.1:5173/api/health`가 모두 `ok` 응답을 반환했다.
- 2026-06-22: 브라우저 DOM에서 기본 화면, `API online`, `API: server ok` 표시를 확인했다.

### AKB-02. plan-ticketing Markdown parser/serializer 구현

Status: DONE
Progress: 100%
Repository:

- `packages/shared`
- `apps/server`

Priority: P0
Type: API
Depends on:

- `AKB-01`

목표:

- canonical ticket Markdown을 구조화하고, 안전하게 부분 업데이트할 수 있는 parser/serializer를 만든다.

현재 문제:

- ticket 문서는 Markdown이므로 상태 변경, progress 변경, 사용자 지시 append, 진행 메모 append를 문자열 치환으로 처리하면 원문 손상 위험이 크다.
- `Progress Board`, ticket body, top-level `현재 진행률`을 함께 갱신해야 한다.
- `진행 메모`는 agent 작업 로그로 유지하고, 사용자가 채팅창이나 UI에서 입력한 작업 방향은 `사용자 지시`로 분리해야 한다.
- 기존 plan-ticketing 문서에는 `사용자 지시` field가 없을 수 있으므로 parser는 하위 호환을 유지해야 한다.

구현 범위:

- `TicketStatus`, `TicketProgress`, `TicketDocument`, `TicketItem` shared type과 zod schema를 정의한다.
- `## Status`, `## Progress Board`, `## Ticket List` section parser를 구현한다.
- `### AKB-00. Title` ticket heading과 canonical fields를 파싱한다.
- optional `사용자 지시` field를 파싱하고, 없으면 빈 append target으로 취급한다.
- status/progress 변경 serializer를 구현한다.
- `사용자 지시` append serializer를 구현한다. field가 없으면 `진행 메모` 바로 앞에 삽입한다.
- `진행 메모` append serializer를 구현한다.
- `사용자 지시`와 `진행 메모`는 append-only log로 다루고, 기본 날짜는 `YYYY-MM-DD`로 유지한다.
- unknown block 보존과 canonical field 누락 감지를 구현한다.

제외 범위:

- Express route wiring
- browser UI
- drag-and-drop

완료 기준:

- [x] canonical ticket 문서를 구조화할 수 있다.
- [x] optional `사용자 지시` field가 있는 문서와 없는 기존 문서를 모두 구조화할 수 있다.
- [x] status/progress 변경 시 board와 ticket body가 함께 갱신된다.
- [x] 사용자 지시 append 시 선택 ticket의 `사용자 지시`만 변경되며, field가 없으면 `진행 메모` 앞에 삽입된다.
- [x] 진행 메모 append 시 선택 ticket의 `진행 메모`만 변경된다.
- [x] canonical field 누락 시 쓰기 차단용 error를 반환한다.

검증:

- [x] parser unit test
- [x] serializer snapshot test
- [x] optional `사용자 지시` field compatibility test
- [x] malformed Markdown fixture test

사용자 지시:

- 2026-06-22: `진행 메모`는 agent가 자율적으로 입력하는 작업 로그로 두고, 사용자가 Codex 채팅창이나 Alpha Kanban UI에서 입력한 작업 방향은 별도 `사용자 지시` field에 기록한다.
- 2026-06-22: 기존 문서가 많으므로 날짜는 `YYYY-MM-DD`로 유지하고, 같은 날짜 안의 순서는 문서 라인 순서로 해석한다.
- 2026-06-22: `사용자 지시`와 `진행 메모`는 기본적으로 append-only log로 다룬다.

진행 메모:

- 2026-06-22: 초안 작성.
- 2026-06-22: plan-ticketing 스킬 변경에 맞춰 parser/serializer 범위에 optional `사용자 지시`, append-only log, `YYYY-MM-DD` 날짜 정책을 반영했다.
- 2026-06-22: `packages/shared`에 ticket status/progress/document/item/log zod schema와 TypeScript type을 추가했다.
- 2026-06-22: `apps/server/src/markdown/ticketMarkdown.ts`에 section-aware parser, status/progress serializer, `사용자 지시` append, `진행 메모` append, `NEEDS_REPAIR` write guard를 구현했다.
- 2026-06-22: 현재 `docs/02_alpha_kanban_tickets.md`, `사용자 지시` 없는 legacy fixture, malformed fixture, unknown prose preservation 케이스를 Vitest로 검증했다.
- 2026-06-22: `pnpm typecheck`, `pnpm test`, `pnpm build`를 통과했다.

### AKB-03. Express API, filesystem allowlist, safe write 구현

Status: DONE
Progress: 100%
Repository:

- `apps/server`
- `packages/shared`

Priority: P0
Type: API / Security
Depends on:

- `AKB-02`

목표:

- 로컬 Markdown 파일을 탐색, 읽기, 수정하는 Express API를 안전하게 제공한다.

현재 문제:

- browser는 로컬 파일을 직접 안정적으로 수정할 수 없다.
- local-only 앱이어도 filesystem 접근 범위와 stale write 보호가 필요하다.

구현 범위:

- `alpha-kanban.config.json` 또는 기본 config loader를 추가한다.
- `docRoots`, `workspaceRoots`, `codexCommand` 설정을 지원한다.
- path allowlist 검증 helper를 구현한다.
- `GET /api/files`로 Markdown 문서 목록을 반환한다.
- `GET /api/files/:fileId/tickets`로 ticket document를 반환한다.
- `PATCH /api/files/:fileId/tickets/:ticketId`로 status/progress를 수정한다.
- `POST /api/files/:fileId/tickets/:ticketId/instructions`로 사용자 지시를 추가한다.
- `POST /api/files/:fileId/tickets/:ticketId/progress-notes`로 agent 진행 메모를 추가한다.
- temp file + rename 방식의 atomic write를 구현한다.
- content hash 또는 `mtimeMs` 기반 stale write 검사를 구현한다.

제외 범위:

- Codex process 실행
- UI 구현
- 인증/멀티 유저 권한 모델

완료 기준:

- [x] allowlist 밖 path 요청이 거부된다.
- [x] ticket 문서 목록과 ticket 상세를 API로 조회할 수 있다.
- [x] status/progress/사용자 지시/진행 메모 변경이 Markdown 원본에 반영된다.
- [x] stale write가 감지되면 파일을 덮어쓰지 않는다.

검증:

- [x] API integration test
- [x] allowlist traversal test
- [x] stale write test
- [x] manual smoke with sample `*_tickets.md`

진행 메모:

- 2026-06-22: 초안 작성.
- 2026-06-22: `apps/server/src/config.ts`, `apps/server/src/files.ts`, `apps/server/src/app.ts`에 config loader, Markdown file allowlist, file scan/read/write API, stale write guard를 구현했다.
- 2026-06-22: shared API DTO schema를 추가하고, API integration test로 file list/read, status patch, 사용자 지시 append, 진행 메모 append, allowlist rejection, stale write를 검증했다.
- 2026-06-22: `pnpm typecheck && pnpm test && pnpm build` 및 dev server API smoke로 sample ticket document 조회를 확인했다.

### AKB-04. 파일 브라우저 및 칸반 보드 UI 구현

Status: DONE
Progress: 100%
Repository:

- `apps/web`
- `packages/shared`

Priority: P0
Type: UX
Depends on:

- `AKB-03`

목표:

- 여러 Markdown 파일을 선택하고 선택된 ticket 문서를 Notion-like 칸반 보드로 탐색할 수 있게 한다.

현재 문제:

- 사용자는 현재 Markdown 파일을 직접 열어 ticket 상태를 확인해야 한다.
- 여러 ticket 문서를 한눈에 비교하거나 칸반으로 볼 UI가 없다.

구현 범위:

- shadcn/ui를 web UI foundation으로 도입하되, 전체 page section이나 board shell을 중첩 card로 감싸지 않는다.
- Notion-like flat board canvas를 기본으로 하고, 실제 반복 item인 ticket만 작은 card로 표현한다.
- 칸반 컬럼은 subtle background, 얇은 border, compact header 중심으로 구현한다.
- TanStack Router 기반 route 구조를 구성한다.
- TanStack Query 기반 API client를 구성한다.
- 좌측 file browser를 구현한다.
- ticket document loading, empty, parse error 상태를 구현한다.
- `TODO`, `READY`, `IN_PROGRESS`, `BLOCKED`, `DONE`, `DEFERRED` 칸반 컬럼을 구현한다.
- ticket card에 id, title, priority, progress, repository, dependency 정보를 compact property row로 표시한다.
- desktop/mobile viewport에서 레이아웃이 깨지지 않도록 responsive layout을 구성한다.

제외 범위:

- ticket detail edit modal
- drag-and-drop status 변경
- Codex runner

완료 기준:

- [x] `/api/files` 결과가 좌측 목록에 표시된다.
- [x] ticket 문서 선택 시 board가 status별로 렌더링된다.
- [x] board가 Notion-like flat canvas와 subtle column, ticket card 중심의 시각 구조를 유지한다.
- [x] loading, empty, parse error 상태가 구분된다.
- [x] 긴 ticket title과 긴 repository path가 카드 레이아웃을 깨지 않는다.

검증:

- [x] component test 또는 Playwright smoke
- [x] desktop viewport screenshot check
- [x] mobile viewport screenshot check

진행 메모:

- 2026-06-22: 초안 작성.
- 2026-06-22: 사용자의 목표에 맞춰 board UI 방향을 Notion-like flat canvas, subtle column, ticket card 중심으로 구체화했다.
- 2026-06-22: Tailwind v4와 shadcn-style primitive foundation을 구성하고, TanStack Router/Query 기반의 file browser와 status column board UI를 구현했다.
- 2026-06-22: Playwright smoke로 desktop `1280x720`, mobile `390x844`에서 `/api/files` 결과, 8개 ticket card, 6개 status column, page overflow, badge wrapping을 확인했다.

### AKB-05. 티켓 상세 팝업, 상태 변경, 사용자 지시 입력 구현

Status: DONE
Progress: 100%
Repository:

- `apps/web`
- `apps/server`

Priority: P0
Type: UX / API
Depends on:

- `AKB-03`
- `AKB-04`

목표:

- ticket card 선택 시 Notion 상세 페이지처럼 내용을 열고, status/progress/사용자 지시를 Markdown에 반영한다.

현재 문제:

- 칸반에서 ticket을 보더라도 상세 field, 사용자 지시, 진행 메모를 편하게 읽을 UI가 필요하다.
- status 변경과 사용자 지시 append는 원본 Markdown 동기화가 필요하다.

구현 범위:

- Notion 상세 페이지 팝업과 유사한 ticket detail modal 또는 drawer를 구현한다.
- canonical fields를 섹션별로 표시한다.
- status selector와 progress selector를 제공한다.
- `사용자 지시`는 durable history로 표시하고, 사용자가 직접 수정하는 입력은 Run with Codex 실행 draft로 분리한다.
- Run with Codex 실행 시 server가 draft를 짧은 실행 지시 요약으로 정규화해 `사용자 지시`에 append한다.
- `사용자 지시`와 `진행 메모`는 접거나 펼칠 수 있는 timeline/section 형태로 표시하되, 사용자 입력 영역은 실행 draft composer에만 둔다.
- `진행 메모`는 agent-authored log로 표시하되 사용자 지시 input과 분리한다.
- mutation 성공 시 board와 detail cache를 갱신한다.
- stale write error 발생 시 reload/merge 안내를 표시한다.

제외 범위:

- Markdown 전체 rich text editing
- drag-and-drop status 변경
- Codex runner 실행

완료 기준:

- [x] card 선택 시 ticket detail이 열린다.
- [x] detail surface가 Notion-like page peek/modal 느낌을 유지하고, board 위에 과도한 nested card 구조를 만들지 않는다.
- [x] status/progress 변경이 board와 Markdown 원문에 반영된다.
- [x] Run with Codex 실행 draft가 요약되어 `사용자 지시`에 날짜와 함께 append된다.
- [x] API error와 stale write error가 UI에서 구분 표시된다.

검증:

- [x] status mutation smoke
- [x] Run with Codex draft summary append smoke
- [x] stale write UI smoke

진행 메모:

- 2026-06-22: 초안 작성.
- 2026-06-22: ticket detail UI 방향을 Notion-like page peek/modal로 구체화하고, `사용자 지시`와 `진행 메모`를 분리된 접이식 section/timeline으로 표시하는 기준을 추가했다.
- 2026-06-22: `apps/web/src/App.tsx`에 ticket detail drawer, status/progress save, 사용자 지시 append, stale write reload 안내를 구현했다.
- 2026-06-22: `examples/sample_tickets.md`로 card open, status/progress save, 사용자 지시 append, stale write banner UI smoke를 수행하고 fixture는 원상태로 복구했다.
- 2026-06-22: 사용자 피드백에 따라 수동 `Append instruction` UI를 제거하고, Run with Codex 영역의 실행 draft composer가 실행 시 `사용자 지시` 요약 append를 담당하도록 UX를 변경했다.
- 2026-06-22: 인앱 브라우저에서 `SMP-02` detail drawer를 열어 `사용자 지시`가 history only로 표시되고 `Run with Codex` 아래 `Execution draft` textarea가 노출되는 것을 확인했다.

### AKB-06. Run with Codex 실행, streaming log, 결과 메모 연결

Status: DONE
Progress: 100%
Repository:

- `apps/server`
- `apps/web`

Priority: P0
Type: Feature / Security
Depends on:

- `AKB-03`
- `AKB-05`

목표:

- ticket detail에서 명시적으로 Codex 실행을 시작하고, 실행 상태와 결과를 ticket에 연결한다.
- Codex session은 ticket id가 아니라 선택된 `*_tickets.md` Markdown 파일 단위로 이어간다.

현재 문제:

- API key 없이도 local Codex CLI를 쓸 수 있지만, browser에서 직접 process를 실행할 수는 없다.
- Codex 실행은 prompt 구성, process spawn, log streaming, cancel, 결과 기록 경계가 필요하다.
- ticket id별로 Codex session을 저장하면 같은 ticket document 안의 작업 맥락이 쪼개진다.
- 반대로 `--last` 같은 전역 resume은 다른 문서나 다른 프로젝트 session에 붙을 위험이 있다.
- Codex session id는 사용자 로컬 CLI 상태와 연결되므로 Markdown 문서에 커밋하면 안 된다.

구현 범위:

- `POST /api/codex/runs` endpoint를 추가한다.
- ticket file path, plan path, selected ticket id, user instruction을 바탕으로 Codex prompt를 생성한다.
- Run with Codex 실행 draft를 받아 실행 시작 전 `사용자 지시`에 요약 append하고, raw draft는 prompt와 local run log에만 포함한다.
- prompt에는 문서 전체를 embedding하지 않고, Codex가 `rg`/`sed`로 selected ticket range와 관련 plan section을 직접 읽도록 지시한다.
- ticket document fileId 또는 normalized path를 key로 Codex session id를 저장한다.
- session id와 document graph는 Markdown 문서가 아니라 gitignore된 `.alpha-kanban/state.json` 같은 local-only JSON에 저장한다.
- app state에는 document path별 `codexSessionId`, `relatedDocuments`, parent document/ticket reference를 저장할 수 있게 한다.
- 저장된 file-level session id가 있으면 `codex exec resume <sessionId> ...`로 이어 실행하고, 없으면 `codex exec ...`로 새 session을 시작한다.
- `codex exec --json` event의 `thread_id`를 capture해서 ticket document 파일 단위 app state에 저장한다.
- `--last`는 기본 resume 전략으로 사용하지 않는다.
- process 실행은 `spawn(command, args)` 형태로 수행한다.
- shell interpolation을 금지한다.
- SSE 또는 websocket으로 stdout/stderr/progress event를 streaming한다.
- `POST /api/codex/runs/:runId/cancel`을 제공한다.
- 종료 시 exit code, final message, log path를 ticket `진행 메모`에 append한다.
- `codex` CLI 없음, auth 필요, non-zero 종료를 구분한다.

제외 범위:

- OpenAI API 직접 호출
- Codex Cloud task 생성
- 상태 변경만으로 자동 실행되는 workflow

완료 기준:

- [x] UI에서 prompt preview를 확인하고 Codex run을 시작할 수 있다.
- [x] 같은 `*_tickets.md` 파일 안의 다른 ticket 실행이 같은 file-level Codex session을 resume한다.
- [x] 다른 `*_tickets.md` 파일은 별도 Codex session을 사용한다.
- [x] `codex exec --json`의 `thread_id`가 `.alpha-kanban/state.json`의 file-level app state에 저장된다.
- [x] `.alpha-kanban/`은 gitignore되어 session id가 Markdown 문서나 Git 변경에 섞이지 않는다.
- [x] 실행 log가 UI에 streaming된다.
- [x] 실행 취소가 가능하다.
- [x] 성공/실패 결과가 ticket `진행 메모`에 append된다.
- [x] `codex` CLI 미설치 또는 미로그인 상태를 구분해서 안내한다.

검증:

- [x] mocked process unit/integration test
- [x] file-level session resume test
- [x] dry-run mode smoke
- [x] local Codex CLI command syntax smoke (`codex exec --help`, `codex exec resume --help`); 실제 run은 사용자가 UI에서 명시 실행할 때 수행

사용자 지시:

- 2026-06-22: Codex session id는 ticket 번호별이 아니라 선택한 Markdown ticket document 파일 단위로 저장하고 재사용한다.
- 2026-06-22: `Run with Codex`는 문서 전체를 prompt에 넣기보다 ticket file path와 selected ticket id를 주고 Codex가 `rg`/`sed`로 최신 범위를 직접 읽게 한다.
- 2026-06-22: Codex session id와 문서 graph는 Markdown에 녹이지 말고, 사용자별 CLI 상태 차이를 고려해 외부 local-only JSON으로 관리한다.

진행 메모:

- 2026-06-22: 초안 작성.
- 2026-06-22: Codex runner 설계를 ticket-level session에서 file-level session으로 조정하고, `--last` 대신 저장된 session id를 명시적으로 resume하는 정책을 추가했다.
- 2026-06-22: `.alpha-kanban/`을 gitignore에 추가하고, session/document graph를 local-only app state로 관리하는 정책을 반영했다.
- 2026-06-22: `apps/server/src/codexState.ts`, `apps/server/src/codexRunner.ts`, `/api/codex/prompt-preview`, `/api/codex/runs`, `/api/codex/runs/:runId/events`, `/api/codex/runs/:runId/cancel`을 구현했다.
- 2026-06-22: fake Codex executable 기반 integration test로 `thread_id` capture, file-level resume, 다른 document session 분리, cancel, 결과 `진행 메모` append를 검증했다.
- 2026-06-22: UI detail drawer에 prompt preview, run start, SSE log display, cancel control을 연결했다.
- 2026-06-22: `codex exec`가 추가 stdin EOF를 기다리는 문제를 수정하기 위해 runner spawn 옵션에 `stdio: ["ignore", "pipe", "pipe"]`를 적용하고, fake CLI가 stdin EOF를 받는 integration test를 보강했다.
- 2026-06-22: `instructionDraft`/`instructionSummary` 계약을 추가하고, Run with Codex 시작 전 server가 draft summary를 `사용자 지시`에 append한 뒤 Codex prompt를 생성하도록 변경했다.
- 2026-06-22: 인앱 브라우저 smoke에서 `Execution draft` 입력 후 `Preview prompt`가 `Codex 실행 지시: ...` 요약과 raw draft 섹션을 모두 포함하는 것을 확인했다.

### AKB-07. 통합 검증, sample 문서, 운영 문서 정리

Status: DONE
Progress: 100%
Repository:

- `alpha-kanban`

Priority: P1
Type: Test / Documentation
Depends on:

- `AKB-01`
- `AKB-02`
- `AKB-03`
- `AKB-04`
- `AKB-05`
- `AKB-06`

목표:

- MVP가 실제 plan-ticketing 문서로 안정적으로 동작하는지 검증하고 운영 문서를 정리한다.

현재 문제:

- 구현 ticket들이 완료되어도 sample fixture, end-to-end smoke, 사용법 문서가 없으면 다음 세션에서 회귀를 잡기 어렵다.

구현 범위:

- `fixtures/` 또는 `examples/`에 sample `*_tickets.md`를 추가한다.
- parser/API/UI 통합 smoke를 구성한다.
- Playwright로 file list, board, modal, status update, 사용자 지시 append flow를 검증한다.
- `README.md`에 설치, 실행, config, Codex login, Run with Codex 주의사항을 정리한다.
- local-only 보안 체크리스트를 문서화한다.

제외 범위:

- 외부 배포 문서
- 멀티 유저 인증 문서
- 외부 issue tracker 연동 문서

완료 기준:

- [x] sample ticket 문서로 전체 flow를 재현할 수 있다.
- [x] `pnpm test`, `pnpm typecheck`, `pnpm build`가 통과한다.
- [x] Playwright smoke가 desktop/mobile viewport에서 통과한다.
- [x] README만 보고 local run을 시작할 수 있다.

검증:

- [x] automated test suite
- [x] manual smoke checklist
- [x] git diff review

진행 메모:

- 2026-06-22: 초안 작성.
- 2026-06-22: `examples/sample_tickets.md`와 `alpha-kanban.config.json`을 추가해 docs/examples Markdown을 함께 스캔하도록 구성했다.
- 2026-06-22: `README.md`에 설치, 실행, config, ticket editing, Run with Codex, sample fixture, 검증 명령, local-only 보안 체크리스트를 정리했다.
- 2026-06-22: `pnpm typecheck && pnpm test && pnpm build` 통과, browser smoke로 desktop default와 mobile `390x844`에서 file list, board, detail drawer, status/user instruction/stale flows, prompt preview를 확인했다.
