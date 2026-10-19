# Alpha Kanban 구현 계획 초안

> 2026-10-18 적용 상태: 초기 서버형 MVP의 설계 이력이다. 현재 구현 지시로 사용하지 않는다. 서버·Codex 실행은 AKR-01에서 제거했고, 브라우저 파일 접근·안전한 저장은 AKL-01~06이 담당한다. 재사용된 문서·보드 기능과 폐기된 실행 기능의 구분은 [전환 인벤토리](21_alpha_kanban_browser_transition_inventory.md)를 따른다.

작성일: 2026-06-22
수정일: 2026-06-22

## 영향 범위

대상 repository:

- `alpha-kanban`

예정 package/module:

- `apps/web`: React/Vite 기반 칸반 UI
- `apps/server`: Express 기반 localhost API, 파일 쓰기, Codex 실행
- `packages/shared`: ticket schema, zod validator, shared TypeScript types

참고 repository:

- `참고용 관리 앱`: TanStack Start, TanStack Router/Query, admin UI 구성 참고

이 문서는 구현 전 합의를 위한 초안이다. 코드 변경은 별도 ticket 단위로 분리한다.

## 목표

- `plan-ticketing` 스킬이 만드는 Markdown ticket 문서를 로컬 웹 UI에서 탐색한다.
- 여러 Markdown 파일을 목록으로 보여주고, 선택한 `*_tickets.md` 파일을 Notion-like 칸반 보드로 렌더링한다.
- 티켓 카드 선택 시 Notion 상세 페이지 팝업처럼 ticket body를 열람하고 수정 가능한 필드를 제공한다.
- 상태 변경, progress 변경, 사용자 지시 추가, agent 진행 메모 추가를 Markdown 원본에 안전하게 반영한다.
- `Run with Codex` 버튼으로 로컬 Codex CLI를 실행하고, 실행 로그와 결과를 티켓 `진행 메모`에 연결한다.
- API key 없이 기존 로컬 Codex ChatGPT 로그인 세션을 재사용하는 흐름을 우선 지원한다.

## 비목표

- 외부 배포용 SaaS 또는 멀티 유저 협업 서비스로 만들지 않는다.
- 원격 네트워크에서 접근 가능한 서버를 기본값으로 제공하지 않는다.
- Markdown 전체를 자유 편집하는 WYSIWYG 문서 편집기를 만들지 않는다.
- Notion API, GitHub Projects, Linear 같은 외부 issue tracker 동기화는 MVP 범위에서 제외한다.
- 상태 변경만으로 Codex가 자동 실행되는 동작은 기본값으로 넣지 않는다.

## 현재 상태 요약

### Repository

- `alpha-kanban` 경로에 Git repository가 초기화되어 있다.
- 현재 추적 전 파일은 `README.md`, `.gitignore`뿐이며, `package.json`, `apps/`, `packages/`, `src/` 구조는 아직 없다.
- `README.md`에는 local-only kanban workspace, Markdown ticket browsing, Codex CLI 실행 의도가 기록되어 있다.

### 스택 결정

- React/Vite + Express를 기본 스택으로 선택한다.
- TanStack Start는 `참고용 관리 앱`과 유사한 full-stack admin app에는 적합하지만, 이 프로젝트의 핵심은 SSR보다 로컬 파일/프로세스 제어이므로 Express가 더 직접적이다.
- 프론트엔드 라우팅과 data fetching은 TanStack Router/Query를 사용해 참고용 관리 앱과 유사한 개발 경험을 일부 유지한다.

### Markdown 입력 형식

- 기준 문서는 `plan-ticketing` 스킬의 canonical ticket shape이다.
- ticket 문서는 `## Status`, `## Progress Board`, `## Ticket List`를 포함하고, 각 ticket은 `### PREFIX-00. Title` 아래에 `Status`, `Progress`, `Repository`, `Priority`, `Type`, `Depends on`, `목표`, `현재 문제`, `구현 범위`, `제외 범위`, `완료 기준`, `검증`, `사용자 지시`, `진행 메모` 필드를 가진다.
- `사용자 지시`는 기존 문서 호환을 위해 optional field로 처리한다. 새 문서에서는 `검증` 뒤, `진행 메모` 앞에 둔다.
- `사용자 지시`는 사용자가 Codex 채팅창 또는 Alpha Kanban UI에서 입력한 작업 방향, 우선순위, 제약, 선호를 기록한다.
- `진행 메모`는 agent가 실제 수행한 작업, 검증 결과, 남은 리스크를 기록한다.

## 제안 아키텍처

### 1. Local-first full-stack 구조

단일 repository 안에 다음 구조를 둔다.

```text
alpha-kanban/
  apps/
    web/
    server/
  packages/
    shared/
  docs/
```

- `apps/web`은 Vite dev server와 React UI를 담당한다.
- `apps/server`는 Express API, filesystem allowlist, Markdown parser/serializer, Codex runner를 담당한다.
- `packages/shared`는 ticket schema, API DTO, status/progress enum, zod validator를 공유한다.
- 개발 중에는 Vite proxy가 `/api/*` 요청을 Express server로 전달한다.

### 2. Markdown scan and parse flow

1. server가 `alpha-kanban.config.json`의 `docRoots`를 읽는다.
2. allowlist 안의 `*_tickets.md`, `*_plan.md`, `*_inventory.md` 파일을 scan한다.
3. 파일 목록은 type, filename, absolute path, relative path, mtime, inferred slug를 포함해 반환한다.
4. 선택한 ticket 문서는 section-aware parser로 `Status`, `Progress Board`, `Ticket List`를 파싱한다.
5. parser는 canonical field와 optional `사용자 지시` field를 구조화하되, 알 수 없는 텍스트는 원문 block에 보존한다.

### 3. Markdown update policy

- status/progress 변경 시 개별 ticket body와 `Progress Board`, top-level `현재 진행률`을 함께 갱신한다.
- `사용자 지시`와 `진행 메모`는 기본적으로 append-only log로 다룬다. 명백한 오탈자 수정이나 사용자 명시 요청이 있을 때만 기존 항목을 수정한다.
- 날짜는 기본적으로 `YYYY-MM-DD` 형식을 사용하고, 같은 날짜의 여러 항목은 문서에 기록된 순서를 시간순으로 해석한다.
- 사용자 입력은 선택 ticket의 `사용자 지시` 마지막에 `YYYY-MM-DD: ...` 형식으로 append한다. `사용자 지시` field가 없는 기존 ticket은 `진행 메모` 바로 앞에 삽입한다.
- agent 작업 결과와 검증 메모는 선택 ticket의 `진행 메모` 마지막에 `YYYY-MM-DD: ...` 형식으로 append한다.
- write는 temp file 작성 후 rename 방식으로 처리한다.
- 요청 시점의 `mtime` 또는 content hash를 함께 보내 stale write를 감지한다.
- canonical structure가 깨진 파일은 읽기는 허용하되 쓰기는 `NEEDS_REPAIR` 에러로 차단한다.

### 4. UI flow

- 좌측에는 Markdown 파일 목록과 검색/필터를 둔다.
- 중앙에는 `TODO`, `READY`, `IN_PROGRESS`, `BLOCKED`, `DONE`, `DEFERRED` 컬럼의 Notion-like 칸반 보드를 둔다.
- 화면은 flat board canvas를 기본으로 하고, page section이나 board 전체를 card shell로 반복해서 감싸지 않는다.
- 컬럼은 subtle background, 얇은 border, compact header를 사용하고, 실제 반복 item인 ticket만 작은 card로 표현한다.
- 카드에는 ticket id, title, repository, priority, progress, dependency hint를 compact property row로 표시한다.
- ticket 선택 시 상세 modal을 열고 canonical field를 섹션별로 보여준다.
- modal 안에서 status/progress 변경, 사용자 지시 history, Codex 실행 draft 입력, prompt preview, `Run with Codex` 실행을 제공한다.

### 5. Codex runner flow

1. 사용자가 ticket detail modal의 Run with Codex 영역에서 실행 draft를 입력한다.
2. server는 draft를 짧은 실행 지시 요약으로 정규화하고, `Run with Codex` 시작 시 선택 ticket의 `사용자 지시`에 append한다. raw draft 전체는 local run log/prompt에만 남긴다.
3. server는 선택 ticket이 속한 `*_tickets.md` 파일 경로를 기준으로 file-level Codex session id를 조회한다. ticket id별 session은 만들지 않는다.
4. server가 ticket file path, plan file path, selected ticket id, repository path, 실행 지시 요약, raw draft, `rg`/`sed`로 최신 ticket range를 직접 읽으라는 지시를 합쳐 Codex prompt를 만든다.
5. 해당 ticket document에 저장된 session id가 있으면 `codex exec resume <sessionId> ...` 형태로 이어 실행하고, 없으면 `codex exec ...`로 새 non-interactive session을 시작한다.
6. 사용자가 명시적으로 `Run with Codex`를 누르면 server가 shell interpolation 없이 `spawn(command, args)`로 실행하고 stdin은 닫는다.
7. `codex exec --json` event에서 반환되는 `thread_id`는 ticket document 파일 단위 app state에 저장한다.
8. app state는 repository 문서가 아니라 gitignore된 `.alpha-kanban/state.json` 같은 local-only JSON에 둔다. 같은 Markdown 문서를 열더라도 사용자별 Codex CLI/session은 다를 수 있기 때문이다.
9. app state는 document path별 `codexSessionId`, related document graph, parent document/ticket reference를 저장할 수 있다.
10. 실행 이벤트는 SSE 또는 websocket으로 UI에 streaming한다.
11. 종료 시 exit code, final message, log path를 ticket `진행 메모`에 append한다.
12. Codex 실행 전후 status 자동 변경은 옵션으로 두고, MVP에서는 명시 확인을 우선한다.

## 보안/운영 원칙

- server는 기본적으로 `127.0.0.1`에만 bind한다.
- 파일 읽기/쓰기는 config allowlist에 포함된 directory로 제한한다.
- shell interpolation을 사용하지 않고 `spawn(command, args)`만 사용한다.
- Codex 실행은 사용자의 명시 버튼 클릭으로만 시작한다.
- ticket 사용자 지시, 실행 draft, filename, path는 shell command string으로 조합하지 않는다.
- Codex process stdin은 닫고 prompt는 argv로만 전달한다.
- Codex 실행 로그에는 auth token, `.env`, private key 같은 민감 정보가 들어가지 않도록 redaction hook을 둔다.
- Markdown 쓰기 전 backup 또는 git diff 확인이 가능해야 한다.

## 에러 정책

- `FILE_NOT_FOUND`: 선택한 Markdown 파일이 삭제되었거나 allowlist 밖으로 이동했다.
- `STALE_FILE`: 사용자가 열어둔 이후 파일이 변경되어 write를 거부한다.
- `PARSE_ERROR`: ticket 구조 파싱에 실패했다. UI는 raw preview를 제공하고 쓰기는 막는다.
- `NEEDS_REPAIR`: canonical field 누락으로 안전한 자동 수정이 불가능하다.
- `CODEX_NOT_FOUND`: `codex` CLI를 PATH에서 찾지 못했다.
- `CODEX_AUTH_REQUIRED`: Codex CLI login이 필요하다.
- `CODEX_RUN_FAILED`: Codex process가 non-zero로 종료되었다. log path와 stderr summary를 표시한다.

## 검증 계획

API:

- Markdown parser unit test로 canonical ticket 문서, field 누락 문서, extra text 보존 문서를 검증한다.
- Express API integration test로 file scan, ticket read, status patch, 사용자 지시 append, 진행 메모 append, stale write를 검증한다.
- Codex runner는 실제 Codex 호출 전 dry-run adapter와 mocked process로 spawn args, streaming, cancel을 검증한다.

Admin:

- React component test 또는 Playwright smoke로 file list, board render, modal open, status update, 사용자 지시 append flow를 확인한다.
- 긴 ticket title, 긴 path, 한국어 section heading, 모바일/데스크톱 viewport에서 텍스트 overlap이 없는지 확인한다.

Manual smoke:

- sample `*_tickets.md`를 만들어 UI에서 열고 status를 변경한다.
- 사용자 지시를 추가한 뒤 Markdown 원문 `사용자 지시`가 append되는지 확인한다.
- `Run with Codex` dry-run 또는 실제 local Codex run을 실행하고 streaming log와 결과 memo append를 확인한다.

## Open Questions

- 없음. 이 초기 계획의 적용은 종료했다. 아래 질문은 당시의 미결정 이력이며 현재 제품의 착수 조건이 아니다. 상세창·드래그는 현재 공통 UI와 AKD/AKL 계약을 따르고 Codex sandbox 선택은 제품 범위에서 제외한다.

### 전환 전 질문 이력

- ticket detail modal은 중앙 modal로 시작할지, 우측 drawer로 시작할지 결정한다.
- `Run with Codex`의 기본 sandbox를 `workspace-write`로 둘지 ticket별로 선택하게 할지 결정한다.
- MVP에서 drag-and-drop status 변경을 바로 넣을지, select 기반 변경 후 drag-and-drop을 후속으로 둘지 결정한다.
