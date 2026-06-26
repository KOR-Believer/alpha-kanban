# Alpha Kanban Provider Harness 구현 계획 초안

작성일: 2026-06-25
수정일: 2026-06-25

## 영향 범위

대상 repository:

- `apps/server`
- `apps/web`
- `packages/shared`
- `scripts/ticket-md.mjs`
- `docs`

참고 repository:

- `~/.codex/skills/plan-ticketing`
- Codex CLI/App run behavior
- Claude Code, OpenAI-compatible API, Ollama/vLLM 계열 local model runner

이 문서는 Codex skill에 강하게 묶인 현재 실행 구조를 Alpha Kanban 고유 실행 계약으로 분리하기 위한 거시 계획이다. 코드 변경은 `docs/07_alpha_kanban_provider_harness_tickets.md`의 ticket 단위로 진행한다.

## 목표

- Alpha Kanban이 Codex CLI에만 의존하지 않고 여러 LLM provider 또는 local model runner를 붙일 수 있는 실행 구조를 만든다.
- plan/ticket/inventory 문서 처리 규칙, scope parser, run/chat log, `ticket-md` 같은 핵심 규칙을 provider 밖의 Alpha Kanban native contract로 정의한다.
- Codex CLI는 첫 번째 provider adapter로 유지하되, Codex skill 의존 규칙을 점진적으로 Alpha Kanban run contract와 deterministic tooling으로 옮긴다.
- provider별 기능 차이를 UI와 API에서 명시적으로 보여주고, 지원하지 않는 기능은 조용히 실패하지 않게 한다.
- read-only, edit files, yolo, workspaceRoots 같은 권한 boundary를 provider adapter보다 상위 orchestration 계층에서 일관되게 적용한다.

## 비목표

- 모든 provider를 한 번에 구현하지 않는다.
- Codex skill과 기존 plan-ticketing workflow를 즉시 제거하지 않는다.
- local model을 Codex/Claude 수준의 autonomous coding agent로 가정하지 않는다.
- 범용 LLM orchestration framework를 새로 만드는 것을 목표로 하지 않는다.
- provider가 지원하지 않는 tool calling, approval relay, browser control을 Alpha Kanban이 임의로 흉내내지 않는다.

## 현재 상태 요약

### 1. Codex 중심 실행 구조

- Web UI의 ticket/workspace chat은 서버가 prompt를 만들고 Codex CLI process를 실행하는 구조다.
- ticket run prompt에는 ticket file, plan file, selected ticket, resolved scope, mode, user draft, 문서 갱신 규칙이 포함된다.
- 현재 실행 기록은 `.alpha-kanban/runs/*.jsonl`에 Codex run 중심으로 남고, UI는 일부 run status와 activity를 표시한다.
- Codex CLI 실행 실패, wrapper 경로 문제, trusted directory 문제, sandbox/approval 문제는 provider-specific failure로 노출되고 있다.

### 2. plan-ticketing skill 의존

- 현재 문서 작성과 갱신 규칙은 `~/.codex/skills/plan-ticketing/SKILL.md`와 `AGENTS.md`에 크게 의존한다.
- Codex App/CLI는 skill을 읽고 prompt/tool loop에 반영할 수 있지만, 다른 provider나 local model은 같은 skill harness를 기본 제공하지 않는다.
- 따라서 여러 provider 지원을 목표로 하면 plan-ticketing 규칙을 Codex skill 내부에만 두면 안 된다.

### 3. deterministic Markdown tooling

- `scripts/ticket-md.mjs`와 `pnpm ticket-md`가 추가되어 ticket 범위 탐색, status/progress 갱신, 사용자 지시/진행 메모 append, top-level progress 계산을 deterministic하게 처리할 수 있다.
- 이 도구는 Codex가 직접 Markdown을 grep/replace하다가 잘못된 ticket 영역을 수정하는 문제를 줄이기 위한 기반이다.
- 아직 provider-neutral tool contract로 노출되지는 않았다.

### 4. UI와 run capability

- Web UI에는 workspace chat, ticket chat, read-only/edit files, yolo, model/reasoning/fast tier 설정, run activity 표시가 있다.
- provider capability catalog는 아직 Codex CLI catalog 중심이며, provider별 지원 옵션과 실패 이유가 독립 schema로 정리되어 있지 않다.

## 제안 아키텍처

### 1. Alpha Kanban Run Contract v1

Provider에게 바로 긴 prompt 문자열을 넘기지 않고, 먼저 Alpha Kanban native run contract를 만든다.

Run contract에는 다음 정보를 구조화한다.

- run id, workspace id, workspace root, selected document, selected ticket
- scope: `workspace`, `document`, `ticket`, explicit mention targets
- mode: `read-only`, `edit-files`
- permission flags: yolo, shell allowed, network allowed, write target
- document context: plan/ticket/inventory file paths, line hints, parser result, related docs
- user draft와 cleaned message
- required update policy: 사용자 지시 append 여부, 진행 메모 append 여부, DONE 처리 시 `Completed at` 규칙
- deterministic tools: `ticket-md`, file read, patch, shell, browser smoke availability
- expected output: assistant answer, file changes summary, validation summary, ticket update summary

이 contract는 JSON schema 또는 TypeScript schema로 먼저 정의하고, provider adapter가 각자 prompt, CLI args, API request로 변환한다.

### 2. Provider Adapter Boundary

Server에는 provider-neutral orchestrator와 provider-specific adapter를 분리한다.

Provider-neutral orchestrator:

- workspaceRoots 검증
- run contract 생성
- chat message 저장
- prompt preview 생성
- process lifecycle과 cancellation 정책
- run status persistence
- normalized event 저장
- ticket update preflight/postflight

Provider adapter:

- Codex CLI adapter
- Claude Code adapter
- OpenAI-compatible API adapter
- local OpenAI-compatible adapter
- future MCP/tool-enabled adapter

Adapter는 capability manifest를 제공한다.

- models
- reasoning effort
- fast/service tier
- filesystem edit support
- shell/tool execution support
- streaming support
- cancellation support
- approval relay support
- skill compatibility support

### 3. Provider-neutral Event Schema

Codex JSONL을 UI가 직접 이해하는 대신, 서버가 normalized run events로 변환한다.

권장 event type:

- `run.created`
- `prompt.prepared`
- `scope.resolved`
- `provider.started`
- `message.delta`
- `message.completed`
- `tool.started`
- `tool.completed`
- `file.changed`
- `ticket.updated`
- `validation.started`
- `validation.completed`
- `provider.failed`
- `run.cancelled`
- `run.completed`

UI는 provider 원본 형식 대신 이 normalized schema를 렌더링한다. 원본 log는 debug artifact로 보존한다.

### 4. Deterministic Tool Bridge

Provider가 직접 Markdown patch를 수행하지 않아도 되도록 Alpha Kanban이 tool bridge를 제공한다.

초기 tool bridge:

- `ticket-md check`
- `ticket-md show`
- `ticket-md status`
- `ticket-md append-user`
- `ticket-md append-note`
- workspace file read by allowed path
- scoped apply patch
- validation command runner

Codex adapter는 prompt에서 이 tool을 사용하도록 지시하고, API/local adapter는 서버가 더 강하게 tool invocation을 중계하는 구조를 검토한다.

### 5. Skill Compatibility Layer

Codex skill은 provider-neutral source of truth로 삼지 않는다.

대신 다음 레이어로 나눈다.

- Alpha Kanban native workflow pack: plan/ticket/inventory 규칙, status/progress 규칙, run contract 생성 규칙
- Codex skill export: Codex에서 사용할 수 있도록 native workflow pack을 SKILL.md 형태로 투영
- Claude/other provider prompt pack: provider가 이해하는 형태로 같은 규칙을 투영

초기에는 기존 `plan-ticketing` skill과 `AGENTS.md`를 참고하되, 장기적으로는 Alpha Kanban repository 안의 workflow pack이 기준이 된다.

### 6. UI Flow

Workspace chat과 ticket chat은 동일한 run contract 생성 파이프라인을 사용한다.

- 입력 composer는 scope token, read-only/edit, model/reasoning/fast/yolo 선택을 포함한다.
- 사용자는 provider capability mismatch를 run 전에 확인한다.
- run activity는 assistant answer와 묶여 표시되고, 응답 전에는 펼침, 응답 후에는 접힘을 기본값으로 둔다.
- 실패한 user message는 retry/delete가 가능하며, retry는 기존 message와 run id를 재사용하거나 새 run id를 연결한다.

## 보안/운영 원칙

- workspaceRoots 밖 파일 접근은 provider adapter가 아니라 server orchestrator가 먼저 차단한다.
- read-only run에서는 write tool, shell write, `ticket-md status/append-*`를 사용할 수 없다.
- yolo는 provider-specific flag가 아니라 Alpha Kanban permission intent로 저장하고, adapter가 지원하는 경우에만 해당 flag로 변환한다.
- provider binary path, API key, base URL, model catalog cache는 server config/state에 저장하되 프로젝트 문서에는 기록하지 않는다.
- run log에는 prompt, normalized events, provider stderr/stdout path를 연결하되 secret은 저장하지 않는다.
- provider adapter가 실패해도 chat message와 ticket document가 불필요하게 오염되지 않게 preflight와 postflight 순서를 분리한다.

## 에러 정책

- provider binary missing, not trusted directory, unsupported model, unsupported yolo, network unavailable은 모두 capability/preflight error로 분류한다.
- CLI process가 시작되기 전 실패하면 사용자 지시를 ticket Markdown에 append하지 않는다.
- process 시작 후 실패하면 chat에는 failed run으로 남기고, ticket 진행 메모는 provider가 실제로 문서에 쓴 경우만 보존한다.
- normalized event 변환 실패 시 원본 log path와 parse error를 UI에 노출하되 run 자체를 숨기지 않는다.
- local model이 tool use 또는 file edit를 지원하지 않으면 read-only answer mode로 downgrade하거나 run 전에 막는다.

## 검증 계획

API:

- Run Contract v1 schema validation test를 추가한다.
- Codex adapter가 같은 contract에서 기존 prompt와 동등한 실행 payload를 생성하는지 snapshot test로 확인한다.
- provider capability manifest와 model settings 저장/로드를 단위 테스트한다.
- provider startup failure가 chat/ticket Markdown을 오염시키지 않는지 regression test를 추가한다.

Web:

- workspace chat과 ticket chat이 같은 composer state와 provider capability를 사용하되 scope만 다르게 생성하는지 확인한다.
- failed/retry/delete state가 chat message와 run id를 일관되게 처리하는지 확인한다.
- activity timeline이 normalized event schema만 의존하는지 확인한다.

Manual smoke:

- Codex CLI adapter로 기존 ticket edit run을 수행한다.
- read-only workspace chat이 ticket Markdown을 수정하지 않는지 확인한다.
- provider binary missing 상태에서 user instruction이 ticket에 append되지 않는지 확인한다.
- local/OpenAI-compatible adapter spike에서는 최소 read-only answer까지 확인한다.

## Open Questions

- Alpha Kanban native workflow pack은 Markdown 문서, JSON schema, TypeScript source 중 무엇을 source of truth로 둘 것인가?
- local model adapter의 첫 범위는 read-only answer까지만 둘 것인가, server-mediated patch까지 포함할 것인가?
- Claude Code adapter를 Codex 다음으로 우선할 것인가, OpenAI-compatible/local adapter를 먼저 검증할 것인가?
- provider별 session/thread id를 document 단위로 공유할지, chat scope 단위로 분리할지 결정해야 한다.
- provider 원본 log의 retention과 redaction 정책을 어느 수준으로 둘 것인가?
