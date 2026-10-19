# [폐기] Alpha Kanban Autonomous Runs 구현 계획 초안

작성일: 2026-06-26
수정일: 2026-10-18

## 현재 적용 상태

- 2026-10-18 브라우저 전용 전환과 AKR-01 서버 제거에 따라 앱 내 세션·run queue·coordinator/subagent·자율 실행·Self Tools/MCP 계획을 폐기한다. 단순한 채팅 미노출 또는 잠정 우선순위 하향 상태가 아니다.
- NVD-01~12는 [폐기]와 DEFERRED로 보관하며 기존 진행률·체크박스·지시는 유지한다. NVD-00의 DONE은 당시 정책 논의 완료 이력이다. 재도입은 별도 제품 결정과 새 계획이 필요하다.
- 서버 runner/API 보존 의무는 종료했다. 디스크에 남은 개인 실행 로그·상태 파일은 제품 코드가 아니므로 삭제하거나 자동 이전하지 않는다. 폴더 연결·브라우저 설정·PWA 저장소도 보존한다.
- Markdown 원본·외부 변경 보호·ticket-md는 현재 제품에서도 유효하다. 브라우저 저장 보호는 AKL-02/03, 외부 AI 작업 규칙은 동봉 implementation-ledger가 담당하며 실행 오케스트레이션은 웹의 역할이 아니다.
- [현재 작업 구분](21_alpha_kanban_browser_transition_inventory.md), [서버 제거 결과](18_browser_only_tickets.md).

### 채팅 미노출 단계의 결정 이력

- 2026-10-13: 앱 내 모든 채팅 입력과 실행 진입점은 잠정 미노출한다. 현재 구현은 칸반 검토와 사용자 지시·상태 변경 사유의 구조화된 Markdown append에 집중한다. AI와의 논의·작업은 외부 Codex에서 문서를 읽고 진행한다.
- 당시에는 실행·큐·오케스트레이션 계획을 보관하고 runner API와 로그를 유지했다. 서버 코드 보존 방침은 이후 AKR-01로 종료했다.
- 당시 후속 작업: `docs/12_alpha_kanban_document_workflow_tickets.md`의 `AKD-01`.

## 영향 범위

- Target repository: `alpha-kanban`
- Target packages:
  - `apps/server`
  - `apps/web`
  - `packages/shared`
  - `scripts`
- Related documents:
  - `docs/03_alpha_kanban_multi_workspace_plan.md`
  - `docs/04_alpha_kanban_multi_workspace_tickets.md`
  - `docs/06_alpha_kanban_provider_harness_plan.md`
  - `docs/07_alpha_kanban_provider_harness_tickets.md`
  - `docs/08_alpha_kanban_global_header_plan.md`
  - `docs/09_alpha_kanban_global_header_tickets.md`

## 목표

- "내비도"처럼 놓아둬도 안전하게 굴러가는 실행 기반을 만든다.
- 한 project 안에서 여러 Codex 요청이 들어와도 충돌 없이 queue, lock, resume, retry, cancel, read 상태를 추적한다.
- 같은 Markdown 파일 또는 같은 ticket을 여러 Codex run이 동시에 망가뜨리지 않도록 scope lock을 둔다.
- WebUI 새로고침, modal close, server restart 이후에도 run 상태를 복구하거나 명확히 실패 처리한다.
- Codex가 Markdown을 직접 부정확하게 수정하는 위험을 줄이고, canonical ticket field/log 변경은 전용 writer를 통해 처리한다.
- plan/ticket/inventory Markdown을 프로젝트 작업의 canonical ledger로 유지하고, JSON/SQLite는 run 상태, queue, cache, subagent report 같은 운영 상태에만 사용한다.
- Workspace Chat의 장기 coordinator session과 단기 worker/subagent run을 분리해, 기억은 유지하되 Markdown 갱신은 coordinator-owned writeback으로 직렬화한다.
- 충분히 안정화된 뒤 dependency가 충족된 다음 ticket을 자동으로 이어 실행할 수 있는 autonomous mode의 기반을 둔다.

## 비목표

- 첫 단계에서 무제한 병렬 실행을 허용하지 않는다.
- Codex CLI 자체의 내부 thread/session 구현을 대체하지 않는다.
- 모든 provider/local model의 skill compatibility를 이 phase에서 해결하지 않는다.
- 외부 project repository 안에 Alpha Kanban state를 쓰지 않는다.
- 사용자가 요구하지 않은 코드를 자동 commit/push하지 않는다.
- conflict resolution을 LLM에게만 맡기지 않는다.
- plan/ticket/inventory의 source of truth를 SQLite/JSON으로 이전하지 않는다.
- worker/subagent가 plan/ticket/inventory Markdown을 직접 갱신하는 병렬 writer 모델을 기본값으로 두지 않는다.
- mobile-first 운영 dashboard 완성은 후속 visual polish로 둔다.

## 현재 상태 요약

- `apps/server/src/codexRunner.ts`는 run을 memory `Map`에 보관하고, `.alpha-kanban/runs/{runId}.jsonl`에 event log를 쓴다.
- document run summary는 `findActiveRunForFile(fileId)` 기준으로 active run을 찾고, 같은 document에 active run이 있으면 새 run을 막는다.
- `apps/server/src/__tests__/api.test.ts`에는 "summarizes document run state and blocks a second active run" 테스트가 있고, duplicate active run은 `409 CODEX_DOCUMENT_RUN_ACTIVE`로 실패한다.
- `apps/server/src/codexState.ts`는 control repo `.alpha-kanban/state.json`에 workspace-scoped document session, recent workspace, run read state, codex defaults, runtime workspaceRoots를 저장한다.
- ticket chat, workspace chat, prompt preview, run activity UI는 이미 있으나 run queue나 scope lock 개념은 아직 없다.
- 현재 UI는 running/succeeded/failed badge와 activity timeline을 보여줄 수 있지만, project 전체 queue/supervisor view는 없다.
- `scripts/ticket-md.mjs`는 ticket id를 기준으로 status/user/note 변경을 안전하게 수행할 수 있고, legacy Progress Board에 의존하지 않는다.
- 현재 project memory와 작업 상태는 Markdown 문서, `.alpha-kanban/state.json`, `.alpha-kanban/runs/*.jsonl`에 나뉘어 있다.
- 앞으로도 Markdown은 사람이 직접 열고 편집할 수 있는 canonical 작업 기록으로 남기고, state/cache는 언제든 Markdown에서 재생성 가능한 운영 보조 데이터로 제한한다.

## 제안 아키텍처

### 핵심 개념

- `Run Supervisor`
  - 모든 Codex run lifecycle 운영 상태의 source of truth.
  - plan/ticket/inventory 본문이나 ticket status/progress의 source of truth는 아니며, 해당 canonical record는 Markdown에 남는다.
  - queued, blocked, starting, running, cancelling, succeeded, failed, cancelled, orphaned 상태를 관리한다.
  - memory state와 persisted state를 동기화한다.

- `Markdown Canonical Ledger`
  - plan/ticket/inventory Markdown이 목표, 결정, ticket 상태, 진행률, 사용자 지시, 진행 메모의 canonical record다.
  - 외부 editor나 Git diff로 Markdown이 바뀌면 operational cache보다 Markdown을 우선한다.
  - parser cache나 run state가 Markdown canonical field를 덮어쓰지 않는다.

- `Operational State Store`
  - `.alpha-kanban/state.json`을 먼저 확장하고, 필요하면 SQLite로 내부 구현을 바꿀 수 있다.
  - 저장 대상은 run queue, lock, session mapping, chat log, read state, parsed cache, subagent report, retry metadata다.
  - ticket `Status`, `Progress`, `Completed at`, `사용자 지시`, `진행 메모`, plan/ticket/inventory 본문은 operational store의 canonical data가 아니다.

- `Run Queue`
  - 사용자가 여러 요청을 넣으면 즉시 실패시키지 않고 queue에 넣는다.
  - queue는 scope lock과 safety policy를 보고 실행 가능 여부를 판단한다.
  - worker/subagent report와 coordinator writeback도 queue item으로 관리해 Markdown 다중 writer를 막는다.

- `Scope Lock`
  - lock scope는 최소 `workspace`, `document`, `ticket`, `chat` 단위로 둔다.
  - MVP scheduler는 구현 단순성을 위해 read-only/edit 구분 없이 workspace 단위 active run 1개만 허용한다.
  - 같은 ticket edit run은 동시 실행 금지.
  - 같은 Markdown file edit run은 기본 동시 실행 금지.
  - read-only 병렬 실행은 후속 `read-only isolated run` 확장으로 둔다.
  - workspace-wide edit run은 project lock에 가깝게 보수적으로 처리한다.

- `Session Mapping`
  - workspace coordinator, document, ticket, worker/subagent scope별 Codex session id를 명시적으로 저장한다.
  - workspace coordinator session은 plan/inventory 질의, ticket 작성, 장기 기억, worker orchestration을 담당한다.
  - worker/subagent session은 ticket 구현과 검증을 맡고, 작업 시작 시점에 coordinator가 정리한 context와 Markdown snapshot을 주입받는다.
  - 같은 scope의 후속 작업은 같은 session resume을 우선하되, worker는 필요하면 독립 session으로 실행할 수 있다.
  - 다른 scope의 병렬 작업은 별도 session을 허용하되, 같은 Markdown canonical write lock은 공유하지 않는다.

- `Conflict-aware Markdown Writer`
  - ticket status/progress/completedAt/user instruction/progress note 변경은 LLM raw patch보다 전용 writer를 우선한다.
  - server API와 Codex prompt 모두 "ticket-md 또는 server mutation API를 사용하라"는 계약을 강화한다.
  - patch 전후 line range와 hash를 기록해 잘못된 ticket이 수정되는 일을 줄인다.

- `Coordinator-owned Markdown Writeback`
  - Workspace coordinator 또는 server writer가 plan/ticket/inventory Markdown 갱신의 단일 owner다.
  - worker/subagent는 Markdown을 직접 고치지 않고 structured report, changed files, verification result, suggested ticket note를 반환한다.
  - coordinator는 report를 검토해 필요한 Markdown 변경만 `ticket-md` 또는 writer API로 직렬 적용한다.

- `Alpha Kanban Self Tools`
  - Workspace Chat이 Markdown을 직접 patch하지 않고 Alpha Kanban의 안전한 tool contract를 통해 document set, ticket, run, writer를 조회/조작하게 한다.
  - 내부 tool layer를 먼저 만들고, MCP server는 같은 contract를 외부에 노출하는 adapter로 둔다.
  - 핵심 tools는 `list_document_sets`, `read_ticket`, `read_document_context`, `create_plan_ticket_docs`, `append_ticket_user_instruction`, `append_ticket_note`, `update_ticket_status`, `propose_next_tickets`, `enqueue_or_run_ticket`이다.
  - Workspace Chat은 multi-ticket 요청을 직접 장시간 edit run으로 처리하기보다 self tools로 대상과 순서를 계산하고, 필요할 때 single coordinator run 또는 scoped ticket run으로 넘긴다.

- `Autonomous Mode`
  - 사용자 명시 opt-in일 때만 동작한다.
  - 기본 동작은 dependency가 충족된 READY ticket을 제안만 하는 `suggest-only`다.
  - 사용자가 auto-enqueue를 켜면 다음 READY ticket을 자동으로 queue에 넣을 수 있다.
  - 자동 실행은 `maxRuns`, 새 run 시작 제한 시각, permission boundary, branch/dirty state policy를 가진다.
  - 시간 제한은 이미 시작한 run을 강제 종료하지 않고, 제한 시각 이후 새 run 시작만 막는다. 강제 중단은 별도 cancel/emergency action으로만 제공한다.

### 실행 흐름

1. UI가 ticket chat 또는 workspace chat에서 run request를 보낸다.
2. Server가 request를 `RunIntent`로 normalize한다.
3. Workspace Chat 요청이면 coordinator session과 Self Tools가 관련 document set, ticket, dependency, prior plan/inventory context를 조회한다.
4. Supervisor가 scope, mode, target files, lock key, session key, safety flags를 계산한다.
5. 구현 작업이 필요하면 coordinator가 worker/subagent context bundle을 만들고, supervisor가 worker run을 queue하거나 start한다.
6. 즉시 실행 가능하면 process를 start하고, 불가능하면 queued 또는 blocked로 저장한다.
7. UI는 project-level run queue와 message-level activity를 같은 run id로 표시한다.
8. Worker/subagent는 code/test 변경과 검증 결과를 report로 반환하고, plan/ticket/inventory Markdown을 직접 수정하지 않는다.
9. Coordinator 또는 server writer가 report를 읽고 필요한 canonical ticket field/log 변경을 writer/API로 적용한다.
10. Run 완료 후 supervisor가 lock release, unread result, assistant answer, next action proposal을 기록한다.
11. Run 완료 후 다음 candidate ticket을 계산한다. 기본은 제안만 하고, auto-enqueue가 켜져 있으며 `maxRuns`와 새 run 시작 제한을 통과할 때만 queue에 넣는다.

### State Shape 초안

```ts
type RunScopeKind = "workspace" | "document" | "ticket" | "chat";
type RunMode = "read_only" | "edit";
type RunLifecycle =
  | "queued"
  | "blocked"
  | "starting"
  | "running"
  | "cancelling"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "orphaned";

type RunLock = {
  key: string;
  workspaceId: string;
  fileId?: string;
  ticketId?: string;
  mode: RunMode;
  acquiredByRunId: string;
  acquiredAt: string;
};

type RunQueueItem = {
  id: string;
  workspaceId: string;
  fileId?: string;
  ticketId?: string;
  chatMessageId?: string;
  scopeKind: RunScopeKind;
  mode: RunMode;
  status: RunLifecycle;
  lockKeys: string[];
  sessionKey: string;
  requestedAt: string;
  startedAt?: string;
  finishedAt?: string;
  retryOfRunId?: string;
};

type WorkerReport = {
  id: string;
  workspaceId: string;
  parentRunId: string;
  workerRunId: string;
  ticketId?: string;
  changedFiles: string[];
  verification: string[];
  suggestedTicketNote?: string;
  suggestedStatus?: "TODO" | "READY" | "IN_PROGRESS" | "BLOCKED" | "DONE" | "DEFERRED";
  createdAt: string;
  consumedAt?: string;
};
```

### UI 방향

- Workspace topbar 또는 floating run center에서 project-level active/queued/failed runs를 보여준다.
- Ticket chat message는 자신이 만든 run의 activity, assistant answer, retry/delete 상태를 가진다.
- Workspace Chat도 같은 message-level run activity를 가진다.
- 빈 project에서는 Workspace Chat으로 spec grilling을 시작하고, plan/ticket/inventory 생성 요청이 primary path가 된다.
- Autonomous mode는 기본 suggest-only이며, 사용자가 auto-enqueue를 켠 경우에만 다음 READY ticket을 자동 queue에 넣는다.

## 보안/운영 원칙

- `Edit files` run은 같은 document/ticket lock 없이는 시작하지 않는다.
- plan/ticket/inventory Markdown write는 coordinator/server writer lock 없이는 시작하지 않는다.
- worker/subagent는 기본적으로 `*_plan.md`, `*_tickets.md`, `*_inventory.md`를 직접 수정하지 않는다. 예외가 필요하면 manual single-run mode로 표시한다.
- `dangerously-bypass-approvals-and-sandbox` 같은 강한 권한은 project/user setting에서 한 번 명시적으로 켜면 persistent default로 전달한다. 반복 run마다 confirm을 강요하지 않고, UI에는 현재 권한 상태를 항상 노출한다.
- Queue는 사용자에게 숨겨진 자동 병렬 실행처럼 보이면 안 된다. queued, blocked, running 상태를 UI에 표시한다.
- MVP에서는 lock conflict가 나면 `Run anyway`를 제공하지 않고 자동 queue 또는 blocked 상태로만 처리한다.
- 후속 `Run anyway`는 canonical workspace에 즉시 쓰는 강제 실행이 아니라 snapshot/temp worktree에서 isolated worker run을 돌린 뒤 coordinator가 merge/writeback하는 방식으로 설계한다.
- Cancel은 process kill뿐 아니라 queue item/lock release/event append까지 포함한다.
- Server restart 후 active run은 PID/command/cwd/log/heartbeat를 recovery scan으로 먼저 분류한다. PID가 살아 있고 marker가 맞으면 recoverable/running 후보로 보고, PID가 없으면 jsonl과 Markdown 변경 내용을 근거로 succeeded/failed/unknown을 재판단한다.
- Autonomous mode는 `maxRuns`, no-new-runs-after, allowed scopes, write permission policy를 가져야 한다. 시간 제한은 running process hard kill이 아니라 새 run 시작 제한으로 해석한다.
- LLM이 직접 Markdown을 바꾸더라도 최종 ticket state 변경은 parser/writer validation을 통과해야 한다.
- operational store의 parsed cache는 Markdown file hash/mtime과 함께 저장하고, 외부 Markdown 변경이 감지되면 cache를 폐기하거나 stale로 표시한다.

## 에러 정책

- Lock conflict: `409 RUN_SCOPE_LOCKED`, UI는 queue에 넣을지 기다릴지 선택지를 보여준다.
- Queue blocked: `blocked` 상태와 reason을 저장하고, user action이 필요한지 표시한다.
- Process spawn failure: chat message는 failed run id를 유지하고 retry/delete가 가능해야 한다.
- Server restart recovery failure: PID/process scan과 jsonl/Markdown 재판단으로 상태를 최대한 복구하고, 그래도 애매한 run만 `orphaned_unknown`으로 표시해 사용자 확인을 요구한다.
- Markdown stale write: file hash mismatch를 감지하고 run을 failed 또는 blocked로 전환한다.
- Markdown external change: cache를 즉시 canonical로 취급하지 않고 stale 처리한 뒤 Markdown을 다시 parse한다.
- Writer failure: raw LLM output을 그대로 성공 처리하지 말고, failed run activity와 repair action을 남긴다.
- Worker report conflict: worker가 제안한 status/note가 최신 Markdown과 충돌하면 coordinator writeback을 blocked로 두고 재검토한다.

## 검증 계획

- Unit tests:
  - lock key 계산
  - queue ordering
  - MVP workspace single-active policy
  - session key mapping
  - self tool input/output schema
  - self tool ticket range/hash validation
  - operational cache invalidation
  - worker report schema
  - autonomous next-ticket selection
- Server integration tests:
  - same ticket edit run queue/block
  - different ticket same file lock conflict
  - read-only run도 active workspace run이 있으면 queue/block
  - cancel releases lock
  - failed spawn does not append duplicate user instruction
  - restart/reload state recovery
  - external Markdown change invalidates parsed cache
  - worker report is persisted and consumed once
- Writer tests:
  - ticket-md/server writer가 target ticket range만 수정
  - completedAt/status/progress/user/note consistency
  - stale hash rejection
  - worker/subagent report에서 생성된 note/status 제안이 coordinator writeback으로만 적용
- Self tool tests:
  - list/read/create/update tools가 workspace allowlist와 docRoots를 지킨다.
  - Workspace Chat multi-ticket 요청이 tool plan으로 분해된다.
  - MCP adapter가 내부 tool contract와 같은 schema를 노출한다.
- UI smoke:
  - project run center active/queued/failed display
  - ticket chat message-level activity
  - workspace chat message-level activity
  - retry/delete failed message
  - autonomous mode opt-in and stop

## Open Questions

- 없음. 실행 계획 폐기에 따라 아래 항목은 현재 제품의 질문이 아니다. worker 권한·운영 DB·NaviDO 명칭을 결정하기 위해 브라우저 또는 스킬 작업을 막지 않는다.

### 폐기된 계획의 질문 이력

- worker/subagent의 Markdown 직접 수정을 prompt 계약으로만 막을지, filesystem/tool restriction까지 둘지 결정해야 한다.
- operational store는 JSON 확장을 먼저 유지할지, queue/report가 늘어나는 시점에 SQLite로 옮길지 결정해야 한다.
- Product name `NaviDO`를 UI copy에 쓸지, 내부 roadmap codename으로만 쓸지 결정해야 한다.
