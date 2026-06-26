# Alpha Kanban Autonomous Runs 구현 계획 초안

작성일: 2026-06-26
수정일: 2026-06-26

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
- 충분히 안정화된 뒤 dependency가 충족된 다음 ticket을 자동으로 이어 실행할 수 있는 autonomous mode의 기반을 둔다.

## 비목표

- 첫 단계에서 무제한 병렬 실행을 허용하지 않는다.
- Codex CLI 자체의 내부 thread/session 구현을 대체하지 않는다.
- 모든 provider/local model의 skill compatibility를 이 phase에서 해결하지 않는다.
- 외부 project repository 안에 Alpha Kanban state를 쓰지 않는다.
- 사용자가 요구하지 않은 코드를 자동 commit/push하지 않는다.
- conflict resolution을 LLM에게만 맡기지 않는다.
- mobile-first 운영 dashboard 완성은 후속 visual polish로 둔다.

## 현재 상태 요약

- `apps/server/src/codexRunner.ts`는 run을 memory `Map`에 보관하고, `.alpha-kanban/runs/{runId}.jsonl`에 event log를 쓴다.
- document run summary는 `findActiveRunForFile(fileId)` 기준으로 active run을 찾고, 같은 document에 active run이 있으면 새 run을 막는다.
- `apps/server/src/__tests__/api.test.ts`에는 "summarizes document run state and blocks a second active run" 테스트가 있고, duplicate active run은 `409 CODEX_DOCUMENT_RUN_ACTIVE`로 실패한다.
- `apps/server/src/codexState.ts`는 control repo `.alpha-kanban/state.json`에 workspace-scoped document session, recent workspace, run read state, codex defaults, runtime workspaceRoots를 저장한다.
- ticket chat, workspace chat, prompt preview, run activity UI는 이미 있으나 run queue나 scope lock 개념은 아직 없다.
- 현재 UI는 running/succeeded/failed badge와 activity timeline을 보여줄 수 있지만, project 전체 queue/supervisor view는 없다.
- `scripts/ticket-md.mjs`는 ticket id를 기준으로 status/user/note 변경을 안전하게 수행할 수 있고, legacy Progress Board에 의존하지 않는다.

## 제안 아키텍처

### 핵심 개념

- `Run Supervisor`
  - 모든 Codex run lifecycle의 source of truth.
  - queued, blocked, starting, running, cancelling, succeeded, failed, cancelled, orphaned 상태를 관리한다.
  - memory state와 persisted state를 동기화한다.

- `Run Queue`
  - 사용자가 여러 요청을 넣으면 즉시 실패시키지 않고 queue에 넣는다.
  - queue는 scope lock과 safety policy를 보고 실행 가능 여부를 판단한다.

- `Scope Lock`
  - lock scope는 최소 `workspace`, `document`, `ticket`, `chat` 단위로 둔다.
  - 같은 ticket edit run은 동시 실행 금지.
  - 같은 Markdown file edit run은 기본 동시 실행 금지.
  - read-only run은 lock을 공유할 수 있으나, provider/CLI 자원 제한에 따라 queue할 수 있다.
  - workspace-wide edit run은 project lock에 가깝게 보수적으로 처리한다.

- `Session Mapping`
  - workspace/file/ticket scope별 Codex session id를 명시적으로 저장한다.
  - 같은 scope의 후속 작업은 같은 session resume을 우선한다.
  - 다른 scope의 병렬 작업은 별도 session을 허용하되, 같은 file write lock은 공유하지 않는다.

- `Conflict-aware Markdown Writer`
  - ticket status/progress/completedAt/user instruction/progress note 변경은 LLM raw patch보다 전용 writer를 우선한다.
  - server API와 Codex prompt 모두 "ticket-md 또는 server mutation API를 사용하라"는 계약을 강화한다.
  - patch 전후 line range와 hash를 기록해 잘못된 ticket이 수정되는 일을 줄인다.

- `Alpha Kanban Self Tools`
  - Workspace Chat이 Markdown을 직접 patch하지 않고 Alpha Kanban의 안전한 tool contract를 통해 document set, ticket, run, writer를 조회/조작하게 한다.
  - 내부 tool layer를 먼저 만들고, MCP server는 같은 contract를 외부에 노출하는 adapter로 둔다.
  - 핵심 tools는 `list_document_sets`, `read_ticket`, `read_document_context`, `create_plan_ticket_docs`, `append_ticket_user_instruction`, `append_ticket_note`, `update_ticket_status`, `propose_next_tickets`, `enqueue_or_run_ticket`이다.
  - Workspace Chat은 multi-ticket 요청을 직접 장시간 edit run으로 처리하기보다 self tools로 대상과 순서를 계산하고, 필요할 때 single coordinator run 또는 scoped ticket run으로 넘긴다.

- `Autonomous Mode`
  - 사용자 명시 opt-in일 때만 동작한다.
  - 선택한 ticket이 끝나면 dependency가 충족된 READY ticket을 제안하거나 queue에 넣는다.
  - 자동 실행은 max step, time budget, permission boundary, branch/dirty state policy를 가진다.

### 실행 흐름

1. UI가 ticket chat 또는 workspace chat에서 run request를 보낸다.
2. Server가 request를 `RunIntent`로 normalize한다.
3. Workspace Chat 요청이면 Self Tools가 관련 document set, ticket, dependency, prior plan/inventory context를 조회한다.
4. Supervisor가 scope, mode, target files, lock key, session key, safety flags를 계산한다.
5. 즉시 실행 가능하면 process를 start하고, 불가능하면 queued 또는 blocked로 저장한다.
6. UI는 project-level run queue와 message-level activity를 같은 run id로 표시한다.
7. Run이 file/ticket mutation을 해야 할 때는 가능한 전용 writer/API를 사용한다.
8. Run 완료 후 supervisor가 lock release, unread result, assistant answer, next action proposal을 기록한다.
9. Autonomous mode가 켜져 있으면 다음 candidate ticket을 계산해 사용자 policy에 따라 queue하거나 제안한다.

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
```

### UI 방향

- Workspace topbar 또는 floating run center에서 project-level active/queued/failed runs를 보여준다.
- Ticket chat message는 자신이 만든 run의 activity, assistant answer, retry/delete 상태를 가진다.
- Workspace Chat도 같은 message-level run activity를 가진다.
- 빈 project에서는 Workspace Chat으로 spec grilling을 시작하고, plan/ticket/inventory 생성 요청이 primary path가 된다.
- Autonomous mode는 기본 off이며, 사용자가 "다음 READY ticket까지 진행" 같은 명시 지시를 줄 때만 켠다.

## 보안/운영 원칙

- `Edit files` run은 같은 document/ticket lock 없이는 시작하지 않는다.
- `dangerously-bypass-approvals-and-sandbox` 같은 강한 권한은 project/user setting에서 명시 opt-in으로만 전달한다.
- Queue는 사용자에게 숨겨진 자동 병렬 실행처럼 보이면 안 된다. queued, blocked, running 상태를 UI에 표시한다.
- Cancel은 process kill뿐 아니라 queue item/lock release/event append까지 포함한다.
- Server restart 후 살아있는 OS process를 확실히 추적할 수 없으면 `orphaned` 또는 `unknown` 상태로 표시하고 재시도/정리 액션을 제공한다.
- Autonomous mode는 max runs, max duration, allowed scopes, write permission policy를 가져야 한다.
- LLM이 직접 Markdown을 바꾸더라도 최종 ticket state 변경은 parser/writer validation을 통과해야 한다.

## 에러 정책

- Lock conflict: `409 RUN_SCOPE_LOCKED`, UI는 queue에 넣을지 기다릴지 선택지를 보여준다.
- Queue blocked: `blocked` 상태와 reason을 저장하고, user action이 필요한지 표시한다.
- Process spawn failure: chat message는 failed run id를 유지하고 retry/delete가 가능해야 한다.
- Server restart recovery failure: active였던 run은 `orphaned`로 표시하고 lock을 자동 release하기 전에 사용자 확인 또는 TTL 정책을 적용한다.
- Markdown stale write: file hash mismatch를 감지하고 run을 failed 또는 blocked로 전환한다.
- Writer failure: raw LLM output을 그대로 성공 처리하지 말고, failed run activity와 repair action을 남긴다.

## 검증 계획

- Unit tests:
  - lock key 계산
  - queue ordering
  - read-only/edit lock compatibility
  - session key mapping
  - self tool input/output schema
  - self tool ticket range/hash validation
  - autonomous next-ticket selection
- Server integration tests:
  - same ticket edit run queue/block
  - different ticket same file lock conflict
  - read-only concurrent policy
  - cancel releases lock
  - failed spawn does not append duplicate user instruction
  - restart/reload state recovery
- Writer tests:
  - ticket-md/server writer가 target ticket range만 수정
  - completedAt/status/progress/user/note consistency
  - stale hash rejection
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

- 첫 구현에서 queue는 자동 대기만 할지, 사용자가 "Run anyway"를 누를 수 있게 할지 결정해야 한다.
- read-only run은 같은 document에서 병렬 허용할지, CLI/provider resource 문제 때문에 1개만 허용할지 결정해야 한다.
- Server restart 후 orphaned run lock을 TTL로 자동 해제할지, 사용자 확인 후 해제할지 결정해야 한다.
- Autonomous mode가 "제안만" 할지, 사용자가 켠 동안 자동 enqueue까지 할지 정책을 정해야 한다.
- Product name `NaviDO`를 UI copy에 쓸지, 내부 roadmap codename으로만 쓸지 결정해야 한다.
