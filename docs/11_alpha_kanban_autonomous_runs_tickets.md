# Alpha Kanban Autonomous Runs 티켓

## Status

- 작성일: 2026-06-26
- 기준 문서: `docs/10_alpha_kanban_autonomous_runs_plan.md`
- 목적: 한 project 안에서 여러 Codex 요청을 안전하게 queue/lock/supervise하고, 장기적으로 "내비도"처럼 autonomous ticket progression이 가능하도록 실행 기반을 만든다.
- 범위: `apps/server`, `apps/web`, `packages/shared`, `scripts`, `docs`
- 현재 진행률: `1 / 13 tickets`

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

- 같은 ticket edit run은 동시 실행하지 않는다.
- 같은 Markdown file edit run은 기본적으로 동시 실행하지 않는다.
- read-only run과 edit run의 lock compatibility는 명시 정책으로만 허용한다.
- Queue, active run, failed run, orphaned run은 UI에 숨기지 않는다.
- Run 시작 전 실패는 Markdown `사용자 지시`에 남기지 않는다.
- Ticket status/progress/completedAt/user/note 변경은 가능한 전용 writer를 사용한다.
- plan/ticket/inventory Markdown은 canonical ledger로 유지하고, JSON/SQLite는 run 상태, queue, lock, session, cache, chat log, subagent report 같은 운영 상태에만 사용한다.
- Workspace coordinator session은 장기 기억과 plan/ticket/inventory 조율을 맡고, worker/subagent run은 구현과 검증 report만 반환한다.
- worker/subagent는 기본적으로 `*_plan.md`, `*_tickets.md`, `*_inventory.md`를 직접 수정하지 않는다. Markdown writeback은 coordinator 또는 server writer가 직렬 적용한다.
- Workspace Chat은 Alpha Kanban Self Tools를 우선 사용해 document/ticket/run을 조회/조작하고, MCP는 같은 contract의 외부 adapter로 둔다.
- Autonomous mode는 기본 off이며 사용자 명시 opt-in이 필요하다.
- Progress를 올릴 때 완료 기준/검증 체크박스도 같이 갱신한다.

## Ticket Template

새 티켓을 추가할 때는 아래 형식을 따른다.

```md
### NVD-000. Ticket Title

Status: READY
Progress: 25%
Repository:

- `apps/server`

Priority: P0
Type: Feature / API / UX / Test / Policy / Security
Depends on:

- `NVD-000`

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

### NVD-00. Autonomous run execution 원칙 확정

Status: DONE
Progress: 100%
Completed at: 2026-06-26T15:32:34+09:00
Repository:

- `docs`

Priority: P0
Type: Policy / Architecture
Depends on:

- 없음

목표:

- "내비도"처럼 놓아둬도 안전하게 굴러가는 실행 기반의 목표와 경계를 확정한다.

현재 문제:

- 현재 제품명 후보와 방향성은 autonomous 느낌을 갖지만, 실제 구현은 아직 project/document active run 제한과 수동 확인에 의존한다.
- 병렬 실행, queue, lock, autonomous next-ticket execution의 정책이 문서화되어 있지 않다.

구현 범위:

- run queue, scope lock, run supervisor, conflict-aware writer, session mapping, autonomous mode를 별도 phase로 정의한다.
- 첫 단계는 안전한 queue/lock/supervisor를 우선하고, 무제한 병렬 실행은 비목표로 둔다.
- `NVD` prefix는 가칭으로 두고, 제품명 `NaviDO`는 아직 UI rename이 아니라 roadmap codename으로만 취급한다.

제외 범위:

- 실제 코드 구현
- 제품명 rename
- provider/local model 전체 지원

완료 기준:

- [x] `docs/10_alpha_kanban_autonomous_runs_plan.md`가 생성된다.
- [x] `docs/11_alpha_kanban_autonomous_runs_tickets.md`가 생성된다.
- [x] queue/lock/supervisor/writer/session/autonomous mode가 각 구현 티켓으로 분리된다.

검증:

- [x] 계획 문서에 목표, 비목표, 현재 상태, 제안 아키텍처, 보안/운영 원칙, 에러 정책, 검증 계획이 포함된다.
- [x] 티켓 문서가 canonical field order와 top-level progress 기준을 따른다.

사용자 지시:

- 2026-06-26: `NaviDO`는 `내비도 = 놔둬`라는 의미라 재미있지만, 완전히 놔둬도 굴러가려면 run queue, scope lock, run supervisor, conflict-aware Markdown patch, session mapping, autonomous mode가 모두 필요하다.
- 2026-06-26: 이 범위는 전부 필요하므로 별도 plan/ticket으로 만든다.

진행 메모:

- 2026-06-26: 초안 작성. 현재 1 document active run 제한과 `.alpha-kanban/state.json`/`.alpha-kanban/runs/*.jsonl` 기반 상태 저장을 전제로 autonomous run phase를 분리했다.

### NVD-01. Run supervisor 상태 모델과 lifecycle 정의

Status: READY
Progress: 25%
Repository:

- `packages/shared`
- `apps/server`

Priority: P0
Type: Architecture / API
Depends on:

- `NVD-00`

목표:

- 모든 Codex run의 lifecycle을 일관되게 표현하는 supervisor 상태 모델을 만든다.

현재 문제:

- `CodexRunner` memory map과 jsonl event log가 run 상태를 담고 있지만, queue/blocked/orphaned/recovery를 표현하는 project-level source of truth가 없다.
- UI가 "이 작업이 진짜 running인지, queued인지, failed before start인지"를 일관되게 판단하기 어렵다.

구현 범위:

- shared schema에 `RunLifecycle`, `RunScope`, `RunIntent`, `RunQueueItem`, `RunLock`, `RunSupervisorSnapshot` 타입을 추가한다.
- 기존 `CodexRunSummary`와 호환되는 migration path를 정의한다.
- queued, blocked, starting, running, cancelling, succeeded, failed, cancelled, orphaned 상태 전이를 문서화하고 validation한다.
- run status와 chat message status의 관계를 명확히 한다.

제외 범위:

- 실제 queue scheduling
- UI dashboard
- autonomous next-ticket selection

완료 기준:

- [ ] run lifecycle 상태와 전이 규칙이 shared schema에 정의된다.
- [ ] 기존 run summary API가 깨지지 않는다.
- [ ] failed before start, failed after start, cancelled, orphaned 상태가 구분된다.
- [ ] schema migration 또는 fallback 정책이 문서화된다.

검증:

- [ ] `pnpm --filter @alpha-kanban/shared build`
- [ ] `pnpm --filter @alpha-kanban/server test -- codexRunner codexState`
- [ ] lifecycle transition unit test

사용자 지시:

- 2026-06-26: 1 project / 1 Codex session 제한을 넘어서려면 run queue와 supervisor가 필요하다.

진행 메모:

- 2026-06-26: 초안 작성.

### NVD-02. Persistent run supervisor store와 restart recovery

Status: READY
Progress: 25%
Repository:

- `apps/server`
- `packages/shared`

Priority: P0
Type: Feature / Reliability
Depends on:

- `NVD-01`

목표:

- WebUI 새로고침과 server restart 이후에도 run/queue/lock 상태를 복구하거나 명확히 orphaned 처리한다.
- 이 store는 operational state/cache만 담당하며, plan/ticket/inventory Markdown의 canonical source가 되지 않는다.
- server restart 직후 active run은 PID/process scan, jsonl log, Markdown 변경 내용을 기준으로 가능한 한 자동 재분류한다.

현재 문제:

- 현재 run memory map은 server process lifetime에 묶여 있다.
- `.alpha-kanban/runs/*.jsonl`은 event history는 남기지만 active process registry와 lock ownership source of truth는 아니다.
- Markdown 외부 수정이 언제든 발생할 수 있으므로 parsed cache나 store snapshot이 ticket 상태를 덮어쓰면 안 된다.
- 재부팅/서버 재시작은 보통 사고 직후 곧바로 복구되므로 PID와 command marker를 활용하면 살아있는 Codex CLI process를 상당 부분 추론할 수 있다.

구현 범위:

- `.alpha-kanban/state.json` 또는 별도 `.alpha-kanban/run-supervisor.json`에 active/queued/blocked/orphaned run metadata를 저장한다.
- 저장 대상은 run queue, lock, session mapping, chat/read state, parsed cache, retry metadata, subagent report pointer, spawned PID/command/cwd/start time/heartbeat로 제한한다.
- server boot 시 persisted run state와 jsonl log를 읽어 supervisor snapshot을 복구한다.
- server boot 시 active였던 run의 PID, command, cwd, start time, heartbeat, jsonl tail을 검사해 `running_recovered`, `finished_recovered`, `failed_unknown`, `orphaned_unknown`으로 재분류한다.
- PID가 없으면 jsonl terminal event, stdout/stderr tail, target Markdown 변경 내용과 ticket state를 보고 succeeded/failed/unknown을 재판단한다.
- 확실히 종료된 run은 terminal status로 자동 정리하고, 애매한 run만 사용자에게 release/mark failed/retry action을 제공한다.
- Markdown file hash/mtime을 cache key로 저장하고, 외부 변경 감지 시 parsed cache를 stale 처리한다.
- recovery 결과를 event log에 남긴다.

제외 범위:

- OS process 재연결 보장
- distributed/multi-server supervisor
- 외부 project repo에 state 쓰기
- ticket status/progress/user instruction/progress note의 source of truth를 JSON/SQLite로 이전
- 단순 TTL만으로 orphaned lock을 자동 release하는 정책

완료 기준:

- [ ] server restart 후 queued/finished run summary가 복구된다.
- [ ] server restart 중 active였던 run은 PID/process scan으로 running/finished/failed/orphaned 후보로 분류된다.
- [ ] PID가 없는 run은 jsonl log와 Markdown 변경 내용을 근거로 terminal status 또는 unknown으로 재판단된다.
- [ ] 확실히 종료된 run은 자동 lock release되고, 애매한 run만 사용자 확인을 요구한다.
- [ ] stale supervisor state가 UI에서 정리 가능하다.
- [ ] external Markdown change가 parsed cache를 stale 처리하고 재parse를 유도한다.
- [ ] operational store가 canonical ticket field를 Markdown보다 우선하지 않는다.

검증:

- [ ] supervisor store read/write unit test
- [ ] restart recovery integration test
- [ ] PID alive recovery test
- [ ] PID missing jsonl/Markdown recovery test
- [ ] orphaned unknown manual release test
- [ ] external Markdown cache invalidation test

사용자 지시:

- 2026-06-26: modal close나 UI refresh 때문에 running 상태를 잃어버리면 안 된다.
- 2026-06-29: Markdown 외부 수정과 sync 문제가 제품 철학 전체를 관통하므로, Markdown을 source of truth로 유지하고 JSON/SQLite는 운영 상태와 cache/report에만 사용한다.
- 2026-06-29: server restart 후에는 PID로 Codex CLI process 생존을 먼저 찾고, 못 찾으면 jsonl과 Markdown 작업 내용을 보고 상태를 재판단한다. 애매할 때만 사용자 확인으로 보낸다.

진행 메모:

- 2026-06-26: 초안 작성.

### NVD-03. Scope lock, run queue, writeback queue scheduler 구현

Status: READY
Progress: 25%
Repository:

- `apps/server`
- `packages/shared`

Priority: P0
Type: Feature / Safety
Depends on:

- `NVD-01`
- `NVD-02`

목표:

- 같은 project 안에서 여러 run 요청이 들어와도 scope conflict를 판단해 queue 또는 block한다.
- MVP에서는 read-only/edit을 가리지 않고 workspace 단위 active run 1개만 허용해 구현과 운영을 단순화한다.
- worker/subagent 실행과 coordinator Markdown writeback을 분리해 같은 Markdown 파일에 여러 writer가 동시에 접근하지 않게 한다.

현재 문제:

- 현재는 document active run이 있으면 두 번째 run을 409로 막는다.
- 사용자는 여러 chat/run 요청을 넣을 수 있지만, 어떤 것은 기다려야 하고 어떤 것은 독립 실행 가능한지 시스템이 설명하지 못한다.
- read-only끼리 병렬 실행은 이론상 가능하지만, 별도 session/process/state isolation을 제대로 갖추기 전에는 구현 복잡도와 lifecycle 꼬임 가능성이 커진다.
- worker/subagent가 구현 완료 후 바로 Markdown을 수정하면 queue가 있어도 canonical 문서 write 충돌이 다시 생긴다.

구현 범위:

- lock key 정책을 정의한다.
  - MVP: `workspace:{workspaceId}:active`
  - `workspace:{workspaceId}:edit`
  - `document:{workspaceId}:{fileId}:edit`
  - `ticket:{workspaceId}:{fileId}:{ticketId}:edit`
- MVP에서는 read-only compatibility key를 활성화하지 않고, 후속 `read-only isolated run`에서 확장한다.
- queue scheduler를 추가해 runnable item을 순서대로 start한다.
- worker run queue와 coordinator writeback queue를 구분하되, 같은 supervisor snapshot에서 상태를 보여준다.
- MVP에서는 lock conflict 시 `Run anyway`를 제공하지 않고 queued 또는 blocked 중 정책을 구분한다.
- cancel/failed/succeeded/orphaned 전환 시 lock release를 보장한다.
- Markdown writeback은 file/ticket lock을 잡은 coordinator/server writer만 수행한다.

제외 범위:

- 무제한 병렬 실행
- cross-project global resource scheduler
- provider별 rate-limit 최적화
- worker/subagent에게 Markdown canonical writer 권한 부여
- MVP에서 lock을 무시하고 같은 workspace/document/ticket에 직접 쓰는 `Run anyway`
- MVP에서 read-only끼리 병렬 실행

완료 기준:

- [ ] 같은 workspace에서는 read-only/edit 구분 없이 active run이 1개만 허용된다.
- [ ] 같은 ticket edit run은 동시에 실행되지 않는다.
- [ ] 같은 Markdown file edit run은 동시에 실행되지 않는다.
- [ ] lock conflict run은 `Run anyway` 없이 queue 또는 blocked reason을 가진다.
- [ ] lock release가 모든 terminal 상태에서 수행된다.
- [ ] queue ordering이 deterministic하다.
- [ ] worker report가 들어와도 coordinator writeback 전에는 Markdown이 변경되지 않는다.
- [ ] coordinator writeback queue가 같은 Markdown file에 대해 직렬 실행된다.

검증:

- [ ] lock compatibility unit test
- [ ] workspace single-active run test
- [ ] read-only duplicate run queue/block test
- [ ] same ticket duplicate run test
- [ ] different ticket same file conflict test
- [ ] cancel releases lock test
- [ ] worker report and coordinator writeback queue test

사용자 지시:

- 2026-06-26: 같은 Markdown 파일 안에서 티켓별 session이 같다면 병렬 실행은 lock/scope 설계가 필요하다.
- 2026-06-29: subagent는 구현과 검증을 맡고 Markdown 업데이트는 workspace coordinator가 queue로 위임받아 적용하는 방향이 적절하다.
- 2026-06-29: MVP는 `Run anyway` 없이 queue-only로 간다. 후속 `Run anyway`는 snapshot/temp worktree 기반 isolated run과 coordinator merge/writeback으로 안정성을 보장하는 방향으로 둔다.
- 2026-06-29: MVP는 단순성을 우선해 read-only끼리도 병렬 허용하지 않고 workspace 단위 active run 1개로 제한한다.

진행 메모:

- 2026-06-26: 초안 작성.

### NVD-04. Workspace coordinator와 worker session mapping 정리

Status: READY
Progress: 25%
Repository:

- `apps/server`
- `packages/shared`

Priority: P1
Type: Feature / State
Depends on:

- `NVD-01`
- `NVD-03`

목표:

- workspace coordinator, document, ticket, worker/subagent scope에 따라 Codex session/thread reuse 정책을 명확히 한다.

현재 문제:

- 현재 state store는 workspace-scoped document session을 저장하지만, ticket/workspace chat/session relationship은 queue/parallel 실행 관점에서 충분히 명시적이지 않다.
- 같은 scope는 기억을 이어가고, 다른 scope는 독립 session을 써야 하는 상황이 섞여 있다.
- project-wide 기억은 ticket 구현 worker마다 복제하기보다 workspace coordinator session에 유지하는 편이 좋다.

구현 범위:

- session key를 `workspace_coordinator`, `document`, `ticket`, `worker`, `chat` scope별로 정의한다.
- workspace coordinator session은 plan/inventory 질의, ticket 작성, spec grilling, worker orchestration, Markdown writeback 결정을 맡는다.
- worker/subagent session은 작업 시작 시점의 Markdown snapshot과 coordinator context bundle을 받아 ticket 구현/검증을 수행한다.
- run request normalize 단계에서 session key와 resume target을 결정한다.
- retry run은 previous run/session relationship을 보존한다.
- file split/subticket 생성 시 parent/child session inheritance 정책을 둔다.
- session mapping state를 migration한다.

제외 범위:

- Codex CLI session internals 변경
- provider별 native thread migration
- 오래된 모든 legacy session 완전 migration
- worker session에 장기 project memory를 강제로 유지

완료 기준:

- [ ] 같은 ticket의 후속 run은 같은 session resume을 우선한다.
- [ ] workspace chat은 project-wide coordinator session을 사용한다.
- [ ] document-level question은 document session을 사용한다.
- [ ] worker/subagent run은 coordinator context bundle과 독립 worker session을 사용할 수 있다.
- [ ] retry/delete가 session mapping을 오염시키지 않는다.
- [ ] session state가 workspace id를 포함해 cross-project collision을 피한다.

검증:

- [ ] codexState session migration test
- [ ] ticket retry session reuse test
- [ ] workspace chat session mapping test
- [ ] worker session context bundle mapping test

사용자 지시:

- 2026-06-26: 티켓별이 아니라 Markdown 파일 또는 project 단위 기억도 중요하고, session mapping은 외부 JSON state가 맞다.
- 2026-06-29: workspace session 1개는 장기 기억과 orchestration을 맡고, subagent N개는 장기 기억 없이 주입된 context로 작업하는 구조가 적절하다.

진행 메모:

- 2026-06-26: 초안 작성.

### NVD-05. Conflict-aware Markdown writer와 ticket-md tool contract

Status: READY
Progress: 25%
Repository:

- `apps/server`
- `scripts`
- `docs`

Priority: P0
Type: Feature / Safety
Depends on:

- `NVD-01`

목표:

- Codex가 긴 Markdown에서 잘못된 ticket range를 수정하는 문제를 줄이고, canonical ticket 변경은 전용 writer를 통하게 한다.
- worker/subagent report를 coordinator/server writer가 검토한 뒤 Markdown에 반영하는 writeback contract를 둔다.

현재 문제:

- LLM이 비슷한 본문 텍스트를 기준으로 patch하면 다른 ticket을 건드릴 수 있다.
- `scripts/ticket-md.mjs`는 안전한 ticket mutation을 제공하지만, server run prompt와 UI mutation contract에 충분히 통합되어 있지 않다.
- worker/subagent가 직접 Markdown을 고치면 scope lock이 있어도 coordinator가 최종 상태를 신뢰하기 어렵다.

구현 범위:

- ticket mutation API와 `ticket-md` command의 역할을 정리한다.
- Codex prompt에 "status/progress/user/note는 writer를 사용" 계약을 명시한다.
- patch 전 target ticket line range/hash를 확인하고, patch 후 target ticket과 top-level progress를 재검증한다.
- writer event를 run timeline에 남긴다.
- 실패 시 raw patch를 성공으로 취급하지 않는다.
- worker/subagent가 제안한 `suggestedTicketNote`, `suggestedStatus`, verification result를 writer input으로 받을 수 있게 한다.
- writer는 latest Markdown hash를 재확인한 뒤 canonical field/log만 직렬 변경한다.

제외 범위:

- 모든 Markdown prose edit을 writer로 대체
- Hashline 포맷 도입
- external editor plugin 개발
- worker/subagent에게 plan/ticket/inventory Markdown 직접 수정 허용

완료 기준:

- [ ] ticket status/progress/user/note 변경은 server writer 또는 `ticket-md`를 우선 사용한다.
- [ ] writer가 target ticket range와 file hash mismatch를 감지한다.
- [ ] writer 성공/실패가 run activity에 표시된다.
- [ ] Codex prompt 계약이 중복 append를 피하면서 writer 사용을 유도한다.
- [ ] worker report에서 온 note/status 제안은 coordinator/server writer를 통해서만 Markdown에 반영된다.
- [ ] external Markdown change가 있으면 writer는 stale 상태로 실패하거나 재parse 후 적용한다.

검증:

- [ ] ticket-md target range regression test
- [ ] server writer stale hash test
- [ ] Codex prompt snapshot test
- [ ] 긴 ticket document mutation smoke
- [ ] worker report writeback smoke

사용자 지시:

- 2026-06-26: Codex가 긴 Markdown에서 다른 티켓을 바꾸는 일이 반복되므로 전용 patch script/writer가 필요하다.
- 2026-06-29: Markdown을 산출물로 보고 SQLite를 별도로 운영하는 방안은 외부 Markdown 수정 sync 문제 때문에 source-of-truth로는 부적절하다.

진행 메모:

- 2026-06-26: 초안 작성.

### NVD-06. Run API 계약과 control endpoint 확장

Status: READY
Progress: 25%
Repository:

- `apps/server`
- `packages/shared`
- `apps/web`

Priority: P0
Type: API / Feature
Depends on:

- `NVD-01`
- `NVD-02`
- `NVD-03`

목표:

- UI가 run을 시작, queue, cancel, retry, delete, mark-read, inspect할 수 있는 일관된 API를 갖는다.

현재 문제:

- 현재 run API는 개별 run start/cancel/read 중심이며, project-level queue나 supervisor snapshot을 직접 표현하지 않는다.
- failed-before-start와 failed-after-chat-save 같은 상태를 사용자에게 재입력 없이 복구시키기 어렵다.

구현 범위:

- `GET /api/workspaces/:workspaceId/runs` supervisor snapshot endpoint를 추가한다.
- `POST /api/workspaces/:workspaceId/runs/:runId/cancel` 또는 기존 cancel endpoint의 workspace-aware validation을 강화한다.
- queued run retry/delete/reorder API를 정의한다.
- failed chat message retry/delete API와 run id relationship을 정리한다.
- SSE 또는 polling contract로 queue 변화와 active run 변화를 전달한다.

제외 범위:

- remote push notification
- multi-user permission model
- cross-device sync

완료 기준:

- [ ] project-level supervisor snapshot API가 있다.
- [ ] queued/blocked/running/failed/orphaned run을 API로 구분한다.
- [ ] retry는 기존 chat message를 중복 생성하지 않는다.
- [ ] delete는 안전한 상태에서만 허용된다.
- [ ] cancel은 queue item과 active process 모두에 대해 명확히 동작한다.

검증:

- [ ] API schema test
- [ ] retry/delete failed message integration test
- [ ] queued run cancel test
- [ ] supervisor SSE/polling test

사용자 지시:

- 2026-06-26: 프롬프트를 못 보낸 경우 같은 채팅을 다시 입력하면 중복이 되므로 retry/delete가 필요하다.

진행 메모:

- 2026-06-26: 초안 작성.

### NVD-07. Project Run Center와 message-level activity UI

Status: TODO
Progress: 0%
Repository:

- `apps/web`

Priority: P1
Type: UX / Feature
Depends on:

- `NVD-06`

목표:

- 사용자가 project 전체 run queue와 각 chat message의 실행 상태를 한눈에 이해하게 한다.

현재 문제:

- 현재 activity 영역은 개선됐지만, run이 공통 영역인지 message별 결과인지 구분이 흐릴 수 있다.
- Workspace Chat modal을 닫으면 project-level running 상태를 놓치기 쉽다.

구현 범위:

- workspace topbar 또는 floating affordance에 project run center를 추가한다.
- active/queued/blocked/failed/orphaned run count를 보여준다.
- ticket chat과 workspace chat message는 자신이 만든 run의 activity panel을 가진다.
- 응답 전 activity는 기본 펼침, 응답 후 activity는 기본 접힘 정책을 유지한다.
- retry/delete/cancel/mark-read actions를 message/run 상태에 맞게 노출한다.

제외 범위:

- full terminal emulator
- raw chain-of-thought 표시
- mobile final polish

완료 기준:

- [ ] project-level active/queued/failed 상태가 Workspace Chat modal 밖에서도 보인다.
- [ ] 각 chat message가 연결된 run activity를 표시한다.
- [ ] queued/blocked 상태와 이유가 사용자에게 보인다.
- [ ] retry/delete/cancel button 노출 조건이 상태별로 맞다.
- [ ] modal close가 run을 kill하지 않는다는 점이 UI로 드러난다.

검증:

- [ ] `pnpm --filter @alpha-kanban/web typecheck`
- [ ] workspace chat run visual smoke
- [ ] ticket chat run visual smoke
- [ ] queue/blocked visual smoke
- [ ] retry/delete/cancel visual smoke

사용자 지시:

- 2026-06-26: 사고과정 원문이 아니라 Codex 앱처럼 진행 요약, 도구 실행, 파일 변경, 검증 흐름을 이해할 수 있게 보고 싶다.

진행 메모:

- 2026-06-26: 초안 작성.

### NVD-08. Autonomous next-ticket executor 정책과 구현

Status: TODO
Progress: 0%
Repository:

- `apps/server`
- `apps/web`
- `packages/shared`

Priority: P1
Type: Feature / Policy
Depends on:

- `NVD-03`
- `NVD-04`
- `NVD-05`
- `NVD-06`
- `NVD-12`

목표:

- 기본 동작은 현재 ticket 완료 후 다음 실행 가능한 ticket을 제안만 하고, 사용자가 auto-enqueue를 켠 경우에만 다음 ticket을 자동 queue에 넣는다.
- autonomous 실행은 workspace coordinator가 다음 ticket을 고르고, worker/subagent가 구현한 뒤 report를 반환하며, coordinator가 Markdown writeback을 직렬 적용하는 흐름을 따른다.

현재 문제:

- 지금은 사용자가 매번 다음 ticket을 고르고 지시해야 한다.
- "놓아둬도 굴러가는" 수준에 도달하려면 dependency, status, scope, permission boundary를 보고 다음 작업을 고를 수 있어야 한다.
- 여러 ticket을 자동으로 이어 수행할수록 worker가 Markdown을 직접 수정하면 진행 기록 혼입과 stale write 위험이 커진다.
- 총 수행시간 제한을 running process hard kill로 적용하면 LLM 작업 품질과 문서 writeback 일관성을 해칠 수 있다.

구현 범위:

- next-ticket candidate selector를 만든다.
  - `Status: READY`
  - Depends on이 DONE
  - 같은 file/workspace lock 충돌 없음
  - priority/order 고려
- autonomous mode policy를 정의한다.
  - 기본: suggest-only
  - 선택 설정: auto-enqueue
  - auto-enqueue 조건: maxRuns, no-new-runs-after, allowed mode, yolo permission, dirty state, stop condition
- 시간 제한은 현재 실행 중인 run을 kill하지 않고, 제한 이후 새 run 시작만 막는다.
- stop 정책은 `stopAfterCurrent`와 emergency `cancel/hardStop`을 분리한다.
- UI에 autonomous mode enable/stop/next proposal을 표시한다.
- 실행 단위는 coordinator decision, worker/subagent run, coordinator writeback으로 분리한다.
- 각 worker report가 consume되기 전에는 다음 writeback을 시작하지 않는다.

제외 범위:

- user approval 없는 무제한 자동 commit/push
- 모든 ticket을 무조건 끝까지 수행하는 batch runner
- dependency graph visualizer 완성
- worker/subagent의 직접 Markdown 진행률 갱신

완료 기준:

- [ ] next-ticket candidate를 deterministic하게 계산한다.
- [ ] dependency 미충족 ticket은 자동 실행하지 않는다.
- [ ] 기본 동작은 suggest-only이며, auto-enqueue 설정이 없으면 자동 실행하지 않는다.
- [ ] auto-enqueue는 maxRuns와 no-new-runs-after를 새 run 시작 조건으로 적용한다.
- [ ] stop button이 active/queued autonomous runs를 정리한다.
- [ ] budget 초과 시 running run은 강제 종료하지 않고 다음 run 시작만 멈춘다.
- [ ] autonomous worker 결과는 report로 남고 coordinator writeback을 거쳐 ticket Markdown에 반영된다.
- [ ] report/writeback 충돌이 있으면 다음 자동 실행을 멈추거나 blocked로 전환한다.

검증:

- [ ] dependency candidate unit test
- [ ] autonomous suggest-only integration test
- [ ] autonomous auto-enqueue budget integration test
- [ ] stopAfterCurrent and emergency cancel integration test
- [ ] autonomous worker report/writeback integration test
- [ ] UI opt-in/stop visual smoke

사용자 지시:

- 2026-06-26: 완전히 놔둬도 굴러가려면 다음 READY ticket을 이어 진행하는 autonomous mode가 필요하다.
- 2026-06-29: 큐를 강제하고 싶은 것은 아니지만, Markdown 혼입이 없고 일이 잘 진행되는 구조가 중요하다.
- 2026-06-29: 기본 동작은 다음 ticket 제안이고, auto mode를 켜면 자동 enqueue가 가능해야 한다. 총 수행시간 제한은 running run을 중단하는 hard kill이 아니라 새 run 시작 제한으로 해석한다.

진행 메모:

- 2026-06-26: 초안 작성.

### NVD-09. Permission, persistent yolo, read-only 안전 경계 정리

Status: TODO
Progress: 0%
Repository:

- `apps/server`
- `apps/web`
- `packages/shared`

Priority: P1
Type: Security / UX / Policy
Depends on:

- `NVD-06`
- `NVD-08`

목표:

- run queue/autonomous mode에서도 read-only/edit/yolo 권한 경계가 명확히 보이고 안전하게 전달되게 한다.
- 사용자가 yolo/bypass를 한 번 기본값으로 선택하면 이후 run에서는 반복 confirm 없이 그대로 적용되게 한다.

현재 문제:

- `--dangerously-bypass-approvals-and-sandbox`는 강력한 옵션이며, autonomous mode에서 부주의하게 켜지면 위험하다.
- read-only와 edit mode는 CLI 기능 차이라기보다 Alpha Kanban prompt/permission boundary로 관리된다.
- 실제 작업에서는 yolo/bypass가 없으면 git init, dependency install, repo write 같은 기본 구현 작업도 자주 막혀 매 run confirm이 생산성을 크게 해친다.

구현 범위:

- run defaults에 model, reasoning, speed tier와 함께 permission profile을 명시적으로 저장한다.
- yolo/bypass option은 user/project-level persistent default로 저장할 수 있게 한다.
- 한 번 저장된 yolo/bypass default는 ticket chat, workspace chat, autonomous run에 반복 confirm 없이 적용한다.
- 각 composer와 run activity에는 현재 permission profile을 badge/control로 명확히 노출하고, 필요하면 즉시 끌 수 있게 한다.
- autonomous mode는 persistent permission profile을 상속하되, 별도 stop/budget/scope guard로 제어한다.
- UI composer 하단 control에서 read-only/edit/yolo 상태를 즉시 이해할 수 있게 한다.
- run prompt에 permission boundary를 분명히 넣는다.

제외 범위:

- OS sandbox 구현
- Codex CLI approval prompt 중계
- enterprise policy admin
- 매 run마다 yolo confirm modal을 띄우는 흐름

완료 기준:

- [ ] read-only/edit/yolo 상태가 run request와 persisted run metadata에 남는다.
- [ ] yolo/bypass persistent default를 저장하면 이후 run에 반복 confirm 없이 적용된다.
- [ ] persistent yolo 상태는 ticket chat, workspace chat, autonomous run UI에서 항상 식별 가능하다.
- [ ] yolo/bypass는 사용자가 composer/control에서 즉시 끌 수 있다.
- [ ] UI에서 현재 권한 프로필을 run 직전에 확인할 수 있다.
- [ ] prompt preview에 permission boundary가 포함된다.

검증:

- [ ] run defaults schema test
- [ ] prompt preview permission test
- [ ] persistent yolo default inheritance test
- [ ] autonomous yolo inherited-with-budget/scope-guard test
- [ ] composer UI smoke

사용자 지시:

- 2026-06-26: edit로 submit해도 sandbox/권한 때문에 실패할 수 있고, yolo 체크 여부와 read-only/edit 의미를 UI에서 명확히 해야 한다.
- 2026-06-29: yolo 모드는 한 번 고르면 계속 적용하고 confirm 강요를 없애는 쪽이 좋다. 실제 사용에서는 항상 부여할 수밖에 없어서 매번 확인하면 일이 안 된다.

진행 메모:

- 2026-06-26: 초안 작성.

### NVD-10. 통합 검증, 운영 문서, migration 정리

Status: TODO
Progress: 0%
Repository:

- `apps/server`
- `apps/web`
- `packages/shared`
- `docs`

Priority: P1
Type: Test / Documentation
Depends on:

- `NVD-01`
- `NVD-02`
- `NVD-03`
- `NVD-04`
- `NVD-05`
- `NVD-06`
- `NVD-07`
- `NVD-08`
- `NVD-09`
- `NVD-11`
- `NVD-12`

목표:

- autonomous run phase가 기존 multi-workspace, chat, ticket Markdown, provider harness 흐름을 깨지 않는지 검증한다.
- Markdown canonical ledger와 operational state/cache/report 분리 원칙이 end-to-end로 유지되는지 검증한다.

현재 문제:

- Queue/lock/supervisor는 API, UI, state, Codex process, Markdown writer, Self Tools를 모두 건드리므로 regression 위험이 크다.
- 운영 문서가 없으면 "왜 run이 queued/blocked/orphaned인지"를 사용자가 이해하기 어렵다.
- external Markdown edit, worker report, coordinator writeback이 섞이면 어떤 데이터가 authoritative한지 불명확해질 수 있다.

구현 범위:

- README 또는 docs에 run lifecycle, queue, lock, autonomous mode 운영 설명을 추가한다.
- 기존 run status/read-state/chat tests를 supervisor 기준으로 갱신한다.
- dogfooding checklist를 만든다.
- state migration notes를 남긴다.
- provider harness 문서와 충돌하는 부분을 연결한다.
- Alpha Kanban Self Tools와 MCP adapter 운영/설정 방법을 문서화한다.
- Markdown canonical ledger, operational store/cache, worker report, coordinator writeback의 책임 경계를 문서화한다.
- external Markdown change 후 cache invalidation과 재parse 동작을 검증한다.

제외 범위:

- release packaging
- public docs site
- third-party provider full certification
- SQLite를 canonical plan/ticket database로 승격

완료 기준:

- [ ] `pnpm typecheck`가 통과한다.
- [ ] `pnpm test`가 통과한다.
- [ ] `pnpm build`가 통과한다.
- [ ] queue/lock/supervisor manual smoke가 완료된다.
- [ ] autonomous mode manual smoke가 완료된다.
- [ ] Self Tools/MCP adapter smoke가 완료된다.
- [ ] worker report/coordinator writeback smoke가 완료된다.
- [ ] external Markdown edit 이후 cache invalidation smoke가 완료된다.
- [ ] 운영 문서가 현재 구현 상태와 일치한다.

검증:

- [ ] automated test suite
- [ ] desktop browser smoke
- [ ] server restart recovery smoke
- [ ] conflict-aware writer smoke
- [ ] worker report writeback smoke
- [ ] external Markdown cache invalidation smoke
- [ ] self tools/MCP adapter smoke
- [ ] autonomous opt-in/stop smoke
- [ ] documentation review

사용자 지시:

- 2026-06-26: "내비도"라는 이름에 맞게 놓아둬도 안전하게 굴러가려면 이번 phase 전체가 필요하다.
- 2026-06-29: Markdown 외부수정 sync 문제가 철학 전체를 관통하므로 운영 문서에서 canonical/operational 경계를 분명히 해야 한다.

진행 메모:

- 2026-06-26: 초안 작성.

### NVD-11. Alpha Kanban Self Tools와 MCP adapter 계약

Status: READY
Progress: 25%
Repository:

- `apps/server`
- `packages/shared`
- `docs`

Priority: P0
Type: Architecture / API / Tooling
Depends on:

- `NVD-01`
- `NVD-05`
- `NVD-06`
- `NVD-12`

목표:

- Workspace Chat이 Alpha Kanban 자신을 안전하게 조작할 수 있는 내부 tool contract를 만들고, 같은 contract를 MCP adapter로 노출할 수 있게 한다.
- Self Tools는 Markdown canonical ledger를 읽고 writer/writeback API를 호출하는 orchestration layer이며, operational store를 canonical ticket database처럼 취급하지 않는다.

현재 문제:

- Workspace Chat이 Markdown을 직접 읽고 수정하면 긴 문서에서 ticket 혼입이나 잘못된 patch가 발생할 수 있다.
- "모든 티켓 진행해" 같은 요청을 안전하게 다루려면 Workspace Chat이 coordinator처럼 document/ticket/run 상태를 조회하고, 필요한 작업을 scoped run 또는 writer call로 분해할 수 있어야 한다.
- MCP를 바로 구현하면 프로토콜/설정 문제에 끌려갈 수 있으므로 내부 tool contract가 먼저 필요하다.
- Self Tools가 cache/store snapshot을 Markdown보다 우선하면 외부 editor 변경과 충돌한다.

구현 범위:

- 내부 `AlphaKanbanToolRegistry` 또는 동등한 service layer를 정의한다.
- 최소 tool set을 구현한다.
  - `list_document_sets`
  - `read_document_context`
  - `read_ticket`
  - `create_plan_ticket_docs`
  - `append_ticket_user_instruction`
  - `append_ticket_note`
  - `update_ticket_status`
  - `propose_next_tickets`
  - `enqueue_or_run_ticket`
  - `record_worker_report`
  - `consume_worker_report`
- 각 tool은 workspace allowlist, docRoots, ticket range/hash validation, run permission boundary를 통과해야 한다.
- read tools는 최신 Markdown hash/mtime을 확인하고 stale cache면 재parse한다.
- mutation tools는 coordinator/server writer를 통해 canonical Markdown에 적용하며, worker/subagent report는 별도 operational record로 저장한다.
- Workspace Chat prompt/runner가 multi-ticket 또는 plan-ticketing 요청을 직접 raw patch하기 전에 self tool contract를 우선 사용하도록 한다.
- MCP server/adapter는 내부 tool registry를 감싸는 별도 entrypoint로 설계한다.
- MCP adapter가 없어도 WebUI와 server 내부 orchestration은 같은 tool contract를 사용할 수 있어야 한다.

제외 범위:

- MCP marketplace packaging
- 모든 LLM provider의 tool calling 표준화
- 외부 앱 인증/권한 모델
- raw Markdown prose editor 전체 대체
- operational store를 canonical ticket database로 노출

완료 기준:

- [ ] Self Tools의 shared schema와 server registry가 정의된다.
- [ ] Workspace Chat이 document/ticket 조회와 ticket mutation에 Self Tools를 사용할 수 있다.
- [ ] multi-ticket 요청을 tool plan 또는 scoped run list로 분해할 수 있다.
- [ ] worker report를 기록하고 coordinator writeback 대상으로 consume할 수 있다.
- [ ] stale cache가 감지되면 Self Tools가 Markdown을 재parse하거나 안전하게 실패한다.
- [ ] MCP adapter가 같은 tool registry를 노출하는 entrypoint를 가진다.
- [ ] Self Tool 실패는 run activity와 chat response에 명확히 표시된다.

검증:

- [ ] self tool schema unit test
- [ ] list/read ticket tool integration test
- [ ] ticket mutation tool stale hash/range test
- [ ] worker report record/consume tool test
- [ ] stale parsed cache reparse test
- [ ] workspace chat orchestration prompt/tool plan test
- [ ] MCP adapter smoke 또는 contract test

사용자 지시:

- 2026-06-26: Alpha Kanban 스스로를 다루는 MCP를 만들고, Workspace Chat이 이를 인지해 orchestration하게 하는 방향을 검토한다.
- 2026-06-26: 핵심은 MCP 자체보다 Alpha Kanban의 안전한 조작 API를 tool contract로 만들고 Workspace Chat이 그것을 우선 쓰게 하는 것이다. MCP는 같은 contract의 외부 노출 방식으로 둔다.
- 2026-06-29: 여러 LLM provider를 지원하려면 Codex skill에만 의존하지 않는 자체 tool/harness 계약이 필요하지만, canonical 작업 기록은 계속 Markdown이어야 한다.

진행 메모:

- 2026-06-26: 초안 작성. NVD-05 writer, NVD-06 run API, NVD-08 autonomous executor 사이를 잇는 안전한 self orchestration layer로 분리했다.

### NVD-12. Subagent report store와 coordinator writeback contract

Status: READY
Progress: 25%
Repository:

- `apps/server`
- `packages/shared`
- `docs`

Priority: P0
Type: Architecture / API / Safety
Depends on:

- `NVD-01`
- `NVD-03`
- `NVD-04`
- `NVD-05`
- `NVD-11`

목표:

- workspace coordinator가 장기 기억과 Markdown writeback을 맡고, worker/subagent는 구현과 검증 report만 반환하는 계약을 정의한다.
- Markdown canonical ledger와 operational state/report store의 책임을 분리해 외부 Markdown 수정과 병렬 writer 충돌을 줄인다.

현재 문제:

- project-wide 기억을 위해 workspace session을 오래 유지하고 싶지만, 모든 구현을 그 session이 직접 수행하면 병렬 처리와 긴 작업 분리가 어렵다.
- worker/subagent가 plan/ticket/inventory Markdown을 직접 수정하면 같은 파일의 여러 ticket 진행 메모, status, progress가 섞일 위험이 있다.
- SQLite나 JSON을 canonical ticket database로 두면 사용자가 VS Code나 Git으로 Markdown을 직접 고친 순간 sync 문제가 제품 철학 전체를 흔든다.

구현 범위:

- `WorkerReport` 또는 동등한 shared schema를 정의한다.
  - parent/coordinator run id
  - worker run id
  - target workspace/file/ticket
  - changed files
  - verification results
  - suggested ticket note/status/progress
  - failure/blocker summary
  - consumed/writeback status
- operational store에 worker report를 저장하고, coordinator가 consume/writeback 상태를 갱신할 수 있게 한다.
- worker/subagent prompt contract에 plan/ticket/inventory Markdown 직접 수정 금지와 structured report 반환 규칙을 넣는다.
- coordinator writeback prompt/tool contract에 latest Markdown reread, target ticket hash/range validation, `ticket-md`/writer 사용 규칙을 넣는다.
- report가 latest Markdown과 충돌하면 writeback을 blocked로 두고 사용자 또는 coordinator 재검토를 요구한다.

제외 범위:

- subagent의 직접 Markdown canonical write 허용
- SQLite를 plan/ticket/inventory source of truth로 승격
- 모든 code edit을 coordinator session 하나로 강제
- provider별 native subagent API 표준화

완료 기준:

- [ ] worker/subagent report schema가 shared contract로 정의된다.
- [ ] operational store가 worker report와 consume/writeback 상태를 저장한다.
- [ ] worker/subagent는 plan/ticket/inventory Markdown을 직접 수정하지 않는 prompt/tool boundary를 가진다.
- [ ] coordinator/server writer가 worker report를 읽어 canonical Markdown에 직렬 반영한다.
- [ ] external Markdown change가 있으면 report writeback은 stale/block 또는 재parse를 거친다.

검증:

- [ ] worker report schema unit test
- [ ] report store read/write test
- [ ] report consume idempotency test
- [ ] coordinator writeback stale Markdown test
- [ ] subagent no-direct-doc-write prompt snapshot test

사용자 지시:

- 2026-06-29: workspace session 1개는 plan/inventory 질의, ticket 작성, 장기 보존 기억을 맡고, subagent N개는 장기 기억 없이 주입된 Markdown/context로 구현과 검증 report만 반환하는 방향이 좋다.
- 2026-06-29: subagent가 docs를 직접 수정하면 Markdown 혼입, 순서 꼬임, progress mismatch, 중복 사용자 지시, retry/failure 복구 문제가 생길 수 있으므로 coordinator writeback으로 직렬화한다.
- 2026-06-29: Markdown 외부 수정 sync 문제가 철학 전체를 관통하므로 SQLite/JSON은 운영 상태와 cache/report로만 사용하고 Markdown을 canonical ledger로 둔다.

진행 메모:

- 2026-06-29: 초안 작성. NVD-03 queue, NVD-04 session mapping, NVD-05 writer, NVD-08 autonomous executor, NVD-11 Self Tools를 연결하는 coordinator/subagent 경계 티켓으로 분리했다.
